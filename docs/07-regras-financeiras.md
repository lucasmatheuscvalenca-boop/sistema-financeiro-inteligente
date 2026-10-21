# Regras e fórmulas financeiras

Todas as regras abaixo estão implementadas em `src/domain` (funções puras) e cobertas por testes em `tests/unit` e `tests/integration`. Valores em centavos inteiros; juros com `decimal.js`; datas de calendário sem fuso, com “hoje” no fuso do usuário.

## 1. Lançamentos e saldos

| Situação | Como é registrada | Entra em receitas/despesas? |
|---|---|---|
| Salário, venda, rendimento recebido | `income` numa conta | Receita |
| Compra no débito/Pix/dinheiro | `expense` numa conta | Despesa |
| Compra no cartão | `expense` no cartão, vinculada à fatura do ciclo | Despesa **na data da compra/parcela** |
| Estorno | `refund` (conta ou cartão) | Reduz a despesa |
| Transferência entre contas próprias | `transfer` (origem → destino) | **Não** |
| Pagamento da fatura | `card_payment` (conta → fatura) | **Não** — só liquida a fatura |
| Aporte em meta com conta de origem | `transfer` para a conta da meta | **Não** |

- Saldo da conta = saldo inicial + efeitos dos lançamentos **realizados** a partir da data do saldo inicial. Lançamentos anteriores ficam no histórico sem alterar o saldo.
- **Saldo livre hoje** = soma das contas com finalidade “gastos” − dinheiro já separado para metas sem conta própria.
- **Status**: `realized` (aconteceu), `scheduled` (previsto e confirmado, ex.: aluguel), `estimated` (incerto, ex.: comissão esperada). Estimados nunca entram no saldo disponível nem no “Posso gastar?”; as projeções mostram as linhas “só confirmados” e “com estimativas”.
- Toda criação, edição e exclusão gera registro em `transaction_history`.

## 2. Cartão de crédito

- Ciclo: compra com data **antes** do dia de fechamento entra na fatura que fecha naquele mês; **no dia do fechamento ou depois**, vai para a seguinte. Dias inexistentes (ex.: 31 em fevereiro) usam o último dia do mês.
- Parcelamento: N parcelas, uma por fatura consecutiva; o centavo que sobra da divisão vai para a primeira parcela, para a soma bater exatamente com o total.
- Limite disponível = limite − compras ainda não pagas (de todas as faturas abertas e futuras, incluindo parcelas).
- Status da fatura: futura, aberta, fechada, paga, parcialmente paga, vencida.

## 3. Recorrências

- Projetadas a partir da regra (semanal, quinzenal, mensal, anual, com intervalo, dia fixo e fim por data ou quantidade). Dia 31 em meses curtos vira o último dia.
- Uma ocorrência só vira lançamento ao ser confirmada (uma única vez por data — garantido por índice único).
- Ocorrências confirmadas (`scheduled`) com data passada e não lançadas aparecem como pendências; nas projeções, despesas pendentes contam hoje (prudência) e receitas pendentes não contam até serem confirmadas.

## 4. Orçamento

- Por categoria e mês, com percentual de alerta (padrão 80%).
- Comprometido = realizado + previsto da categoria no mês (subcategorias somam na categoria-mãe).
- Ritmo: projeção linear do realizado até o fim do mês para alertar antes de estourar.
- Simulação de orçamento (redução de renda, corte de categorias) não grava nada.

## 5. Metas

**Aporte necessário** (calendário real, não “meses aproximados”):

- Datas de aporte = todo dia D do mês entre hoje e o prazo (ajustado ao fim do mês).
- Sem rendimento: `aporte = ⌈(alvo − acumulado) / n⌉`, onde *n* é o número dessas datas.
- Com rendimento anual hipotético *a*: taxa mensal `i = (1 + a)^(1/12) − 1` e, avaliando no último aporte:
  `alvo = acumulado·(1+i)^m + aporte·((1+i)^n − 1)/i`, com *m* meses de hoje até o último aporte. O rendimento é sempre marcado como **hipotético**.
- Casos tratados: meta concluída; sem prazo (pede prazo ou aporte); prazo vencido (“o prazo passou”); nenhuma data de aporte antes do prazo (aporte extraordinário ou prazo maior); rendimento projetado já cobre o restante.
- Diagnóstico: no ritmo do aporte planejado, data estimada de conclusão e atraso em meses.
- Simulador: aumentar aporte, estender prazo, mudar alvo ou rendimento — compara com o cenário atual sem gravar.

**Priorização sem dupla contagem** (`allocateMonthlyCapacity`): a capacidade mensal (renda − despesa, ver §9) é distribuída em ordem:
1. reserva de emergência abaixo do mínimo;
2. prioridade declarada (1 = mais alta);
3. prazo mais próximo;
4. ordem de criação.
Cada real é alocado uma única vez; metas que ficam sem verba aparecem como conflito, com o valor que falta.

## 6. “Posso gastar?”

