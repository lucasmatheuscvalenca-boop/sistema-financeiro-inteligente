# E-mail e "Esqueci minha senha"

Situação em 6/11/2026. Nenhuma credencial aparece neste documento.

## Como funciona para quem esqueceu a senha

1. Em **Entrar**, toca em **Esqueci minha senha** e informa o e-mail da conta.
2. Recebe por e-mail um código de 6 números. Ele vale por 15 minutos e só serve uma vez.
3. Em **Criar nova senha**, digita o código e a senha nova duas vezes.
4. Entra direto na conta. Todas as sessões abertas com a senha antiga são encerradas, em todos os aparelhos.

## Segurança

- A tela responde igual exista ou não a conta, e o e-mail sai depois da resposta: nem a mensagem nem o tempo revelam quem tem cadastro.
- O banco guarda só o hash do código, calculado com a chave da aplicação (`APP_ENCRYPTION_KEY`).
- Só o código mais recente vale. Depois de 5 erros, o código é invalidado e é preciso pedir outro. Cada conferência é contada no banco antes de comparar o código, então tentativas simultâneas também param em 5.
- Limites: 3 pedidos de código a cada 15 minutos e 10 por dia por e-mail, e 10 por hora por endereço de rede; 10 tentativas de código a cada 15 minutos e 30 por dia por e-mail.
- A rotina diária apaga códigos usados ou vencidos há mais de um dia.
- Cada pedido e cada troca ficam no registro de auditoria (`auth.password_reset_requested`, `auth.password_reset`), sem o código.
- O e-mail digitado fica num cookie de 30 minutos, e não na URL, para não aparecer em registros de acesso.

## Ativar o envio pelo Gmail (gratuito)

O Gmail envia por SMTP com uma **senha de app**, sem configurar DNS. O remetente aparece como "Meu Banqueiro" com o endereço do Gmail usado. Contas pessoais do Gmail têm limite de cerca de 500 destinatários por dia, muito acima do que o app usa.

1. Na conta Google que vai enviar, ligue a **Verificação em duas etapas** (https://myaccount.google.com/security). Sem ela, a opção de senha de app não aparece.
2. Abra https://myaccount.google.com/apppasswords, dê o nome "Meu Banqueiro" e toque em **Criar**. Copie a senha de 16 letras. Não cole a senha em conversas.
3. Na Vercel, abra o projeto, vá em **Settings › Environments › Production** e adicione as variáveis:
   - `SMTP_USER`: o endereço do Gmail.
   - `SMTP_PASSWORD`: a senha de app, com **Sensitive** ligado. Os espaços podem ficar; o app os remove.
4. Publique de novo (**Redeploy**). A tela **Esqueci minha senha** passa a mostrar o formulário.

Sem `SMTP_USER` e `SMTP_PASSWORD`, a tela avisa que a recuperação por e-mail não está ativa.

## Aviso da rotina diária

O mesmo envio avisa o dono do app quando a rotina diária (`/api/cron/sync`) encontra um problema: uma conexão bancária que terminou com erro ou uma etapa que falhou. O e-mail é curto, só com o banco e o motivo, sem valores. Vai para `ADMIN_EMAIL` ou, sem ela, para o próprio `SMTP_USER`. Se o envio falhar, a rotina termina do mesmo jeito.

## Outro provedor (remetente com o domínio meubanqueiro.com)

Qualquer serviço SMTP funciona com as mesmas variáveis, mais `SMTP_HOST`, `SMTP_PORT` (465 usa TLS direto; 587 usa STARTTLS) e `EMAIL_FROM`. Exemplo com Resend: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASSWORD` com a chave da Resend e `EMAIL_FROM="Meu Banqueiro <nao-responda@meubanqueiro.com>"`. Para usar o domínio próprio, o provedor pede registros de DNS. O DNS de meubanqueiro.com está na GoDaddy, então os registros precisam ser criados lá.

## Testes

- Integração: `tests/integration/password-reset.test.ts`, com um carteiro simulado.
- Ponta a ponta: `tests/e2e/senha.spec.ts`. Nos testes, `EMAIL_OUTBOX_DIR` grava cada e-mail como arquivo em vez de enviar. Essa variável é ignorada na Vercel.
