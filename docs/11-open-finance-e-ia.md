# Open Finance (Meu Pluggy) e IA (Groq grátis ou Claude): passo a passo

Situação em 5/11/2026. Nenhuma credencial aparece neste documento.

## 1. Open Finance sem custo, pelo Meu Pluggy

### O que existe de graça (e o que não existe)

- No Brasil, só instituições autorizadas pelo Banco Central recebem dados do Open Finance. Não há API gratuita de dados de cliente para pessoa física: é preciso passar por um agregador ([Nortcash](https://www.nortcash.com.br/blog/api-open-finance), [Open Finance Brasil](https://openfinancebrasil.org.br/)).
- A Pluggy oferece o **Meu Pluggy**: gratuito "por tempo indeterminado", com até **5 conexões ativas, todas do mesmo titular**. Conectar contas de outras pessoas, mais de 5 conexões, ligar direto no banco sem o Meu Pluggy e usar os dados num produto para terceiros exigem plano pago ([pluggy.ai/meu-pluggy](https://www.pluggy.ai/meu-pluggy)). O aviso de teste de 15 dias no painel não afeta o uso pessoal.
- Belvo, Klavi, Celcoin e afins são B2B, com preço sob consulta e sem plano gratuito anunciado.
- Conclusão: o caminho sem custo é **cada pessoa com a própria conta gratuita da Pluggy** (Meu Pluggy + uma aplicação no painel). O Meu Banqueiro guarda as chaves de cada pessoa cifradas e usa as dela para os bancos dela.

### Como fica no app

Em **Mais › Bancos e cartões › Conectar banco**:

1. **Ativar (uma vez, uns 5 minutos).** A tela mostra os três passos: criar a conta no [Meu Pluggy](https://meu.pluggy.ai) e conectar os bancos lá; criar a conta no [painel da Pluggy](https://dashboard.pluggy.ai) com o mesmo e-mail, criar uma aplicação e ativar o conector **MeuPluggy**; copiar o Client ID e o Client Secret e colar no Meu Banqueiro. O Meu Banqueiro confere as chaves na Pluggy antes de gravar; elas ficam cifradas (AES-256-GCM), só para aquela pessoa, e nunca voltam para o navegador nem para a exportação de dados.
2. **Conectar meus bancos.** O botão abre a janela oficial da Pluggy já no conector MeuPluggy (id 200): a pessoa entra com o login do Meu Pluggy, escolhe o banco e pronto. Uma conexão por banco. Nenhum Item ID para copiar.
3. **Todo dia às 6h (Brasília)** o Meu Banqueiro sincroniza todas as conexões, cada uma com as chaves da própria pessoa. A autorização do MeuPluggy dura um ano; quando vencer, a pessoa reconecta o banco no Meu Pluggy e toca em **Atualizar agora**.

As variáveis `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` no ambiente continuam valendo como chaves gerais de reserva, para quem não colou as próprias. Para o casal, cada um usa as suas: é o que os termos da Pluggy pedem.

### O que foi confirmado com dados reais (pela comunidade)

O adaptador segue o que projetos de uso pessoal verificaram contra a API no plano gratuito ([open-finance-pessoal](https://github.com/fellipefbarros/open-finance-pessoal)):

- `POST /auth` → apiKey; `POST /connect_token` com `clientUserId` → token do widget (30 min). Widget Pluggy Connect **v2.10.0** com `connectorIds: [200]`.
- `GET /items/{id}` e `GET /accounts?itemId=` funcionam. `GET /items` (listar) não existe no plano pessoal.
- Transações só em `GET /v2/transactions?accountId=&dateFrom=`, paginadas pelo `next` da resposta. `page`, `pageSize`, `from` e `to` dão erro 400; a v1 responde 410.
- Sinais: na conta, negativo é saída; no cartão, positivo é compra e negativo é pagamento ou estorno.
- Todo item se chama "MeuPluggy": o banco de verdade é deduzido das contas (nome comercial ou código COMPE).
- Os dados chegam com alguns dias de atraso e atualizam a cada 24 h; por isso a sincronização sempre volta 30 dias (a deduplicação cuida das repetições) e a primeira traz seis meses.
- Consentimento vencido: o item fica `LOGIN_ERROR`/`OUTDATED`; não há como reautorizar por código no plano pessoal.
- Atualidade: o item traz `lastUpdatedAt` (de quando são os dados do banco), mostrado na tela como "Dados do banco de". **Atualizar agora** faz `PATCH /items/{id}` (pedido de atualização; se recusado, segue com o que existe) e, ao abrir o app, conexões paradas há mais de 6 h são sincronizadas sozinhas.

### Limites honestos

- Uma pessoa, uma conta Pluggy: a conta de outra pessoa (mesmo da família) na mesma chave viola os termos. Por isso as chaves são por pessoa.
- Sem webhooks: a atualização é diária, não na hora.
- Quem não quiser criar as contas na Pluggy importa o extrato (OFX ou CSV), que continua gratuito e com conferência automática.

## 2. Assistente com IA

Sem chave, o assistente funciona em **modo local**: usa as mesmas ferramentas de cálculo e não envia nada para fora, mas só entende as perguntas da lista. Com uma chave, ele responde perguntas livres, ainda com números só do motor de cálculo. Se houver as duas chaves, vale o Claude.

### 2a. De graça, pela Groq

A API do Claude não tem plano gratuito. A Groq tem: sem cartão, com limites por conta. Para `openai/gpt-oss-120b`, fontes de setembro e outubro de 2026 citam 30 pedidos por minuto, 1.000 por dia, 8 mil tokens por minuto e 200 mil por dia; o número exato da sua conta fica em **Settings › Limits** no console da Groq. Cada pergunta usa cerca de 3 a 7 mil tokens (instruções, ferramentas e resultados), o que dá algumas dezenas de perguntas por dia. Quando a cota do minuto acaba, o app espera e tenta de novo; quando a do dia acaba, responde no modo local e avisa.

1. Entre em https://console.groq.com e crie a conta (Google, GitHub ou e-mail).
2. Recomendado: em **Settings › Data Controls**, ligue **Zero Data Retention**. Sem isso, a Groq pode guardar registros por até 30 dias para confiabilidade e combate a abuso.
3. Em **API Keys**, toque em **Create API Key** e copie a chave na hora (ela só aparece uma vez). Não cole a chave em conversas.
4. Na Vercel: **Settings › Environment Variables** › `GROQ_API_KEY` em **Production**, com **Sensitive** ligado. `GROQ_MODEL` é opcional (padrão `openai/gpt-oss-120b`).
5. Faça **Redeploy** (ou peça a nova publicação). No assistente, o selo passa a mostrar "IA conectada (Groq)".

Por que não o Gemini gratuito: nos termos do plano sem custo, o Google pode usar o conteúdo enviado para melhorar produtos, e revisores humanos podem lê-lo. Para dados financeiros, isso não serve.

### 2b. Pago, pelo Claude

1. Entre em https://platform.claude.com (o endereço console.anthropic.com redireciona para lá).
2. Em **Settings › Billing**, compre créditos. A API exige créditos antes do primeiro uso (https://support.claude.com/en/articles/8977456). Valor mínimo oficial não confirmado; guias de terceiros citam US$ 5.
3. Em **API Keys**, toque em **Create Key** e copie a chave na hora (ela só aparece uma vez).
4. Na Vercel: **Settings › Environment Variables** › `ANTHROPIC_API_KEY` em **Production**, com **Sensitive** ligado. `ANTHROPIC_MODEL` é opcional (padrão `claude-opus-5-5`).
5. Peça a nova publicação (ou faça **Redeploy**). No assistente, o aviso "Modo local" some.

Privacidade: com uma chave ativa, a pergunta, o histórico recente da conversa e os resultados de cálculo necessários são enviados ao provedor em uso (Groq ou Anthropic) para gerar a resposta (veja `/privacidade`).
