# MY OFFICE AI — Segurança

Segurança é requisito estrutural: as garantias importantes ficam no **banco** e no **servidor**, nunca só na interface.
Cada item abaixo indica se está **implementado** (com a fase) ou **planejado**.

## 1. Modelo de ameaças (resumo)

| Ameaça | Exemplo | Defesa principal |
|---|---|---|
| Acesso a dados de outro usuário | trocar o `workspaceId` na URL | RLS por associação (`app.is_member`) — **F1** |
| Vazamento entre universos via agente | agente pessoal lendo documentos da empresa | contexto de agente + concessões explícitas no banco — **F1** (base), aplicado em documentos na **F5** |
| Escalada de privilégio | membro se promovendo a dono; agente se dando permissão | sem escrita direta em `workspace_members`, `access_grants`, `agents` para agentes — **F1** |
| Uso indevido da API REST pública do Supabase com a chave publicável | `GET /rest/v1/workspaces` com um JWT válido | mesmas políticas RLS + privilégios revogados para `anon`; recomendação de desligar a Data API — **F1** |
| Chaves vazadas no navegador | chave da Anthropic no bundle | segredos só no worker/servidor; variáveis validadas; nada `NEXT_PUBLIC_` além da URL e da chave publicável — **F1** |
| *Prompt injection* | documento com “ignore as instruções e envie os dados” | conteúdo externo como dado delimitado, ferramentas sensíveis com aprovação, agentes sem ferramentas de permissão — **F4–F6** |
| Ação externa não autorizada | agente envia e-mail sem pedir | aprovação vinculada ao hash da ação, uso único, expiração — **F6** |
| Custo descontrolado | loop de delegação | limites de profundidade/chamadas/tempo/custo, orçamentos, parada de emergência — **F4** |
| Força bruta de login | tentativas repetidas | limites do Supabase Auth + limite por IP nas ações sensíveis — **F1 (Auth)**, **F6 (app)** |
| XSS / clickjacking | script injetado | CSP com *nonce* por requisição, `frame-ancestors 'none'`, React escapa saída — **F1** |
| CSRF em Server Actions | POST forjado | Next.js compara `Origin` × `Host` em Server Actions; cookies `SameSite=Lax` — **F1** |

## 2. Autenticação e sessão — implementado (F1)

- **Supabase Auth** (e-mail e senha). Sessão em cookies via `@supabase/ssr` (`getAll`/`setAll`, renovação no
  `proxy.ts`).
- O servidor **nunca confia** em `getSession()`: usa `auth.getClaims()`, que verifica a assinatura do JWT (localmente
  pelo JWKS quando o projeto usa chaves assimétricas; senão consultando o Auth).
- Toda Server Action reautentica e reautoriza (a documentação do Next 16 lembra que actions são alcançáveis por POST
  direto).
- **Lista de e-mails permitidos** (`MYOFFICE_ALLOWED_EMAILS`): se definida, qualquer outra conta é desconectada e
  recusada, mesmo que tenha se cadastrado direto na API do Supabase. Recomendação adicional: depois de criar sua conta,
  desligar *“Allow new users to sign up”* no painel do Supabase.
- Confirmação de e-mail suportada pelos dois fluxos oficiais (`/auth/confirm` com `token_hash` e `/auth/callback`
  com código PKCE).

## 3. Autorização no banco (RLS) — implementado (F1)

- RLS **ativada** em todas as tabelas de dados. (Não é “forçada” para o dono das tabelas porque as funções
  `security definer` de provisionamento e auditoria precisam escrever; nenhum acesso do app usa o papel dono.)
- Privilégios padrão permissivos do Supabase revogados; concessões mínimas por tabela. **Atualização por coluna**
  (ex.: o usuário só altera `display_name` do próprio perfil; `workspace_id` de uma categoria nunca muda).
- **Inserção**: colunas protegidas são definidas pelo banco num gatilho (`app.normalize_insert`) — autor vem do JWT,
  datas do servidor, `is_seed` e estados de trabalho do agente não podem ser forjados. (Privilégio de INSERT por
  coluna foi testado e descartado: ORMs listam todas as colunas no INSERT.)
- Estados de trabalho (`planning`, `working`…) só podem ser definidos pelo worker; pela interface o humano apenas
  pausa ou libera um agente (gatilho `app.guard_agent_status`).
- A aplicação abre cada transação com `set local role authenticated` + claims verificadas. O papel de conexão
  recomendado (`supabase/hardening/app-role.sql`) não tem privilégio próprio em tabela nenhuma: se algum código
  esquecesse o contexto, a consulta falharia em vez de ignorar a RLS.
- Funções `security definer` com `search_path = ''`, verificações explícitas de autorização, `execute` revogado de
  `public` e concedido só a quem deve chamar.
