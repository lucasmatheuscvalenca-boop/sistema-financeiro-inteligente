#!/usr/bin/env bash
# Migração do banco do NEXO entre dois PostgreSQL: dump novo da origem -> restauração no destino
# (que precisa estar vazio) -> comparação de inventário. Para em qualquer erro.
# Uso: ORIGEM_URL=... DESTINO_URL=... scripts/banco/migrar.sh
# As conexões vêm do ambiente e nunca são impressas. Requer pg_dump/pg_restore/psql >= versão do servidor.
set -euo pipefail
umask 077
: "${ORIGEM_URL:?defina ORIGEM_URL}" "${DESTINO_URL:?defina DESTINO_URL}"
DIR=$(cd "$(dirname "$0")" && pwd)
hide() { sed -E 's#postgres(ql)?://[^ ]*#[conexao omitida]#g'; }
M=${SAIDA:-migracao-$(date -u +%Y%m%dT%H%M%SZ)}
mkdir -p "$M"
echo "destino: $(psql "$DESTINO_URL" -X -At -c "select 'PostgreSQL '||current_setting('server_version')||' banco='||current_database()" 2>&1 | hide)"
N=$(psql "$DESTINO_URL" -X -At -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%'")
if [ "$N" != "0" ]; then echo "ABORTADO: o destino não está vazio ($N tabelas). Nada foi alterado."; exit 2; fi
psql "$ORIGEM_URL" -X -q -f "$DIR/inventario.sql" > "$M/inventario_origem.txt"
pg_dump "$ORIGEM_URL" -Fc -Z 6 --no-owner --no-acl -f "$M/nexo.dump" 2> >(hide >&2)
(cd "$M" && sha256sum nexo.dump inventario_origem.txt > SHA256SUMS)
pg_restore --exit-on-error --no-owner --no-acl -d "$DESTINO_URL" "$M/nexo.dump" 2> >(hide >&2)
psql "$DESTINO_URL" -X -q -c 'ANALYZE' >/dev/null
psql "$DESTINO_URL" -X -q -f "$DIR/inventario.sql" > "$M/inventario_destino.txt"
if diff -q "$M/inventario_origem.txt" "$M/inventario_destino.txt" >/dev/null; then
  echo "OK: destino idêntico à origem (schema, índices, restrições, sequências, linhas e hash de cada tabela)"
else
  echo "DIFERENÇAS entre origem e destino:"; diff "$M/inventario_origem.txt" "$M/inventario_destino.txt" | head -40; exit 3
fi
