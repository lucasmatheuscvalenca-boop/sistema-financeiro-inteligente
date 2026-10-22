# NEXO — consultor financeiro pessoal com IA

Plataforma web de gestão financeira pessoal com a identidade visual **NEXO** (referência em `docs/referencia-visual.webp`): painel com “Seu plano de hoje”, central financeira sem dupla contagem, metas com aporte calculado pelo calendário real e gráfico de evolução, “Posso gastar?”, reserva de emergência, aposentadoria, patrimônio, relatórios, alertas com causa/impacto/ação, gamificação discreta, IA financeira que só usa números do motor de cálculo e seis mascotes selecionáveis. Versões dedicadas para desktop e celular, temas claro e escuro.

Multiusuário desde o início: cada conta tem dados, mascote, memória e histórico próprios. Compartilhamento familiar é opcional, por meta e revogável.

> No ar em **https://sistema-financeiro-inteligente.vercel.app** (Vercel + Neon Postgres). Testada com unitários, integração com PostgreSQL real e E2E no navegador — veja [Limitações e próximos passos](#limitações-e-próximos-passos).

## Funcionalidades

| Área | O que existe |
|---|---|
| Conta e segurança | Cadastro, login, sessões em cookie httpOnly, limite de tentativas, troca de senha, encerramento de sessões, exportação de dados (JSON) e exclusão de conta |
| Painel | Saudação, filtro de mês, leitura do mascote, KPIs com variação só sobre base comparável (saldo disponível, receitas, despesas, patrimônio), “Seu plano de hoje” gerado por regras (com motivo e botão), progresso das metas, receitas × despesas, previsão de fechamento, contas a pagar, orçamento, faturas e pergunta rápida à IA |
| Mascotes | Lince, Capivara, Coruja, Polvo, Raposa e Guardião (arte da referência); escolha explícita (nada pré-selecionado), prévia dos 6 estados, troca em Configurações sem perda de dados; expressão aplicada no painel, metas, chat, toasts e conquistas; a personalidade muda só o tom |
| Onboarding | Cadastro → escolha do mascote → briefing financeiro em 3 partes (salvamento automático) → primeiro acesso com diagnóstico inicial |
| Central financeira | Contas, cartões, faturas e limites; receitas, despesas, estornos, transferências; parcelamentos; recorrências; categorias e subcategorias; busca e filtros; edição com histórico; orçamento por categoria com alertas; fluxo de caixa diário (confirmado × com estimativas); importação CSV/OFX com prévia, deduplicação e conciliação |
| Planejamento | Metas com capa por tipo, acumulado, %, faltam, aporte mensal sugerido, projeção de conclusão e gráfico de evolução (real + projetado), abas Evolução/Simulações/Detalhes, pausar/concluir/arquivar e priorização sem usar o mesmo dinheiro duas vezes; reserva de emergência; patrimônio com procedência; aposentadoria em termos reais com 3 cenários e sensibilidade; relatórios de 12 meses com exportação CSV |
| Decisão | “Posso gastar?” com veredito, 6 pontos de explicação, valor máximo seguro e alternativas (todas simulações) |
| Inteligência | Assistente com ferramentas determinísticas (Claude quando há chave; modo local por regras quando não há) e próximos passos clicáveis derivados dos cálculos (simular valor menor, ver impacto na meta, ajustar orçamento, registrar mesmo assim), alertas com frequência configurável, memória contextual declarada × inferida, revisão periódica, conquistas, missões e desafios voluntários |
| Open Finance | Conector de demonstração (dados fictícios, sempre sinalizados) com consentimento, sincronização, revogação e exclusão; adaptador Pluggy implementado mas **não validado** sem credenciais |

## Rodar no seu computador (Windows, macOS ou Linux)

