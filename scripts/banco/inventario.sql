-- Inventário verificável do banco do NEXO: extensões, schemas, colunas, índices, restrições,
-- sequências e, para cada tabela, número de linhas e hash MD5 do conteúdo ordenado.
-- Dois bancos com o mesmo inventário têm o mesmo schema e os mesmos dados.
-- Uso: psql "$URL" -X -q -f scripts/banco/inventario.sql > inventario.txt
\set ON_ERROR_STOP 1
SET TimeZone='UTC'; SET DateStyle='ISO, YMD'; SET extra_float_digits=1; SET IntervalStyle='postgres';
\pset tuples_only on
\pset format unaligned
SELECT '## extensoes'; SELECT 'ext|'||extname FROM pg_extension ORDER BY extname;
SELECT '## schemas'; SELECT 'schema|'||nspname FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%' ORDER BY 1;
SELECT '## colunas'; SELECT 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position;
SELECT '## indices'; SELECT 'idx|'||schemaname||'.'||tablename||'|'||indexname||'|'||indexdef FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;
SELECT '## restricoes'; SELECT 'con|'||n.nspname||'.'||t.relname||'|'||c.conname||'|'||c.contype::text||'|'||pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1;
SELECT '## sequencias'; SELECT 'seq|'||schemaname||'.'||sequencename||'|'||coalesce(last_value::text,'nulo') FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;
SELECT '## tabelas (linhas e hash do conteudo)';
SELECT format('SELECT %L||''|''||count(*)||''|''||coalesce(md5(string_agg(x::text, E''\n'' ORDER BY x::text)),''vazia'') FROM %I.%I x', 'tab|'||n.nspname||'.'||c.relname, n.nspname, c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' ORDER BY n.nspname, c.relname \gexec
