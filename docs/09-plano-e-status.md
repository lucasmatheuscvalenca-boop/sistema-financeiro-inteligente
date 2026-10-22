# Plano, status e critérios de aceite

Situação em 21/10/2026. “Feito” significa implementado **e** coberto por teste automatizado ou verificado no navegador; o que depende de credenciais externas está marcado como tal.

## Fases

| Fase | Escopo | Status |
|---|---|---|
| 0. Pesquisa | Referências de mercado (S1NC/W1, Organizze, Mobills, YNAB), Open Finance e fornecedores | Feito ([01](01-pesquisa-de-mercado.md), [02](02-open-finance.md)) |
| 1. Fundação | Projeto, banco, migrações, autenticação, sessões, multiusuário, auditoria | Feito |
| 2. Motor financeiro | Dinheiro, datas, recorrências, cartão, razão, orçamento, caixa, metas, priorização, Posso gastar?, reserva, aposentadoria, patrimônio, alertas, gamificação, importação | Feito (119 testes unitários) |
| 3. Serviços | Casos de uso com isolamento por usuário, compartilhamento, conexões, IA | Feito (46 testes de integração) |
| 4. Interface | Design system, mascotes, onboarding, todas as telas, claro/escuro, responsivo | Feito |
| 4b. NEXO | Identidade da referência visual, nova navegação, painel com plano de hoje, metas com evolução, IA com próximos passos, cartões, relatórios, planejamento, busca, toasts, onboarding em 4 fases | Feito (10 cenários E2E; capturas desktop/celular, claro/escuro) |
| 5. IA | Ferramentas determinísticas, modo local, provedor Claude, memória | Feito; chamada real à API **não testada** (sem chave nesta entrega) |
| 6. Open Finance real | Widget do agregador, webhooks, validação | **Pendente** — depende de contrato e credenciais |
| 7. Produção | Hospedagem na Vercel e banco Neon na conta do usuário (feitos; migração do banco temporário concluída e verificada, [10](10-migracao-banco.md)), rotina de backup, monitoramento, revisão jurídica, e-mail | **Parcial** |

## Critérios de aceite

| Critério | Status | Evidência |
|---|---|---|
| Exatamente 6 mascotes, escolha explícita, nada pré-selecionado | Feito | unit “catálogo tem exatamente os seis”; integração “sem mascote pré-selecionado”; E2E jornada (0 marcados, 6 opções) |
| Mascote persiste, troca sem perda de dados, cada conta com o seu | Feito | integração “persiste a escolha…”, “trocar o mascote não apaga dados”; E2E jornada e multiusuário |
| Personalidade muda só o tom | Feito | integração “a personalidade muda o tom, mas não os fatos”; unit “a voz dos mascotes não contém valores” |
| Briefing parcial com salvamento automático e diagnóstico sem presumir | Feito | E2E jornada; diagnóstico mostra “sem dados” |
| Transferência não é receita/despesa | Feito | unit e integração |
| Compra no cartão + pagamento da fatura sem dupla contagem | Feito | unit, integração e `CHECK` no banco |
| Parcelas em faturas consecutivas somando o total | Feito | unit |
| Receita confirmada × estimada | Feito | unit e integração |
| Recorrências, orçamento com alertas e simulação | Feito | unit |
| Aporte = (alvo − acumulado) ÷ períodos pelo calendário real, prazo vencido tratado | Feito | unit “aporte necessário” |
| Rendimento separado e hipotético | Feito | unit |
| Priorização sem usar o mesmo dinheiro duas vezes (reserva primeiro) | Feito | unit e integração |
| Posso gastar? com contexto completo, explicação e alternativas como simulação | Feito | 14 unit + 3 integração + E2E |
| Reserva de emergência e aposentadoria real × nominal com 3 cenários e sensibilidade | Feito | unit |
| Patrimônio com procedência | Feito | unit |
| IA não inventa números, informa data e limitações, não executa transações | Feito | integração “o provedor só acessa dados pelas ferramentas”, “responde com dados ausentes informando a limitação” |
| Alertas com causa/impacto/ação e frequência configurável | Feito | unit e integração |
| Memória declarada × inferida, revisão e exclusão | Feito | integração (individual, exclusão do histórico); tela de memória |
| Gamificação adulta (sem premiar gasto) | Feito | unit “conquistas só premiam bons hábitos” |
| Importação CSV/OFX com deduplicação e conciliação | Feito | unit, integração e E2E |
| Conector de demonstração claramente sinalizado, consentimento e revogação | Feito | integração “conecta com consentimento…”; tela com selo DEMONSTRAÇÃO |
| Fornecedor real sem credenciais não aparece como disponível | Feito | integração |
| Nunca pedir senha bancária | Feito | por construção (contrato `BankDataProvider`) |
| Isolamento entre usuários | Feito | 6 testes de integração + E2E (404 em URL alheia) |
| Compartilhamento por meta, escopo, aceite pelo e-mail certo, revogação | Feito | integração |
| Exportação e exclusão de conta | Feito | integração “exporta e exclui todos os dados” |
| Responsivo e tema escuro | Feito | E2E (celular sem rolagem horizontal, 24 rotas no desktop, tema escuro persiste) |
| Identidade NEXO (marinho estrutural, petróleo para ação, dourado em detalhes, Inter, ícones profissionais, sem emojis) | Feito | capturas de todas as rotas em desktop/celular e claro/escuro comparadas à referência |
| Painel com dados reais, filtro de mês, variação só com base comparável | Feito | unit `daily-plan` (`percentChange`), E2E `nexo` |
| “Seu plano de hoje” por regras, com motivo e ação | Feito | 10 testes unitários de `buildDailyPlan`/`heroInsight` |
| Meta com capa, %, faltam, aporte sugerido, projeção e gráfico real + projetado | Feito | unit `goalEvolution` (4), E2E `nexo` (aporte atualiza progresso) |
| IA com próximos passos derivados dos cálculos | Feito | unit `chat-actions` (5) e descrição curta (5); E2E `nexo` (simular valor menor, lançamento preenchido) |
| Confirmação de salvamento e comemoração com o mascote | Feito | E2E `nexo` (toast após aporte, diálogo fecha) |
| Onboarding em 4 fases e seletor de mascote da referência | Feito | E2E jornada (6 rádios, nenhum marcado) |
| Open Finance com banco real | **Pendente** | requer credenciais do agregador |
| Respostas com modelo de linguagem real | **Pendente de validação** | requer `ANTHROPIC_API_KEY` |