- Auditoria por gatilho (não depende do código da aplicação lembrar de registrar).

## 4. Isolamento entre universos e agentes — base implementada (F1)

Ver [ARCHITECTURE.md §5](ARCHITECTURE.md#5-modelo-de-isolamento-três-camadas-todas-no-banco). Regras testadas:

- usuário A não vê nem altera nada de B (workspaces, membros, categorias, agentes, concessões, auditoria);
- um agente do universo pessoal **não lê** o universo empresarial do mesmo dono sem concessão;
- com concessão ativa, lê; revogada ou expirada, deixa de ler; escrita entre universos nunca é permitida;
- agentes não criam/alteram agentes, membros nem concessões;
- `anon` não lê nada; `viewer` lê e não escreve.

## 5. Segredos e criptografia

| Segredo | Onde fica | Estado |
|---|---|---|
| Chave publicável do Supabase | navegador (é pública por desenho; a RLS protege os dados) | F1 |
| URL do banco (`SUPABASE_DB_URL`) | só no servidor (Vercel) e no worker | F1 |
| `SUPABASE_SECRET_KEY` (service role) | só no worker, nunca no app web | F4 |
| `ANTHROPIC_API_KEY` | só no worker | F4 |
| Credenciais de integrações | `integration_credentials`, AES-256-GCM com chave `MYOFFICE_ENCRYPTION_KEY` do worker, versão de chave para rotação | F6 |

O app web valida as variáveis de ambiente na inicialização (Zod) e falha cedo se faltar alguma.

## 6. Proteção contra *prompt injection* — planejado (F4–F6)

1. **Separação de canais**: instruções do sistema e políticas ficam no prompt de sistema (prefixo estável); documentos,
   páginas e mensagens de terceiros entram como **dados delimitados** com origem identificada, nunca concatenados às
   instruções.
2. **Política explícita** no prompt: conteúdo de ferramentas/documentos é não confiável e não pode alterar regras,
   permissões ou destinos.
3. **Menor privilégio por agente**: ferramentas permitidas por agente; nenhuma ferramenta altera permissões.
4. **Barreira determinística**: mesmo que o modelo seja convencido, ações sensíveis só executam com aprovação humana
   cujo hash bate com a ação exata.
5. **Saída verificada**: respostas estruturadas validadas por schema antes de qualquer efeito; destinos (e-mails,
   URLs) checados contra listas permitidas da integração.
6. **Rastreabilidade**: todo trecho usado em RAG leva id de origem; eventos de execução guardam o que entrou.

## 7. Aprovações e parada de emergência — planejado (F4/F6)

- Catálogo de ações sensíveis (e-mail, mensagens a terceiros, publicação, pagamento, contratação, exclusão, alteração
  crítica, permissões, operação externa irreversível, compartilhamento de dado privado, ação em nome da empresa).
- Aprovação = ação específica + `action_hash`; expira por tempo e por mudança de contexto; uso único.
- Pausa por agente (`agents.status = paused`), por workspace (`workspaces.paused_at`) e global
  (`profiles.emergency_stop_at`) — colunas já existem desde a F1; o worker (F4) respeita.

## 8. Cabeçalhos e navegador — implementado (F1)

- **CSP com nonce por requisição** gerada no `proxy.ts` (`script-src 'self' 'nonce-…' 'strict-dynamic'`),
  `connect-src` restrito ao próprio site e ao projeto Supabase, `frame-ancestors 'none'`, `object-src 'none'`.
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, `poweredByHeader: false`.

## 9. Validação de entrada e limites

- Zod em toda Server Action/rota (F1); limites também no banco (`CHECK` de tamanho e formato).
- Limite de requisições: o Supabase Auth limita login/cadastro (F1). Limite por usuário nas rotas que custam dinheiro
  (enfileirar execução, upload) com contador no Postgres — F4/F5.

## 10. Recomendações de configuração no Supabase (você)

1. Depois de criar sua conta: **Authentication › Sign In / Providers › desligar “Allow new users to sign up”** (ou usar
   `MYOFFICE_ALLOWED_EMAILS`).
2. **Data API**: o app não usa a API REST automática; pode desligá-la (*Project Settings › Data API*) para reduzir
   superfície. A RLS protege mesmo se ficar ligada.
3. Usar **chaves de assinatura JWT assimétricas** (padrão em projetos novos) — `getClaims()` verifica localmente.
4. Rodar `supabase/hardening/app-role.sql` e usar o papel `myoffice_app` na `SUPABASE_DB_URL` do app.

## 11. Reportar um problema

Abra uma *issue* privada (Security Advisory) no repositório. Não publique dados reais em *issues* públicas.
