# Open Finance e importação de transações

Data da pesquisa: 21/10/2026. Mesmo método e legenda do documento de pesquisa de
mercado ([C] confirmado, [S] fonte secundária, [H] hipótese).

## Regras do Open Finance Brasil relevantes para o produto

- [C] O compartilhamento exige consentimento ativo do cliente, vinculado a
  finalidades específicas, dado à instituição que vai receber os dados. O cliente
  pode revogar a qualquer momento (FAQ oficial do Open Finance Brasil).
- [C] Prazo de validade do consentimento compatível com a finalidade, limitado a 12
  meses segundo o FAQ oficial. [S] Uma fonte secundária afirma que hoje pode ser
  indeterminado; não confirmei em norma do BCB. O produto trata a validade como
  configurável e exibe a data de expiração recebida do fornecedor.
- [C] Quem recebe dados precisa ser instituição autorizada pelo Banco Central e
  participante do ecossistema (Resolução Conjunta nº 1/2020). Os dados só podem ser
  usados para as finalidades declaradas no consentimento.
- [C] Dados de cartão de crédito e operações de crédito estão disponíveis desde a
  fase 2; dados de investimentos (fundos, renda fixa, renda variável, Tesouro)
  entraram na fase 4 a partir de 2023.

**Consequência prática**: este app, como produto de uma pessoa física ou de uma
empresa não autorizada, **não pode acessar o Open Finance diretamente**. A via
viável é um fornecedor autorizado (agregador) que atue como receptor de dados e
repasse a informação por API, com contrato e termos próprios.

## Fornecedores avaliados

| Critério | Pluggy | Belvo | Klavi | TecnoSpeed / Celcoin |
|---|---|---|---|---|
| Regulação | [C] Afirma ser autorizada pelo BCB como ITP (Pluggy Brasil Instituição de Pagamento) | [H] não verificado | [H] não verificado | [H] não verificado |
| Cobertura | [C] fala em +130 instituições via Open Finance e +220 contando acesso direto (números da própria empresa) | [S] números variam por fonte | [S] 35 fontes (matéria antiga) | ❔ |
| Contas e transações | [C] | [C] | [C] | 🟡 |
| Cartões | [C] | [C] | [C] (fatura de cartão) | ❔ |
| Investimentos | [C] (tabela de cobertura por conector na documentação) | [C] (posições e operações) | [C] | ❔ |
| Documentação pública | [C] docs.pluggy.ai (autenticação por `POST /auth` → API key de 2 h; `POST /connect_token` → token de 30 min para o widget) | [C] developers.belvo.com | ❌ não encontrei | ❔ |
| Custo | [S] plano de dados por volta de R$ 2.500/mês; teste de 14–15 dias; "Meu Pluggy" gratuito para uso pessoal (escopo a validar) | [S] sob cotação; relato de ~R$ 6.000/mês | ❔ | [S] relato de R$ 1.500 de entrada + R$ 540/mês (TecnoSpeed) |
| Uso por apps conhecidos | ❔ | [C] Mobills | [C] Banco BV, Vivo, Renner | ❔ |

### Recomendação

1. **Uso pessoal (agora)**: avaliar o **Meu Pluggy**, que segundo fontes secundárias
   é gratuito para uso pessoal. É preciso confirmar diretamente com a Pluggy se os
   termos permitem conectar a conta da namorada e quais bancos estão incluídos.
2. **SaaS (depois)**: Pluggy ou Belvo, com contrato. Comparar custo por conexão
   ativa, SLA, frequência de atualização, webhooks e cobertura dos bancos dos
   usuários-alvo. O custo mensal fixo (R$ 1,5 mil a R$ 6 mil segundo relatos) só se
   justifica com base de usuários pagante.

## O que foi implementado

A integração foi construída em etapas, como pedido:

1. **Cadastro manual** — completo.
2. **Importação CSV e OFX** — completa, com prévia, prevenção de duplicidade
   (FITID no OFX e impressão digital data+valor+descrição) e sugestão de conciliação
   com lançamentos já existentes.
