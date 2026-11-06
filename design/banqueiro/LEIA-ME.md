# O Banqueiro — arquivo-mestre e versões

Fonte visual aprovada: `design/referencias/04-banqueiro-personagem-original-referencia.png`. O personagem tem cabelo castanho-escuro curto, têmporas grisalhas, óculos redondos dourados e rosto sem barba nem bigode. A pele é em tom quente, os olhos são grandes e a expressão é amigável. Ele veste terno verde-escuro, camisa branca e gravata dourada, em ilustração 2D vetorial.

## Arquivo-mestre

`banqueiro-master.svg` é a única fonte do desenho. Ele guarda, em `<defs>`, partes nomeadas num mesmo sistema de coordenadas: largura 200, busto de y 0 a 200 e corpo até y 428.

| Grupo | Partes |
|---|---|
| Corpo | `busto`, `tronco`, `pernas` |
| Cabeça | `cabeca`, `oculos`, `nariz` |
| Expressões | `rosto-neutro`, `rosto-analise`, `rosto-orientacao`, `rosto-comemoracao`, `rosto-atencao`, `rosto-alerta` |
| Gestos | `braco-esq-queixo` (análise), `braco-esq-explica` (orientação), `braco-esq-comemora` (comemoração), `braco-esq-aceno` (onboarding), cada um com o braço superior separado |
| Braços em repouso | `braco-esq-repouso`, `braco-dir-repouso` |
| Objeto | `tablet` com `braco-dir-tablet` (assistente) |
| Ícones de estado | `icone-lupa`, `icone-lampada`, `icone-trofeu`, `icone-atencao`, `icone-alerta` |

Os braços com gesto têm duas partes. O braço superior fica atrás do busto e o antebraço com a mão fica na frente. Assim o busto esconde a junção no ombro e as seis expressões mantêm exatamente o mesmo corpo.

## Como gerar

```
pnpm banqueiro:gerar
```

O script `scripts/banqueiro/gerar-banqueiro.mjs` monta cada versão copiando as partes do arquivo-mestre e exporta:

- `public/banqueiro/*.svg`: as seis expressões e as variantes, usadas pela interface.
- `public/banqueiro/icones/*.svg`: os ícones de estado, independentes do personagem.
- `design/banqueiro/png/*.png`: as mesmas peças em PNG transparente.
- `design/banqueiro/prancha-validacao.png`: todas as peças sobre o creme e o verde-escuro.

Nenhuma peça é desenhada no gerador. Para mudar o personagem, edite só o arquivo-mestre e gere de novo.

## Expressões (PNG 1024 × 1024, fundo transparente, mesmo enquadramento)

| Arquivo | Expressão | O que muda | Ícone que a interface pode usar |
|---|---|---|---|
| `banqueiro-neutro` | Neutro | Sorriso discreto | — |
| `banqueiro-analise` | Análise | Olhar concentrado, mão no queixo | `icone-lupa` |
| `banqueiro-orientacao` | Orientação | Sorriso aberto, indicador para cima | `icone-lampada` |
| `banqueiro-comemoracao` | Comemoração | Olhos sorrindo, sorriso amplo, punho erguido | `icone-trofeu` |
| `banqueiro-atencao` | Atenção | Olhos mais abertos, sobrancelhas de preocupação | `icone-atencao` |
| `banqueiro-alerta` | Alerta | Sobrancelhas sérias, boca levemente para baixo | `icone-alerta` |

## Variantes

| Arquivo | Uso | Tamanho do PNG |
|---|---|---|
| `banqueiro-cabeca` | Retrato só da cabeça | 1024 × 1024 |
| `banqueiro-avatar` | Avatar circular, fundo creme e aro dourado | 1024 × 1024 |
| `banqueiro-meio-corpo` | Meio corpo, braços em repouso | 1024 × 1516 |
| `banqueiro-corpo-inteiro` | Corpo inteiro | 1024 × 2068 |
| `banqueiro-sidebar` | Cabeça e ombros para a barra lateral | 256 × 256 e 96 × 96 |
| `banqueiro-onboarding` | Meio corpo, acenando, sorriso de orientação | 1024 × 1516 |
| `banqueiro-assistente` | Meio corpo com tablet | 1024 × 1516 |

## Paleta do personagem

| Parte | Cor |
|---|---|
| Pele / sombra | `#C9905E` / `#B07A4C` |
| Cabelo / grisalho | `#2A1C15` / `#8C8178` |
| Terno / lapela e calça | `#0F4A3A` / `#0A3328` |
| Camisa | `#F7F5EF` |
| Gravata e detalhes | `#D4AF57` / `#B8923F` |
| Traço / boca / olho | `#1F1A17` / `#5A2A2A` / `#FFFDF8` |