## Testes automatizados

- **Unitários (119)** — `tests/unit`: plano de hoje e variações comparáveis; evolução da meta; ações sugeridas no assistente; dinheiro e datas; recorrências; faturas, parcelas, limite; regras contábeis; orçamento; fluxo de caixa; Posso gastar? (14 cenários); metas (aporte, simulação, diagnóstico, priorização); reserva; aposentadoria; patrimônio; análises; importação CSV/OFX e deduplicação; alertas; gamificação; catálogo e vozes dos mascotes; interpretação de perguntas no modo local.
- **Integração (46)** — `tests/integration`, contra PostgreSQL real recriado a cada execução: autenticação, sessões, limite de tentativas, troca de senha, exportação e exclusão; mascotes; movimentações, cartão e fatura, recorrências, orçamento, metas e priorização com reserva; importação e conector de demonstração; Posso gastar? com dados reais; alertas persistidos; isolamento e compartilhamento; assistente (modo local e provedor simulado, recusa e falha).
- **E2E (11)** — `tests/e2e`, Playwright sobre o build de produção: jornada completa; páginas públicas e instalação do app (termos, privacidade, manifesto, ícones, robots); login inválido; dois usuários isolados; assistente; importação CSV; layout móvel (7 rotas); layout desktop (29 rotas); tema escuro; painel + meta com aporte e toast; IA com envio direto e ações.

## Próximos passos sugeridos

1. Contratar/avaliar o agregador (ou o plano gratuito para uso pessoal), implementar o widget de conexão e os webhooks, validar em sandbox.
2. Configurar `ANTHROPIC_API_KEY` e validar respostas reais com um conjunto de perguntas de avaliação.
3. Recuperação de senha e convites por e-mail.
4. Produção: rotina de backup do banco novo com teste de restauração, monitoramento e revisão jurídica.
5. Arte dos mascotes em alta resolução (a atual vem da referência, ~120 px por personagem, ampliada) e ilustrações próprias dos 6 estados para todos os personagens.
6. Melhorias: categorização automática por regras aprendidas, metas com subprojetos, relatórios anuais e exportação CSV das movimentações.
