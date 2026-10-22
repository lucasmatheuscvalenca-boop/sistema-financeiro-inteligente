import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { databaseUrl } from "../src/server/db/connection";

/**
 * Copia o banco do NEXO para um banco novo e vazio, sem expor credenciais: roda onde as variáveis
 * já existem (por exemplo, no build de uma publicação de teste na Vercel) e só imprime resumos.
 *
 * - Origem: as variáveis sem prefixo (`DATABASE_URL_UNPOOLED`/`DATABASE_URL`).
 * - Destino: as variáveis com o prefixo `MIGRAR_DESTINO_PREFIXO` (ex.: `NOVO_DATABASE_URL_UNPOOLED`).
 * - Só age com `MIGRAR_DADOS_NEXO=1`; sem isso não faz nada (seguro no build de produção).
 *
 * Passos: destino precisa estar vazio → migrações (mesmo schema da origem) → comparação do schema
 * → cópia de todas as tabelas numa única transação (ordem das chaves estrangeiras) → sequências →
 * comparação do inventário completo (linhas e hash do conteúdo de cada tabela). Qualquer diferença
 * desfaz a cópia e encerra com erro.
 */

const COLLATE = 'COLLATE "C"';
const SETUP = "SET TimeZone='UTC'; SET DateStyle='ISO, YMD'; SET extra_float_digits=1; SET IntervalStyle='postgres'";
/** Só os schemas do app: o Neon pode criar outros no destino (ex.: `neon_auth`), que não são tocados. */
const APP_SCHEMAS = ["public", "drizzle"];
const IN_APP = `(${APP_SCHEMAS.map((x) => `'${x}'`).join(",")})`;
const USER_SCHEMAS = `n.nspname IN ${IN_APP}`;

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const qualified = (schema: string, table: string) => `${ident(schema)}.${ident(table)}`;

/** Ordenação em JavaScript: determinística e igual nos dois bancos, qualquer que seja a collation. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function lines(c: Client, sql: string): Promise<string[]> {
  return (await c.query<{ l: string }>(sql)).rows.map((r) => r.l).sort(byText);
}

/** Schema sem os dados: extensões, schemas, colunas, índices e restrições. */
async function schemaInventory(c: Client): Promise<string[]> {
  await c.query(SETUP);
  return [
    "## schemas",
    ...(await lines(c, `SELECT 'schema|'||nspname AS l FROM pg_namespace n WHERE ${USER_SCHEMAS}`)),
    "## colunas",
    ...(await lines(
      c,
      `SELECT 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') AS l
       FROM information_schema.columns WHERE table_schema IN ${IN_APP}`,
    )),
    "## indices",
    ...(await lines(c, `SELECT 'idx|'||schemaname||'.'||tablename||'|'||indexname||'|'||indexdef AS l FROM pg_indexes WHERE schemaname IN ${IN_APP}`)),
    "## restricoes",
    ...(await lines(
      c,
      `SELECT 'con|'||n.nspname||'.'||t.relname||'|'||c.conname||'|'||c.contype::text||'|'||pg_get_constraintdef(c.oid) AS l
       FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE ${USER_SCHEMAS}`,
    )),
  ];
}

async function tables(c: Client): Promise<Array<{ schema: string; table: string }>> {
  const r = await c.query<{ schema: string; table: string }>(
    `SELECT n.nspname AS schema, c.relname AS table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind IN ('r','p') AND ${USER_SCHEMAS}`,
  );
  return r.rows.sort((x, y) => byText(`${x.schema}.${x.table}`, `${y.schema}.${y.table}`));
}

async function tableFingerprint(c: Client, schema: string, table: string): Promise<{ rows: number; hash: string }> {
  const r = await c.query<{ n: string; h: string }>(
    `SELECT count(*)::text AS n, coalesce(md5(string_agg(x::text, E'\\n' ORDER BY x::text ${COLLATE})), 'vazia') AS h FROM ${qualified(schema, table)} x`,
  );
  return { rows: Number(r.rows[0]!.n), hash: r.rows[0]!.h };
}

async function sequences(c: Client): Promise<Array<{ schema: string; name: string }>> {
  const r = await c.query<{ schema: string; name: string }>(`SELECT schemaname AS schema, sequencename AS name FROM pg_sequences WHERE schemaname IN ${IN_APP}`);
  return r.rows.sort((x, y) => byText(`${x.schema}.${x.name}`, `${y.schema}.${y.name}`));
}

async function sequenceState(c: Client, schema: string, name: string): Promise<{ last: string; called: boolean }> {
  const r = await c.query<{ last_value: string; is_called: boolean }>(`SELECT last_value::text, is_called FROM ${qualified(schema, name)}`);
  return { last: r.rows[0]!.last_value, called: r.rows[0]!.is_called };
}

