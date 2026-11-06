# Identidade aprovada: referências e ativos

Fonte da verdade atual: o kit “Meu Banqueiro” (`design/referencias/`).

| Arquivo | Papel |
|---|---|
| `02-dashboard-aprovado-claro.png`, `03-dashboard-aprovado-escuro.png` | Composição definitiva do Início nos dois temas |
| `00-prancha-visual-completa.png`, `01-visao-geral-assets.png` | Visão geral do personagem, avatares, poses e componentes |
| `LEIA-ME-kit.txt` | Regras do kit (usar os PNGs individuais, `object-fit: contain`, sem filtros, sem misturar outro mascote) |
| `SHA256-ativos-banqueiro.txt` | Soma de verificação de cada arquivo em `public/assets/banqueiro/` |

## Histórico do personagem

| Versão | Situação |
|---|---|
| Seis animais (até o PR #12) | Removidos |
| Banqueiro vetorial sem barba (PR #12) e com barba desenhado à mão (PR #13) | Substituídos |
| Arquivo-mestre vetorial (fase 1 desta revisão) | Descartado: o kit passou a ser a fonte do personagem |
| **Kit aprovado**: cabelo castanho ondulado, óculos, barba e bigode, colete verde, camisa branca | Em uso, sem nenhuma alteração na arte |

## Como o kit é usado

- `public/assets/banqueiro/expressoes`: neutro, análise, orientação, comemoração, atenção e alerta.
- `public/assets/banqueiro/avatares`: claro, escuro e com borda dourada.
- `public/assets/banqueiro/poses`: base, corpo inteiro, apresentação, assistente no computador, onboarding com tablet, explicação, pensando e comemorando.
- `src/mascots/banqueiro-assets.ts` lista cada arquivo com o tamanho natural e a área visível. Alguns recortes trouxeram restos da prancha (pílulas de rótulo, a mão ou a cabeça de uma pose vizinha). A área visível os esconde sem tocar na arte.
- `src/components/mascots/banqueiro-mascot.tsx` (`BanqueiroMascot`) escolhe o arquivo por `expressao`, `pose` ou `avatar` e preserva a proporção com `object-fit: contain`.

## Fases

1. Trocar o personagem e validar o Início nas quatro versões (computador e celular, claro e escuro). **Esta entrega.**
2. Depois da aprovação do Início, levar a identidade às demais telas.