1. Instale o [Git](https://git-scm.com/downloads) e o [Node.js 22 LTS](https://nodejs.org/). Depois, no terminal (no Windows, o PowerShell):
   ```bash
   npm install -g pnpm
   git clone -b claude/personal-finance-ai-platform-q1ket5 https://github.com/lucasmatheuscvalenca-boop/sistema-financeiro-inteligente.git
   cd sistema-financeiro-inteligente
   pnpm install
   pnpm setup:local
   ```
2. O `pnpm setup:local` cria o `.env`, gera a chave de cifragem e pede o banco. Cole no `.env` o `DATABASE_URL`:
   - **mais simples**: o mesmo banco Neon do site (Vercel › projeto › Storage › banco › aba “.env.local” › `DATABASE_URL`) — atenção: aí você mexe nos dados reais do site;
   - **separado**: um PostgreSQL local (comando Docker mais abaixo) ou um *branch* de desenvolvimento no Neon.
3. Rode `pnpm setup:local` de novo (testa a conexão e cria as tabelas) e depois `pnpm dev`. Abra http://localhost:3000.

## Publicação (Vercel)

- Projeto `sistema-financeiro-inteligente` na Vercel, framework Next.js, configurado por `vercel.json`. As funções rodam em Washington (`iad1`), ao lado do banco Neon (`us-east-1`): cada página faz várias consultas, e servidor e banco próximos evitam somar latência a cada uma. Se o banco for recriado em São Paulo (`sa-east-1`), troque a região para `gru1`.
- O build roda `pnpm db:migrate && pnpm build`: as migrações são aplicadas automaticamente a cada publicação (usando a conexão direta do Neon, `DATABASE_URL_UNPOOLED`).
- Banco: Neon Postgres `neon-orange-umbrella`, criado pela aba Storage da Vercel na sua conta e conectado ao projeto com o prefixo `NOVO_` (variáveis sensíveis gerenciadas pela integração). O app escolhe o banco por `DATABASE_ENV_PREFIX=NOVO_`; sem o prefixo, volta ao `DATABASE_URL` antigo. Histórico, backup verificado e volta atrás em [docs/10-migracao-banco.md](docs/10-migracao-banco.md).
- Variáveis definidas no projeto: `APP_ENCRYPTION_KEY` (sensível), `APP_TIMEZONE`. Opcional: `ANTHROPIC_API_KEY` para ligar o assistente com Claude.
- Publicar uma nova versão: enviar os commits para o GitHub e criar o deploy de produção (pelo painel da Vercel, pela CLI `vercel --prod` dentro da pasta, ou pedindo ao Claude).

## Como rodar (desenvolvimento completo, com testes)

### Pré-requisitos

- Node.js 22 e pnpm 10+
- PostgreSQL 16 (local ou em contêiner), com um usuário que possa criar bancos

### Passo a passo

```bash
pnpm install
cp .env.example .env
# edite .env: DATABASE_URL, TEST_DATABASE_URL e APP_ENCRYPTION_KEY (openssl rand -base64 32)

pnpm db:setup --test     # cria rumo_dev e rumo_test e aplica as migrações
pnpm db:seed-demo        # opcional: conta de demonstração com dados fictícios
pnpm dev                 # http://localhost:3000
```

Conta de demonstração (dados 100% fictícios): `demo@rumo.exemplo` / `demonstracao-2026` (altere com `DEMO_EMAIL` e `DEMO_PASSWORD`).

Sem PostgreSQL instalado, um contêiner resolve:

```bash
docker run -d --name rumo-db -e POSTGRES_USER=rumo -e POSTGRES_PASSWORD=rumo_dev_password -p 5432:5432 postgres:16
```

### Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | Banco da aplicação |
| `TEST_DATABASE_URL` | para testes | Banco recriado a cada execução dos testes de integração e E2E (o nome precisa conter `test`) |
| `APP_ENCRYPTION_KEY` | sim | 32 bytes em base64; cifra identificadores de conexões bancárias (AES-256-GCM) |
| `APP_TIMEZONE` | não | Fuso padrão de “hoje” (padrão `America/Sao_Paulo`; cada usuário pode mudar o seu) |
| `ANTHROPIC_API_KEY` | não | Liga o assistente com Claude. Sem ela, o assistente roda em modo local |
| `ANTHROPIC_MODEL` | não | Modelo do assistente (padrão `claude-opus-5-5`) |
| `PLUGGY_CLIENT_ID` / `PLUGGY_CLIENT_SECRET` | não | Credenciais do agregador Pluggy (exige contrato; fluxo ainda não validado) |
| `COOKIE_SECURE` | não | `false` permite cookie de sessão sem HTTPS (apenas para testes locais do build de produção) |

### Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` / `pnpm start` | Build e servidor de produção |
| `pnpm typecheck` | TypeScript estrito |
| `pnpm lint` | ESLint (regras do Next.js) |
| `pnpm test` | Testes unitários do motor financeiro |
| `pnpm test:integration` | Serviços, autenticação, isolamento e IA contra PostgreSQL real |
| `pnpm test:all` | Unitários + integração |
| `pnpm test:e2e` | Playwright: faz o build, sobe o app no banco de teste e testa no navegador |
| `pnpm db:setup [--test]` | Cria o(s) banco(s) e aplica migrações |
| `pnpm db:migrate` | Aplica migrações pendentes |
| `pnpm db:generate` | Gera nova migração a partir do schema |
| `pnpm db:seed-demo` | Recria a conta de demonstração |

Nos ambientes onde o Chromium do Playwright já está instalado em outro caminho, use `PLAYWRIGHT_CHROMIUM_PATH=/caminho/do/chromium pnpm test:e2e`.

## Testes (resultado da última execução)

| Suíte | Resultado |
|---|---|
| Unitários (`tests/unit`) | 114 testes, todos passando |
| Integração (`tests/integration`) | 46 testes, todos passando |
| E2E (`tests/e2e`) | 10 cenários, todos passando (build de produção, Chromium) |
| Lint e typecheck | sem erros |

A lista do que cada suíte cobre está em [docs/09-plano-e-status.md](docs/09-plano-e-status.md).

## Estrutura

```
src/
  domain/        motor financeiro puro (sem banco): dinheiro, datas, cartão, metas, caixa, “Posso gastar?”, aposentadoria…
  server/
    db/          schema Drizzle e conexão
    services/    regras de aplicação; toda função recebe o contexto do usuário autenticado
    auth/        sessões e contexto da requisição
    security/    hash de senha, cifragem, auditoria, limite de tentativas
    ai/          ferramentas determinísticas, modo local e provedor Claude
    integrations/ contrato de fornecedor bancário, conector de demonstração e Pluggy
  mascots/       catálogo oficial e vozes
  components/    design system e componentes de tela
  app/           rotas (App Router) e ações de servidor
drizzle/         migrações SQL
scripts/         preparação do banco e seed de demonstração
tests/           unit, integration e e2e
docs/            pesquisa, arquitetura, dados, design, regras, segurança e plano
```

## Documentação

1. [Pesquisa de mercado](docs/01-pesquisa-de-mercado.md) — matriz de referências (confirmado × hipótese)
2. [Open Finance](docs/02-open-finance.md) — regras, fornecedores, o que foi implementado e o que falta
3. [Arquitetura](docs/03-arquitetura.md) — stack, camadas, custos e decisões
4. [Modelo de dados](docs/04-modelo-de-dados.md)
5. [Design system](docs/05-design-system.md)
6. [Onboarding e mascotes](docs/06-onboarding-e-mascotes.md)
7. [Regras e fórmulas financeiras](docs/07-regras-financeiras.md)
8. [Segurança e privacidade](docs/08-seguranca-e-privacidade.md)
9. [Plano, status e critérios de aceite](docs/09-plano-e-status.md)
10. [Migração do banco de produção](docs/10-migracao-banco.md)

## Limitações e próximos passos

- **Open Finance real**: depende de contrato e credenciais de um agregador (ex.: Pluggy). O adaptador existe, mas o widget de conexão e os webhooks não foram construídos nem validados. Hoje: manual, CSV/OFX e conector de demonstração.
- **IA com modelo de linguagem**: exige `ANTHROPIC_API_KEY`. Os testes cobrem o fluxo com um provedor simulado; não houve chamada real à API nesta entrega.
- **Arte dos mascotes**: vem da própria referência visual (cerca de 120 px por personagem, ampliada); fica nítida até ~150 px na tela. Só o Lince tem uma ilustração por estado; os outros cinco usam um selo de estado. Basta substituir os arquivos em `public/mascots` por arte em alta resolução (manifesto em `src/mascots/assets.ts`).
- **E-mail**: não há envio de e-mails (convites de compartilhamento são por link; não há recuperação de senha por e-mail).
- **Produção**: site e banco estão no ar; o banco temporário expira em 24/10/2026 às 22:59 UTC e será migrado para um banco Neon da conta do usuário (ver [docs/10-migracao-banco.md](docs/10-migracao-banco.md)). Faltam também backups, monitoramento, política de retenção e revisão jurídica (LGPD) antes de receber dados reais de terceiros.
