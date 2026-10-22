# Segurança e privacidade

Este documento descreve os controles implementados e o que ainda falta. **Não é um parecer de conformidade**: o software foi construído com princípios da LGPD em mente, mas conformidade depende também da operação (controlador, encarregado, contratos, retenção, resposta a incidentes), que precisa de revisão jurídica antes de uso com dados de terceiros.

## Autenticação e sessões

| Controle | Implementação |
|---|---|
| Senhas | scrypt (N = 2^15, r = 8, p = 1, sal aleatório de 16 bytes), comparação em tempo constante; mínimo de 10 caracteres com letras e números |
| Sessões | token aleatório de 32 bytes em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; no banco só o SHA-256 do token; validade de 30 dias com renovação deslizante |
| Login | mensagem genérica (“E-mail ou senha incorretos”), sem revelar se o e-mail existe |
| Limites de tentativa (no banco) | login: 10 por e-mail e 50 por IP a cada 15 min; cadastro: 10 por IP por hora; assistente: 60 perguntas por usuário por hora |
| Troca de senha | exige a senha atual e encerra as outras sessões |
| Gestão de sessões | lista de sessões ativas com navegador e último uso; encerrar uma ou todas as outras |
| IP | guardado apenas como hash, para limite de tentativas e auditoria |

## Isolamento entre usuários

- O `userId` vem exclusivamente da sessão validada no servidor; nenhum formulário ou URL define de quem são os dados.
- Toda consulta filtra por `user_id`; referências a contas, cartões, categorias, metas e faturas de outro usuário resultam em “não encontrado” (não confirma a existência).
- Testes de acesso cruzado: leitura, edição, exclusão, uso de contas/cartões/categorias alheias em lançamentos, pagamento de fatura alheia, memória, conversas do assistente (integração) e acesso direto à URL de meta de outro usuário (E2E, resposta 404).
- Compartilhamento é explícito, por meta, com permissão `view` ou `contribute`, aceito apenas pela conta do e-mail convidado, com expiração (14 dias) e revogação imediata. Quem recebe vê só aquela meta e seus aportes.

## Proteção de dados

- Identificadores de conexões bancárias cifrados com AES-256-GCM (`APP_ENCRYPTION_KEY`); nunca exportados nem exibidos.
- **Nunca** se pede ou armazena senha bancária.
- Cabeçalhos HTTP: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva, `Strict-Transport-Security`; cabeçalho `X-Powered-By` removido.
- Server Actions do Next.js com verificação de origem embutida (proteção contra CSRF); cookies `SameSite=Lax`.
- Entradas validadas com zod no servidor; consultas parametrizadas (Drizzle); domínios fechados protegidos também por `CHECK` no banco.
- Logs de erro sem valores financeiros nem dados pessoais (apenas tipo e mensagem curta).
- Auditoria (`audit_log`) de eventos sensíveis: cadastro, login (sucesso e falha), troca de senha, criação/arquivamento de contas e cartões, ajuste de saldo, metas, importações, conexões (criação, revogação, exclusão), compartilhamentos, troca de mascote, limpeza de memória, exportação e exclusão de conta.

## Direitos do titular (funcionalidades)

| Direito | Onde |
|---|---|
| Acesso e portabilidade | Configurações › Privacidade e segurança › “Baixar meus dados” (JSON completo) |
| Correção | Edição de todos os cadastros, briefing e itens de memória |
| Exclusão | Itens de memória (inclusive do histórico), conversas, dados importados por conexão e a conta inteira (exige senha + confirmação; apaga tudo em cascata e mantém só um evento anônimo de exclusão) |
| Revogação de consentimento | Conexões bancárias (sincronização para imediatamente) e compartilhamentos |
| Transparência | Aviso de privacidade público em `/privacidade`; memória mostra o que é declarado e o que é inferido |

## IA e dados

- Sem `ANTHROPIC_API_KEY`: nada sai do servidor (modo local).
- Com a chave: vão ao provedor a pergunta, até 12 mensagens anteriores da conversa e os fatos formatados retornados pelas ferramentas necessárias para a resposta. Os objetos de dados brutos ficam no servidor.
- Inferências do sistema sobre o usuário ficam **pendentes** até confirmação; só itens ativos entram no contexto.
- O assistente não executa transações nem altera dados financeiros.

## Pendências antes de produção com dados reais

1. Revisão jurídica: aviso de privacidade e termos definitivos, papéis de controlador/operador, encarregado (DPO), base legal por finalidade, contrato com provedores (hospedagem, banco, IA, agregador).
2. Política de retenção e descarte (sessões expiradas, logs, conversas, contas inativas) e rotina de backup cifrado com teste de restauração.
3. Recuperação de senha por e-mail e, idealmente, segundo fator (TOTP/passkeys).
4. Content Security Policy com nonce, monitoramento de erros, alertas de segurança e plano de resposta a incidentes.
5. Teste de intrusão independente e revisão de dependências contínua.
6. Row Level Security no PostgreSQL como segunda barreira de isolamento (hoje o isolamento é na aplicação, coberto por testes).
7. Rotação da `APP_ENCRYPTION_KEY` com recifragem.