/** Inventário completo: schema + linhas e hash de cada tabela + estado das sequências. */
async function fullInventory(c: Client): Promise<string[]> {
  const out = await schemaInventory(c);
  out.push("## sequencias");
  for (const s of await sequences(c)) {
    const st = await sequenceState(c, s.schema, s.name);
    out.push(`seq|${s.schema}.${s.name}|${st.last}|${st.called}`);
  }
  out.push("## tabelas");
  for (const t of await tables(c)) {
    const f = await tableFingerprint(c, t.schema, t.table);
    out.push(`tab|${t.schema}.${t.table}|${f.rows}|${f.hash}`);
  }
  return out;
}

async function extensions(c: Client): Promise<string[]> {
  return lines(c, "SELECT extname AS l FROM pg_extension");
}

/** Tabelas fora dos schemas do app (ex.: Neon Auth), só para informar. */
async function otherSchemas(c: Client): Promise<string[]> {
  return lines(
    c,
    `SELECT n.nspname||' ('||count(*)||' tabelas)' AS l FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ${IN_APP} AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' GROUP BY n.nspname`,
  );
}

/**
 * Entre versões diferentes do PostgreSQL o catálogo muda a forma, não o conteúdo: a partir do 18
 * cada NOT NULL também vira uma restrição (contype n) e expressões de CHECK podem sair com outros
 * parênteses. A obrigatoriedade das colunas continua comparada (is_nullable) e o CHECK é comparado
 * sem parênteses e espaços.
 */
function normalizeAcrossVersions(inv: string[]): string[] {
  return inv
    .filter((l) => !/^con\|[^|]*\|[^|]*\|n\|/.test(l))
    .map((l) => (/^con\|[^|]*\|[^|]*\|c\|/.test(l) ? l.replace(/[()\s]/g, "") : l))
    .sort(byText);
}

function firstDifferences(a: string[], b: string[], max = 15): string[] {
  const sa = new Set(a);
  const sb = new Set(b);
  return [...a.filter((l) => !sb.has(l)).map((l) => `- origem:  ${l}`), ...b.filter((l) => !sa.has(l)).map((l) => `+ destino: ${l}`)].slice(0, max);
}

/** Ordem de cópia respeitando as chaves estrangeiras entre tabelas (pais antes dos filhos). */
async function copyOrder(c: Client, all: Array<{ schema: string; table: string }>): Promise<Array<{ schema: string; table: string }>> {
  const key = (s: string, t: string) => `${s}.${t}`;
  const deps = new Map(all.map((t) => [key(t.schema, t.table), new Set<string>()]));
  const r = await c.query<{ cs: string; ct: string; ps: string; pt: string }>(
    `SELECT cn.nspname AS cs, ct.relname AS ct, pn.nspname AS ps, pt.relname AS pt FROM pg_constraint k
     JOIN pg_class ct ON ct.oid=k.conrelid JOIN pg_namespace cn ON cn.oid=ct.relnamespace
     JOIN pg_class pt ON pt.oid=k.confrelid JOIN pg_namespace pn ON pn.oid=pt.relnamespace WHERE k.contype='f'`,
  );
  for (const fk of r.rows) {
    const child = key(fk.cs, fk.ct);
    const parent = key(fk.ps, fk.pt);
    if (child !== parent) deps.get(child)?.add(parent);
  }
  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (k: string) => {
    if (state.get(k) === "done") return;
    if (state.get(k) === "visiting") throw new Error(`ciclo de chaves estrangeiras envolvendo ${k}`);
    state.set(k, "visiting");
    for (const p of deps.get(k) ?? []) visit(p);
    state.set(k, "done");
    order.push(k);
  };
  for (const t of all) visit(key(t.schema, t.table));
  return order.map((k) => all.find((t) => key(t.schema, t.table) === k)!);
}

