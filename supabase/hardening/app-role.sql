-- =============================================================================================
-- Endurecimento opcional (recomendado): papel de conexão do app web sem privilégios próprios.
--
-- O app abre cada transação com `set local role authenticated` + claims do JWT verificado. Conectando com
-- este papel, uma consulta feita fora desse contexto FALHA (permission denied) em vez de ignorar a RLS.
--
-- Como usar (SQL Editor do Supabase, uma vez):
--   1. Gere uma senha forte (ex.: openssl rand -base64 32) e troque TROQUE_ESTA_SENHA abaixo.
--   2. Rode este script.
--   3. Na Vercel, use em SUPABASE_DB_URL o usuário  myoffice_app.<project-ref>  (pooler de transação, porta 6543).
-- Se o pooler recusar o papel, use temporariamente a string padrão (usuário postgres) e me avise.
-- =============================================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'myoffice_app') then
    create role myoffice_app with login noinherit password 'TROQUE_ESTA_SENHA';
  end if;
end
$$;

grant authenticated to myoffice_app;
