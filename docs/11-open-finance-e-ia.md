# Open Finance (Meu Pluggy) e IA com Claude: passo a passo

Situação em 22/10/2026. Nenhuma credencial aparece neste documento. O que está marcado como "não confirmado" não foi possível verificar nas páginas oficiais.

## 1. Open Finance pelo Meu Pluggy

### Por que Meu Pluggy

- No Brasil, só instituições autorizadas pelo Banco Central recebem dados do Open Finance. Não existe caminho oficial gratuito direto para pessoa física: é preciso passar por um agregador.
- A Pluggy oferece o **Meu Pluggy**, portal pessoal gratuito "por tempo indeterminado", com até **5 conexões ativas do mesmo titular** (https://www.pluggy.ai/meu-pluggy). Ler os próprios dados não exige assinatura (https://meu.pluggy.ai/api-guide).
- Os planos de produção da Pluggy começam em R$ 2.500/mês, e Belvo, Klavi e afins são B2B com preço sob consulta. Para uso pessoal, o Meu Pluggy é o caminho viável.
- Limites:
  - os dados do Meu Pluggy atualizam uma vez a cada 24 horas;
  - cada pessoa (por exemplo, o casal) precisa da **própria** conta Meu Pluggy e da própria aplicação no painel, porque o plano gratuito vale para um único titular.

### Como fica no app

Em **Mais › Bancos e cartões › Conectar banco**, o botão **Conectar meus bancos** abre a janela oficial da Pluggy dentro do NEXO: a pessoa escolhe o banco, autoriza no app dele e volta com a conexão criada, sincronizada e categorizada. Não há Item ID para copiar. A autorização pode ser renovada pelo mesmo botão quando vence. Todo dia às 6h (Brasília) o NEXO sincroniza todas as conexões sozinho.

Quais bancos aparecem na janela depende do plano da Pluggy (ver abaixo): no gratuito, aparece o conector **MeuPluggy**, e a pessoa conecta os bancos primeiro no meu.pluggy.ai.

### O que você faz (uma vez)

1. Crie sua conta em https://meu.pluggy.ai e conecte seus bancos (até 5). A autorização acontece no app do banco; o NEXO nunca vê sua senha.
2. Crie uma conta em https://dashboard.pluggy.ai. Os passos 3 a 5 devem ser feitos dentro do período de teste (relatos de terceiros dizem que a lista de conectores trava depois; não confirmado).
3. No painel, em **Customize › Conectores**, ative o conector **MeuPluggy**.
4. Em **Aplicações**, crie uma **Development Application** e copie o **Client ID** e o **Client Secret**. O secret aparece uma única vez.
5. Na Vercel: projeto **sistema-financeiro-inteligente** › **Settings › Environment Variables** › adicione, em **Production**, com **Sensitive** ligado:
   - `PLUGGY_CLIENT_ID` = Client ID
   - `PLUGGY_CLIENT_SECRET` = Client Secret

   Depois, peça a nova publicação (ou faça **Redeploy**).
6. No NEXO, em **Conectar banco**, toque em **Conectar meus bancos**, escolha **MeuPluggy** e entre com o login do Meu Pluggy. Os bancos conectados lá entram de uma vez, com deduplicação e conciliação.

### O que o NEXO já faz

- Lê pela API da Pluggy: autenticação, item, contas, cartões e transações.
- Conecta pelo Item ID, com consentimento registrado e revogação.
- Importa sem duplicar, concilia com lançamentos previstos e mostra estado e última sincronização.
- Coberto por teste de integração contra uma API simulada no formato da documentação. Com as credenciais reais, falta validar as respostas de verdade; a primeira conexão real é esse teste.

### O que ainda pode ser construído

- Webhooks (`item/updated`, `transactions/*`), para atualizar na hora em vez de uma vez por dia. Não confirmado se disparam para itens do Meu Pluggy.
- Bancos reais direto na janela, sem Meu Pluggy: só no plano pago da Pluggy (Data, a partir de R$ 2.500/mês) ou durante os 15 dias de teste.

## 2. Assistente com Claude

Sem chave, o assistente funciona em **modo local**: usa as mesmas ferramentas de cálculo e não envia nada para fora. Com a chave, as respostas são escritas pelo Claude, ainda com números só do motor de cálculo.

1. Entre em https://platform.claude.com (o endereço console.anthropic.com redireciona para lá).
2. Em **Settings › Billing**, compre créditos. A API exige créditos antes do primeiro uso (https://support.claude.com/en/articles/8977456). Valor mínimo oficial não confirmado; guias de terceiros citam US$ 5.
3. Em **API Keys**, toque em **Create Key** e copie a chave na hora (ela só aparece uma vez).
4. Na Vercel: **Settings › Environment Variables** › `ANTHROPIC_API_KEY` em **Production**, com **Sensitive** ligado. `ANTHROPIC_MODEL` é opcional (padrão `claude-opus-5-5`).
5. Peça a nova publicação (ou faça **Redeploy**). No assistente, o aviso "Modo local" some.

Privacidade: com a chave ativa, a pergunta, o histórico recente da conversa e os resultados de cálculo necessários são enviados à Anthropic para gerar a resposta (veja `/privacidade`).
