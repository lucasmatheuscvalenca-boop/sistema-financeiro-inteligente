# Onboarding e O Banqueiro

## Fluxo

No topo, um indicador de 4 fases: **Cadastro → Seu banqueiro → Briefing financeiro → Primeiro acesso** (as etapas internas abaixo se agrupam nessas fases; no celular aparece “Briefing financeiro · Parte 2 de 3”).

```
Criar conta ─► Boas-vindas ─► Conheça O Banqueiro ─► Briefing (3 partes) ─► Diagnóstico inicial ─► Painel
   Cadastro   └────── Seu banqueiro ──────┘           Briefing financeiro       Primeiro acesso
                                   │                      │
                                   │                      └─ “Terminar depois”: conclui com o que houver e leva ao painel
                                   └─ obrigatório: sem a confirmação do consultor não há acesso à área logada
```

1. **Criar conta** — nome, e-mail, senha (mín. 10 caracteres, letras e números) e aceite do aviso de privacidade.
2. **Boas-vindas** — explica o que vem a seguir e que dá para parar e voltar.
3. **Conheça O Banqueiro** — apresentação do consultor único: as seis expressões para experimentar, personalidade, frase, foco e duas mensagens de exemplo na voz dele. O botão “Começar com O Banqueiro” grava a confirmação (`user_preferences.mascot_id = 'banqueiro'` e uma linha em `mascot_selections`), validada no servidor contra o catálogo e protegida por chave estrangeira no banco.
4. **Boas-vindas personalizada** — já na etapa seguinte O Banqueiro cumprimenta pelo nome (“Marina, sou o Banqueiro…”).
5. **Briefing** em três etapas, todas opcionais e com salvamento automático (rascunho a cada pausa de digitação):
   - *Sobre você*: nome preferido, ano de nascimento ou faixa etária, situação profissional, tipo de renda, composição familiar, dependentes, país/moeda, objetivos pessoais e profissionais.
   - *Situação financeira*: renda líquida, fontes e frequência, despesas essenciais e variáveis, dívidas, contas e cartões, reserva atual, investimentos, outros bens, compromissos futuros.
   - *Planos de vida*: objetivos de curto, médio e longo prazo, estilo de vida, viagens, compras, moradia, educação, independência financeira, idade e renda desejadas na aposentadoria, prioridades.
6. **Diagnóstico** — indicadores (sobra mensal, peso das despesas essenciais, comprometimento com dívidas, cobertura da reserva) com status e explicação, próximos passos e a lista do que ainda falta. Nada é presumido: campo vazio aparece como “sem dados”.

Depois do onboarding, tudo pode ser revisto em **Configurações › Meu perfil financeiro**, e objetivos declarados viram itens de memória “declarados”.

## O Banqueiro

| Nome | Título | Personalidade | Frase | Foco de comunicação |
|---|---|---|---|---|
| O Banqueiro | Seu consultor financeiro | experiente, claro, próximo, confiável | “Decisões claras hoje, liberdade amanhã.” | leitura diária das contas, decisões de gasto, metas e planejamento de longo prazo |

O catálogo (`src/mascots/catalog.ts`) tem um único id oficial, `banqueiro`. Os seis ids anteriores (`lince`, `capivara`, `coruja`, `polvo`, `raposa`, `guardiao`) continuam na tabela `mascots` e no `CHECK` do banco só para preservar o histórico de escolhas e as mensagens antigas do assistente; `normalizeMascotId` converte qualquer um deles em `banqueiro` ao ler as preferências. A migração `0006_o_banqueiro` semeia o novo registro e migra as preferências existentes.

## Arte e expressões

A arte é vetorial (`src/components/mascots/banker-art.tsx`): um consultor adulto, de terno verde-profundo, gravata e óculos dourados, desenhado em SVG para ficar nítido em qualquer tamanho e nos dois temas. Só o rosto (sobrancelhas, olhos e boca) e um selo pequeno mudam entre as expressões; o corpo é sempre o mesmo.

| Expressão | Quando aparece |
|---|---|
| Neutro | Telas informativas, configurações |
| Análise | Diagnóstico, assistente “consultando seus dados” |
| Orientação | Explicações e próximos passos |
| Comemoração | Conquista desbloqueada, meta atingida (toast comemorativo ao registrar o aporte que completa a meta) |
| Atenção | Alertas de atenção, “cabe mas consome a margem” |
| Alerta | Risco de saldo negativo, reserva abaixo do mínimo, “não recomendado” |

O Banqueiro aparece na barra lateral (área do consultor), no Início (dica ao lado do indicador principal), no detalhe das metas, no chat (com expressão por resposta), nos toasts de confirmação, nos alertas e nas conquistas. Em **Configurações › Seu banqueiro** há a apresentação completa e a grade das seis expressões. `pnpm exec tsx scripts/preview-mascots.tsx` gera uma página com todas elas nos dois temas.

## O que a voz muda (e o que não muda)

- **Muda**: saudação, abertura e fechamento das mensagens, forma de celebrar, títulos de destaque do Início, textos de estado vazio (`src/mascots/voice.ts`) e o guia de estilo enviado ao modelo de linguagem.
- **Não muda**: números, vereditos, regras, alertas, ordem de prioridade e recomendações. A voz recebe os fatos prontos do motor de cálculo. Há teste de integração que compara as respostas de duas contas com os mesmos dados e exige os mesmos valores, e teste unitário que garante que a voz não contém valores financeiros.

## Multiusuário

A confirmação do consultor é por conta: uma conta nova continua sem consultor confirmado até passar pelo primeiro acesso. Os dados, a memória e o histórico de cada conta são isolados.