function hostOf(url: string): { host: string; db: string } {
  const u = new URL(url);
  return { host: u.hostname, db: u.pathname.replace(/^\//, "") };
}

async function main() {
  if (process.env.MIGRAR_DADOS_NEXO !== "1") {
    console.log("[migrar-dados] não solicitada (MIGRAR_DADOS_NEXO≠1): nada a fazer.");
    return;
  }
  const prefix = process.env.MIGRAR_DESTINO_PREFIXO ?? "";
  if (!prefix || !/^[A-Z0-9_]+$/.test(prefix)) throw new Error("Defina MIGRAR_DESTINO_PREFIXO (ex.: NOVO_)");
  const srcUrl = databaseUrl("direct", process.env, "");
  const tgtUrl = databaseUrl("direct", process.env, prefix);
  if (!srcUrl || !tgtUrl) throw new Error("Conexões de origem ou destino ausentes no ambiente");
  const a = hostOf(srcUrl);
  const b = hostOf(tgtUrl);
  if (a.host === b.host && a.db === b.db) throw new Error("Origem e destino são o mesmo banco");
  const region = /\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/.exec(b.host)?.[1] ?? "desconhecida";

  const src = new Client({ connectionString: srcUrl });
  const tgt = new Client({ connectionString: tgtUrl });
  await src.connect();
  await tgt.connect();
  try {
    const v = async (c: Client) => (await c.query<{ v: string }>("SELECT current_setting('server_version') AS v")).rows[0]!.v;
    const vs = await v(src);
    const vt = await v(tgt);
    console.log(`[migrar-dados] origem PostgreSQL ${vs}; destino PostgreSQL ${vt} (região ${region})`);
    const sameMajor = vs.split(".")[0] === vt.split(".")[0];
    const comparable = (inv: string[]) => (sameMajor ? inv : normalizeAcrossVersions(inv));

    const others = await otherSchemas(tgt);
    if (others.length) console.log(`[migrar-dados] schemas do Neon no destino (não serão tocados): ${others.join(", ")}`);
    const existing = await tables(tgt);
    if (existing.length) throw new Error(`os schemas do app no destino não estão vazios (${existing.map((t) => `${t.schema}.${t.table}`).slice(0, 5).join(", ")}…); nada foi alterado`);
    const tgtExt = new Set(await extensions(tgt));
    const lacking = (await extensions(src)).filter((e) => !tgtExt.has(e));
    if (lacking.length) throw new Error(`extensões ausentes no destino: ${lacking.join(", ")}`);
    console.log("[migrar-dados] schemas do app vazios no destino: ok");

    const before = await fullInventory(src);

    await migrate(drizzle(tgt), { migrationsFolder: "drizzle" });
    console.log("[migrar-dados] migrações aplicadas no destino");
    const sa = await schemaInventory(src);
    const sb = await schemaInventory(tgt);
    const schemaDiff = firstDifferences(comparable(sa), comparable(sb));
    if (!sameMajor) console.log(`[migrar-dados] versões diferentes: comparação sem as restrições NOT NULL de catálogo do PostgreSQL ${vt.split(".")[0]} (${sb.filter((l) => /^con\|[^|]*\|[^|]*\|n\|/.test(l)).length}) e com CHECK sem parênteses`);
    if (schemaDiff.length) throw new Error(`schema diferente após as migrações:\n${schemaDiff.join("\n")}`);
    console.log(`[migrar-dados] schema idêntico: ${sa.filter((l) => l.startsWith("col|")).length} colunas, ${sa.filter((l) => l.startsWith("idx|")).length} índices, ${sa.filter((l) => l.startsWith("con|")).length} restrições`);

    const order = await copyOrder(src, await tables(src));
    await tgt.query("BEGIN");
    let copied = 0;
    for (const t of order) {
      const name = qualified(t.schema, t.table);
      const fs = await tableFingerprint(src, t.schema, t.table);
      const ft = await tableFingerprint(tgt, t.schema, t.table);
      if (ft.rows > 0) {
        // Linhas criadas pelas próprias migrações (catálogo de mascotes, histórico de migrações).
        if (ft.hash !== fs.hash) throw new Error(`${t.schema}.${t.table}: o destino já tem linhas diferentes da origem`);
        continue;
      }
      if (fs.rows === 0) continue;
      // JSON como texto: preserva números grandes e tipos sem passar pelo JavaScript.
      const data = await src.query<{ j: string }>(`SELECT coalesce(json_agg(row_to_json(x)), '[]')::text AS j FROM ${name} x`);
      await tgt.query(`INSERT INTO ${name} OVERRIDING SYSTEM VALUE SELECT * FROM json_populate_recordset(NULL::${name}, $1::json)`, [data.rows[0]!.j]);
      copied += fs.rows;
    }
    for (const s of await sequences(src)) {
      const st = await sequenceState(src, s.schema, s.name);
      await tgt.query("SELECT setval($1::regclass, $2::bigint, $3)", [qualified(s.schema, s.name), st.last, st.called]);
    }
    await tgt.query("COMMIT");
    console.log(`[migrar-dados] ${copied} linha(s) copiadas em ${order.length} tabelas`);

    const after = await fullInventory(src);
    if (firstDifferences(before, after).length) throw new Error("a origem mudou durante a cópia; repita a migração com o app parado");
    const target = await fullInventory(tgt);
    const diff = firstDifferences(comparable(after), comparable(target));
    if (diff.length) throw new Error(`inventário diferente entre origem e destino:\n${diff.join("\n")}`);
    // Linhas e início do hash de cada tabela com dados: permite conferir a origem depois da virada.
    const withData = target.filter((l) => l.startsWith("tab|") && !l.endsWith("|0|vazia")).map((l) => {
      const [, name, rows, hash] = l.split("|");
      return `${name}=${rows}:${hash!.slice(0, 12)}`;
    });
    console.log(`[migrar-dados] OK: destino idêntico à origem (${target.filter((l) => l.startsWith("tab|")).length} tabelas; com dados: ${withData.join(", ") || "nenhuma"})`);
  } catch (e) {
    await tgt.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await src.end();
    await tgt.end();
  }
}

main().catch((err) => {
  // Mensagens nunca incluem strings de conexão.
  const msg = (err instanceof Error ? err.message : String(err)).replace(/postgres(ql)?:\/\/\S+/g, "[conexão omitida]");
  console.error(`[migrar-dados] FALHOU: ${msg}`);
  process.exit(1);
});
