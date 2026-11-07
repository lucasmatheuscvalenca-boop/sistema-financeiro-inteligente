# MY OFFICE AI — Roadmap

Cada fase termina com a aplicação funcionando, testes passando e um relatório (o que foi construído, o que funciona,
testes, o que falta, o que depende de você). Uma fase só é marcada como concluída depois de validar o critério.

| Fase | Status | Critério de conclusão |
|---|---|---|
| 0 — Planejamento técnico | ✅ concluída | Arquitetura, banco, segurança, roadmap e README documentados |
| 1 — Fundação | ✅ concluída e testada (inclusive contra Supabase real no CI) · ⏳ falta abrir no seu projeto Supabase na nuvem | Acessar a aplicação e alternar entre os dois universos com isolamento funcional |
| 2 — Escritório pixel art | ⏸ aguardando autorização | O escritório representa visualmente agentes e departamentos reais |
| 3 — Gerenciamento de agentes | — | Criar um agente pela interface |
| 4 — Inteligência, execução, projetos e tarefas | — | Enviar uma tarefa e receber uma entrega produzida por um agente real |
| 5 — Memória | — | Agentes consultam informações persistidas e autorizadas |
| 6 — Aprovações e ferramentas | — | Ações sensíveis ficam bloqueadas até aprovação |
| 7 — Monitoramento e otimização | — | Indicadores reais de uso, custo, desempenho e erros |
| 8 — Publicação na nuvem | — | Produção configurada, segura e testada |

## Fase 0 — Planejamento técnico ✅
- Análise do pedido e do repositório (o repositório continha o Meu Banqueiro; o MY OFFICE AI nasceu como projeto
  independente num histórico separado — ver README).
- Entregas: [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md), [SECURITY.md](SECURITY.md),
  [README.md](README.md), este roadmap e [docs/DECISIONS.md](docs/DECISIONS.md).

## Fase 1 — Fundação
- Monorepo pnpm (`apps/web`, `packages/core`, `packages/db`), Next.js 16, TypeScript estrito, Tailwind 4.
- Supabase: `config.toml`, migration de fundação com RLS, funções de isolamento, auditoria e provisionamento.
- Autenticação (cadastro, entrada, saída, confirmação de e-mail, lista de e-mails permitidos).
- Universos: workspace pessoal criado no cadastro; boas-vindas propõe a primeira empresa (Explosion Digital);
  seletor de universo; categorias (8 iniciais por universo, criar/renomear/arquivar).
- Navegação básica com os 11 módulos; os que pertencem a fases futuras mostram de forma explícita que ainda não
  existem (sem dados fictícios).
- Testes: unitários, isolamento RLS em PostgreSQL real, E2E no navegador, CI com Supabase real.

## Fase 2 — Escritório pixel art
- Tabela `office_rooms` + salas padrão (10 ambientes) por usuário; CRUD de departamentos e salas (adicionar, remover,
  renomear, reorganizar).
- Phaser 4: mapa *top-down*, salas conectadas, mobília, iluminação/sombras, personagens com animações.
- Personagens ligados a `agents` reais; comportamento visual derivado do estado real; painel ao clicar no personagem,
  na sala e (após a F4) na tarefa.
- Supabase Realtime para estados; *polling* de reserva.
- Celular: painel de agentes/tarefas em vez do mapa completo.
- **Decisões pendentes para você**: direção de arte (paleta e estilo dos personagens) — apresentarei 2–3 propostas
  antes de produzir todos os sprites.

## Fase 3 — Gerenciamento de agentes
- Perfis de agente configuráveis (`agent_profiles`): principal, especialista, subagente, revisor e novos.
- Cadastro/edição/arquivamento de agentes com todos os campos (prompt, instruções, modelo, ferramentas, fontes,
  autonomia, limites, departamento, universo, projeto, avatar).
- Permissões por agente; histórico de alterações (auditoria).

## Fase 4 — Inteligência, execução, projetos e tarefas
- `packages/ai`: interface de provedores, Anthropic (primeiro), provedor **Simulado** rotulado para desenvolvimento
  sem custo; preços e orçamento.
- `apps/worker`: fila no Postgres, *leases*, retry, timeout, cancelamento, idempotência, concorrência, recuperação.
- Coordenador por workspace, roteador por metadados, plano com aprovação, delegação com limites, revisão.
- Projetos e tarefas (Kanban, lista, por agente, por projeto), dependências, subtarefas; central de comando.
- **Depende de você**: `ANTHROPIC_API_KEY` (ou seguir só no modo simulado) e onde hospedar o worker.

## Fase 5 — Memória
- Upload (PDF, DOCX, planilhas, imagens) no Supabase Storage com políticas por workspace; extração e indexação no
  worker; busca textual + semântica (pgvector); RAG com citações; memórias por nível; referências entre documentos.
- Desenho do *companion* do Obsidian (sincronização explícita, só leitura por padrão).

## Fase 6 — Aprovações e ferramentas
- Central de aprovações (aprovar, rejeitar, pedir alteração), hash da ação, expiração, uso único.
- Central de ferramentas e integrações (status real, credenciais cifradas, permissões por agente, histórico).
- Primeiras integrações reais conforme suas credenciais (ex.: GitHub, Google Calendar, n8n).

## Fase 7 — Monitoramento e otimização
- Painel com indicadores reais (agentes, execuções, erros, aprovações, projetos, tempo, tokens, custo), filtros por
  universo, departamento, projeto, agente e período; calendário e linha do tempo de tarefas.
- Observabilidade (logs estruturados, rastreamento por execução), limites de requisição, otimizações de custo.

## Fase 8 — Publicação na nuvem
- Repositório próprio, projeto Vercel, Supabase de produção, worker em contêiner, domínio, variáveis, revisão de
  segurança e testes finais em produção.

## Decisões em aberto (precisam de você)

1. **Repositório próprio**: criar `my-office-ai` no GitHub (vazio) e adicioná-lo à sessão — eu envio este histórico
   como `main`.
2. **Projeto Supabase** (gratuito) para validar a Fase 1 na nuvem.
3. **Hospedagem do worker** (Fase 4) e **chave da Anthropic** (ou modo simulado).
4. **Uso comercial na Vercel**: o plano Hobby não permite uso comercial; para a Explosion Digital em produção, Pro.
