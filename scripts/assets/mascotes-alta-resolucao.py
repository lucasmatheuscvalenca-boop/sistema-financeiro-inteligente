"""Mascotes em alta resolução a partir da referência visual (docs/referencia-visual.webp).

Para cada personagem/estado: recorta a área da referência, amplia 4x com Real-ESRGAN
(modelo x4plus-anime, rodando em CPU pelo ncnn), separa do fundo com o BiRefNet (rembg) e
remove o brilho branco da borda desfazendo a mistura com o fundo da referência.

Uso (ambiente separado, não faz parte do app):
  python -m venv .venv && . .venv/bin/activate && pip install ncnn "rembg[cpu]" pillow numpy scipy
  # modelos: pasta "models" do realesrgan-ncnn-vulkan (github.com/xinntao/Real-ESRGAN, v0.2.5.0)
  python scripts/assets/mascotes-alta-resolucao.py docs/referencia-visual.webp <pasta-models> public/mascots [lince/neutral,...]
  (com pouca memória, rode um personagem/estado por vez passando a lista no último argumento)
"""
import json
import os
import sys

import ncnn
import numpy as np
from PIL import Image
from rembg import new_session, remove
from scipy import ndimage

SRC, MODELS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
VERSION = 2  # igual a ART_VERSION em src/mascots/assets.ts: nome novo evita cache da arte antiga
ONLY = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None

# id/estado -> (caixa na referência, regiões a pintar de branco antes: selos que encostam no personagem)
JOBS = {
    "lince/neutral": ((26, 606, 141, 735), [(113, 606, 141, 632)]),
    "capivara/neutral": ((157, 606, 276, 735), []),
    "coruja/neutral": ((293, 606, 415, 735), []),
    "polvo/neutral": ((433, 606, 555, 735), []),
    "raposa/neutral": ((572, 606, 695, 735), []),
    "guardiao/neutral": ((712, 606, 833, 735), []),
    "lince/analysis": ((1349, 574, 1432, 662), []),
    "lince/celebration": ((1436, 574, 1520, 662), []),
    "lince/attention": ((1262, 684, 1342, 782), []),
    "lince/alert": ((1349, 684, 1432, 782), []),
    "lince/guidance": ((1436, 684, 1520, 782), []),
}


def esrgan():
    net = ncnn.Net()
    net.opt.use_vulkan_compute = False
    net.opt.num_threads = 2
    # Em CPU, a precisão reduzida (fp16/bf16) estoura em algumas camadas e devolve ruído.
    for flag in ("use_fp16_packed", "use_fp16_storage", "use_fp16_arithmetic", "use_bf16_storage"):
        setattr(net.opt, flag, False)
    net.load_param(os.path.join(MODELS, "realesrgan-x4plus-anime.param"))
    net.load_model(os.path.join(MODELS, "realesrgan-x4plus-anime.bin"))
    return net


def upscale(net, img, tries=5):
    a = np.asarray(img.convert("RGB")).astype(np.float32) / 255.0
    plain = np.asarray(img.convert("RGB").resize((img.width * 4, img.height * 4), Image.BICUBIC)).astype(np.float32)
    # O ncnn.Mat só aponta para a memória do numpy: as duas referências precisam viver até
    # o fim da extração, senão o modelo lê memória liberada e devolve ruído.
    chw = np.ascontiguousarray(a.transpose(2, 0, 1))
    for _ in range(tries):
        mat = ncnn.Mat(chw)
        ex = net.create_extractor()
        ex.input("data", mat)
        _, out = ex.extract("output")
        big = (np.clip(np.nan_to_num(np.array(out).transpose(1, 2, 0)), 0, 1) * 255 + 0.5).astype(np.uint8)
        # Confere contra uma ampliação comum: a super-resolução só refina, não muda a imagem.
        if np.abs(big.astype(np.float32) - plain).mean() < 20:
            return Image.fromarray(big)
    raise SystemExit("ampliação instável: o resultado não confere com a imagem original")


def white_matte(rgb, t0=18.0, t1=70.0):
    """Fundo da referência é branco: tudo o que não for branco ligado à borda é personagem."""
    dist = np.sqrt(((255.0 - rgb) ** 2).sum(axis=2))
    near_white = dist < t0
    labels, _ = ndimage.label(near_white)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    background = np.isin(labels, border[border > 0])
    soft = np.clip((dist - t0) / (t1 - t0), 0.0, 1.0)
    return np.where(background, 0.0, np.maximum(soft, ndimage.binary_erosion(~background, iterations=2)))


def cutout(session, big):
    rgb = np.asarray(big.convert("RGB")).astype(np.float32)
    mask = np.asarray(remove(big, session=session, only_mask=True)).astype(np.float32) / 255.0
    # O modelo às vezes ignora objetos que o personagem segura (troféu, placa de alerta, lupa):
    # completa com o que o fundo branco revela, só fora da área que o modelo já reconheceu.
    known = ndimage.binary_dilation(mask > 0.5, iterations=6)
    mask = np.maximum(mask, np.where(known, 0.0, white_matte(rgb)))
    # Só o personagem: descarta restos de cartões e selos (componentes soltos).
    labels, n = ndimage.label(mask > 0.5)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(mask), labels, range(1, n + 1))
        keep = ndimage.binary_dilation(labels == (int(np.argmax(sizes)) + 1), iterations=3)
        mask = np.where(keep, mask, 0.0)
    # Recolhe a borda (~1 px na escala final) e endurece a transição.
    mask = np.minimum(mask, ndimage.grey_erosion(mask, size=(3, 3)) * 0.5 + mask * 0.5)
    alpha = np.clip((mask - 0.1) / 0.8, 0.0, 1.0)
    # Desfaz a mistura com o fundo branco da referência: some o contorno claro.
    a3 = alpha[..., None]
    edge = (a3 > 0.02) & (a3 < 0.98)
    fg = np.clip((rgb - (1 - a3) * 255.0) / np.maximum(a3, 0.02), 0, 255)
    rgb = np.where(edge, fg, rgb)
    out = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out


def main():
    ref = Image.open(SRC).convert("RGB")
    net = esrgan()
    session = new_session("birefnet-general-lite")
    sizes = {}
    for key, (box, paint) in JOBS.items():
        if ONLY and key not in ONLY:
            continue
        crop = ref.crop(box).copy()
        for x0, y0, x1, y1 in paint:
            crop.paste((255, 255, 255), (max(0, x0 - box[0]), max(0, y0 - box[1]), x1 - box[0], y1 - box[1]))
        img = cutout(session, upscale(net, crop))
        bw, bh = (box[2] - box[0]) * 4, (box[3] - box[1]) * 4
        if img.width < 0.55 * bw or img.height < 0.55 * bh:
            raise SystemExit(f"{key}: recorte suspeito {img.size} para uma área de {bw}x{bh}; rode de novo")
        path = os.path.join(OUT, f"{key}.v{VERSION}.webp")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, "WEBP", quality=90, alpha_quality=100, method=6)
        sizes[key] = img.size
        print(key, img.size, flush=True)
    print(json.dumps(sizes))


if __name__ == "__main__":
    main()