1. **Período analisado**: de hoje até a véspera do próximo recebimento confirmado (ou 30 dias sem receita confirmada); se a compra tiver impacto depois (cartão, parcelas), o período se estende até a véspera do recebimento seguinte ao último impacto, limitado a 120 dias.
2. **Projeção diária** do saldo livre com contas, faturas, recorrências e lançamentos previstos, com e sem a despesa, e com e sem os aportes planejados das metas.
3. **Veredito**, nesta ordem:
   - limite do cartão insuficiente → *sem limite*;
   - saldo fica negativo mesmo sem os aportes das metas → *não recomendado* (compromete contas);
   - fica negativo só com os aportes → *só cabe reduzindo aportes* (lista metas afetadas e atraso estimado);
   - fica abaixo da margem de segurança → *consome a margem*;
   - estoura o orçamento da categoria → *estoura o orçamento*;
   - caso contrário → *cabe*.
4. **Valor máximo seguro** = menor saldo projetado no período − margem de segurança, limitado pelo limite do cartão e pelo que resta no orçamento da categoria.
5. **Alternativas** (simulações, nunca aplicadas automaticamente): comprar como planejado, valor menor (até o máximo seguro ou a alternativa informada), adiar para depois do recebimento, reduzir o aporte de uma meta (com o atraso estimado) e remanejar orçamento de outra categoria com folga.
6. **Margem de segurança**: valor definido pelo usuário ou, se vazio, 10% das despesas essenciais mensais (mínimo de R$ 100).

A tela explica sempre: saldo de hoje, próximo recebimento, compromissos até lá, orçamento, metas e reserva, e lista o que falta de dado.

## 7. Reserva de emergência

- Sugestão de meses (ponto de partida explicado, o usuário decide): servidor público 3; CLT ou aposentado 6; autônomo, empresário, freelancer ou sem renda 12; renda variável +3 (mista +1); +1 por dependente (até 3); +1 se houver dívidas; máximo 24.
- Despesa essencial mensal: média realizada das categorias essenciais nos últimos 3 meses; sem histórico, o valor do briefing; ou valor informado manualmente.
- Alvo = meses × despesa essencial. Atual = **apenas contas marcadas como reserva**.
- Cobertura = atual ÷ despesa essencial (meses). Abaixo do mínimo (padrão 3 meses) → alerta importante e prioridade sobre metas de consumo.
- Aporte recomendado = ⌈falta ÷ prazo desejado⌉, limitado à capacidade mensal; cenários de 0,5×, 1×, 1,5× e 2× mostram em quantos meses completa.

## 8. Aposentadoria (termos reais)

Taxa real anual `r = (1 + nominal)/(1 + inflação) − 1`; mensal `i = (1 + r)^(1/12) − 1`. Na fase de usufruto usa-se uma taxa nominal 1 p.p. menor (mais conservadora), salvo se informada.

- Necessidade mensal = renda desejada × (1 + margem) − outras rendas (ex.: INSS).
- Patrimônio projetado: `FV = W·(1+i)^n + C·((1+i)^n − 1)/i`.
- Capital necessário: consumir até a idade-horizonte `PV = R·(1 − (1+j)^−m)/j`, ou viver de renda `PV = R/j`.
- Aporte necessário: `C* = (PV − W·(1+i)^n)·i/((1+i)^n − 1)`.
- Três cenários: conservador (retorno nominal −2 p.p.), intermediário e otimista (+2 p.p.).
- Sensibilidade: retorno ±1 p.p., inflação +1 p.p., aposentar 3 anos antes ou depois, aportar 20% a mais — com a diferença no aporte necessário.
- Custo de esperar: aporte necessário se você começar daqui a 1, 3 ou 5 anos (o patrimônio atual rende, mas sem aportes).
- Avisos: retorno real acima de 8% a.a. é otimista; retorno real ≤ 0 corrói o poder de compra; idade em que o patrimônio se esgotaria, quando antes da expectativa de vida.
- Valores nominais = reais × inflação acumulada, sempre rotulados.

## 9. Capacidade mensal

- Renda: receitas recorrentes confirmadas; senão, média realizada dos últimos 3 meses; senão, a renda do briefing.
- Despesa: a **maior** entre média realizada, soma dos orçamentos, despesas recorrentes e (sem histórico) os valores do briefing — por prudência.
- Capacidade = renda − despesa. As premissas usadas aparecem junto de cada resultado.

## 10. Patrimônio

- Itens com procedência: **confirmado** (calculado dos saldos/lançamentos ou sincronizado), **informado** (valor de mercado declarado), **estimado** (sem referência). Projeções nunca entram no patrimônio atual.
- Patrimônio líquido = contas + bens e investimentos − dívidas, com o total por procedência e a data de cada valor; fotografia mensal para o histórico.

## 11. Alertas

Gerados pelo motor a partir do retrato financeiro, cada um com **causa, impacto e ação**: risco de saldo negativo, conta ou fatura vencendo, orçamento em 80%/excedido/projetado para exceder, gasto acima do padrão, meta com prazo vencido ou em risco, aporte pendente, recorrência que ficou mais cara, reserva abaixo do mínimo, premissas da aposentadoria para revisar, dados desatualizados e conexão sem sincronizar. Não se repetem (impressão digital), podem ser dispensados e respeitam o máximo diário configurado (os importantes primeiro).

## 12. Gamificação

Premia constância e boas decisões (revisões, organização, metas, reserva, desafios voluntários). Nunca premia gastar, usar crédito ou assumir risco. Sequências semanais toleram a semana corrente ainda em andamento.