3. **Conector de demonstração** — gera dados fictícios de um "Banco Demonstração
   (fictício)". Todos os registros ficam marcados com origem `demo` e com o selo
   "DEMONSTRAÇÃO" na interface. O conector simula consentimento, sincronização,
   expiração e falhas para testar os fluxos.
4. **Adaptador Pluggy** — implementa a interface `BankDataProvider` com os
   endpoints documentados de autenticação e connect token. Os endpoints de itens,
   contas e transações seguem a estrutura pública conhecida, mas **não foram
   validados com credenciais reais**. Fica desativado até as variáveis
   `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` serem configuradas.

Na interface (`/conexoes`): as quatro etapas lado a lado, o conector de demonstração
com a lista do que será compartilhado, finalidade e validade, caixa de autorização
explícita, e para cada conexão o status, consentimento (concessão, expiração,
revogação), escopos, última sincronização, aviso de desatualização, histórico das
execuções e as ações sincronizar, revogar e apagar dados importados.

### O que falta para conectar um banco real

1. Contrato/credenciais com o agregador (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`).
2. Rota no servidor que gera o *connect token* (o adaptador já tem `createConnectToken`).
3. Embutir o widget do fornecedor na tela de conexões; ao concluir, ele devolve o
   `itemId`, que é passado para `connectProvider(ctx, "pluggy", { itemId, consentAccepted })`.
4. Webhooks do fornecedor (item atualizado, erro de login, consentimento expirado)
   chamando `syncConnection` e atualizando o status.
5. Validar os mapeamentos de contas, cartões e transações em ambiente de testes do
   fornecedor antes de liberar para usuários.

### Princípios garantidos pela arquitetura

- O app **nunca pede nem armazena senha bancária**. A autenticação no banco acontece
  no widget/fluxo do fornecedor; o app guarda só o identificador da conexão (item),
  cifrado com AES-256-GCM.
- Cada conexão tem consentimento registrado (escopos, finalidade, concessão,
  expiração, revogação). Revogar desativa a sincronização imediatamente.
- Estado visível: ativa, sincronizando, erro, expirada, revogada; data da última
  sincronização e aviso de dados desatualizados (> 24 h).
- Cada sincronização gera um registro (`bank_sync_runs`) com contagem de
  importados, duplicados e erro, para auditoria e nova tentativa.
- Trocar de fornecedor exige apenas uma nova implementação de `BankDataProvider`
  (`src/server/integrations/providers/`).

## Fontes

- Open Finance Brasil — Perguntas frequentes: https://openfinancebrasil.org.br/perguntas-frequentes/
- Open Finance Brasil — Entenda e aprenda: https://openfinancebrasil.org.br/entenda-e-aprenda/
- Resolução Conjunta nº 1/2020: https://normativos.bcb.gov.br/Lists/Normativos/Attachments/51028/Res_Conj_0001_v4_P.pdf
- Fase 4 (investimentos) — Contábeis: https://www.contabeis.com.br/noticias/61743/4a-fase-do-open-finance-inclui-compartilhamento-de-investimentos/
- Pluggy — API de Open Finance: https://www.pluggy.ai/produtos/open-finance
- Pluggy — Meu Pluggy: https://www.pluggy.ai/meu-pluggy
- Pluggy — Autenticação: https://docs.pluggy.ai/docs/authentication
- Pluggy — Cobertura de investimentos: https://docs.pluggy.ai/pt/docs/connections/investments-coverage
- Pluggy — Diretório StartupHub (preço, secundário): https://www.startuphub.ai/startups/pluggy
- Belvo — Agregação Brasil: https://developers.belvo.com/pt-br/products/aggregation_brazil/aggregation-brazil-introduction
- Comparativo de APIs na América Latina: https://www.openbankingtracker.com/open-banking-apis-latin-america
- Relato de custos (TabNews): https://www.tabnews.com.br/GuilhermeVieira/estou-desenvolvendo-um-app-de-financas-pessoais-e-nao-consigo-pagar-o-open-finance-pluggy-r2-5k-mes-belvo-r6k-mes-tecnospeed-r1-5k-de-entrada-r540
- Klavi — Finsiders: https://finsidersbrasil.com.br/negocios-em-fintechs/exclusivo-banco-bv-e-fundo-da-renner-investem-na-klavi
