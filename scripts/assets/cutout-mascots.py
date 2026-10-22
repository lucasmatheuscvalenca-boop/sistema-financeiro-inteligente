"""Recorta os mascotes da imagem de referência com fundo transparente."""
import sys, json
from collections import deque
from PIL import Image, ImageFilter
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SRC).convert('RGB')

# id/estado -> (caixa na imagem original, limiar de fundo, regiões a pintar de branco antes)
JOBS = {
  'lince/neutral':   ((26, 606, 141, 735), 26, [(113, 606, 141, 632)]),
  'capivara/neutral':((157, 606, 276, 735), 26, []),
  'coruja/neutral':  ((293, 606, 415, 735), 26, []),
  'polvo/neutral':   ((433, 606, 555, 735), 26, []),
  'raposa/neutral':  ((572, 606, 695, 735), 26, []),
  'guardiao/neutral':((712, 606, 833, 735), 12, []),
  'lince/analysis':  ((1349, 574, 1432, 662), 26, []),
  'lince/celebration':((1436, 574, 1520, 662), 26, []),
  'lince/attention': ((1262, 684, 1342, 782), 26, []),
  'lince/alert':     ((1349, 684, 1432, 782), 26, []),
  'lince/guidance':  ((1436, 684, 1520, 782), 26, []),
}
SCALE = 3

def cut(box, thr, paint):
    c = im.crop(box).copy()
    for p in paint:
        x0, y0, x1, y1 = p[0]-box[0], p[1]-box[1], p[2]-box[0], p[3]-box[1]
        c.paste((254, 254, 254), (max(0,x0), max(0,y0), x1, y1))
    a = np.asarray(c).astype(np.float32)
    h, w, _ = a.shape
    dist = np.sqrt(((255 - a) ** 2).sum(axis=2))
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0,):
            if dist[y, x] < thr: bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if dist[y, x] < thr and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and dist[ny, nx] < thr:
                bg[ny, nx] = True; q.append((ny, nx))
    alpha = np.where(bg, 0.0, 1.0)
    # Faixa de borda: transparência proporcional à distância do branco.
    band = Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    band = (np.asarray(band) > 0) & ~bg
    soft = np.clip((dist - 6) / (thr + 40 - 6), 0, 1)
    alpha = np.where(band, np.maximum(soft, 0.0), alpha)
    # Mantém só o personagem: descarta manchas isoladas (restos de selos, bordas de cartão).
    solid = alpha > 0.4
    lab = np.zeros((h, w), np.int32); sizes = [0]; cur = 0
    for sy in range(h):
        for sx in range(w):
            if solid[sy, sx] and lab[sy, sx] == 0:
                cur += 1; cnt = 0; dq = deque([(sy, sx)]); lab[sy, sx] = cur
                while dq:
                    y, x = dq.popleft(); cnt += 1
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = y+dy, x+dx
                        if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = cur; dq.append((ny, nx))
                sizes.append(cnt)
    if cur > 1:
        keep = int(np.argmax(sizes))
        mask = Image.fromarray(((lab == keep) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
        alpha = np.where(np.asarray(mask) > 0, alpha, 0.0)
    # Recolhe a borda em 1 px: elimina a franja clara visível sobre fundos escuros.
    eroded = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))).astype(np.float32) / 255
    alpha = np.where(band | (eroded < alpha), np.minimum(alpha, eroded * 0.6 + alpha * 0.4), alpha)
    # Remove o "halo" branco: desfaz a mistura com o fundo branco.
    a3 = alpha[..., None]
    rgb = np.where(a3 > 0.01, (a - (1 - a3) * 255) / np.maximum(a3, 0.01), a)
    rgb = np.clip(rgb, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    # Upscale em pré-multiplicado para não escurecer bordas.
    pre = np.asarray(img).astype(np.float32)
    pre[..., :3] *= pre[..., 3:4] / 255
    big = Image.fromarray(pre.astype(np.uint8), 'RGBA').resize((w*SCALE, h*SCALE), Image.LANCZOS)
    b = np.asarray(big).astype(np.float32)
    al = np.maximum(b[..., 3:4], 1)
    b[..., :3] = np.clip(b[..., :3] * 255 / al, 0, 255)
    out = Image.fromarray(b.astype(np.uint8), 'RGBA')
    rgb_s = out.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
    out = Image.merge('RGBA', (*rgb_s.split(), out.split()[3]))
    bbox = out.getbbox()
    return out.crop(bbox) if bbox else out

import os
results = {}
for key, (box, thr, paint) in JOBS.items():
    out = cut(box, thr, paint)
    path = os.path.join(OUT, key + '.webp')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path, 'WEBP', quality=92, method=6)
    results[key] = out.size
print(json.dumps(results))
