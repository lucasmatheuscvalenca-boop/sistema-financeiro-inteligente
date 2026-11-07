import { sql, TransactionRollbackError, type SQL } from "drizzle-orm";
import type { Database, DbExecutor } from "../db/client";
import { BACKUP_FORMAT, parseBackup, type BackupPayload } from "./format";

/**
 * Cópia lógica do banco: cada tabela do schema public vira JSON pelo próprio Postgres (json_agg),
 * numa leitura só (repeatable read), então todas as tabelas são do mesmo instante. A volta usa
 * json_populate_recordset, que converte cada valor com as regras do próprio Postgres (datas,
 * listas, jsonb, números exatos), sem passar pelo JavaScript.
 */

/** Dados de passagem que não precisam voltar: sessões, tentativas, códigos de uso único. */
const EPHEMERAL = new Set(["sessions", "auth_rate_limits", "password_resets", "telegram_link_codes", "bot_proposals"]);

const CHECK_SCHEMA = "mb_restore_check";

interface LiveTable {
  name: string;
  /** Colunas que aceitam valor (as geradas pelo banco ficam de fora). */
  columns: string[];
}

async function liveTables(db: DbExecutor): Promise<LiveTable[]> {
  const res = await db.execute<{ name: string; columns: string[] }>(sql`
    select c.table_name::text as name,
           array_agg(c.column_name::text order by c.ordinal_position) filter (where c.is_generated <> 'ALWAYS') as columns
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    group by c.table_name
    order by c.table_name`);
  return res.rows.map((r) => ({ name: r.name, columns: r.columns ?? [] }));
}

async function migrationCount(db: DbExecutor): Promise<number> {
  const exists = await db.execute<{ t: string | null }>(sql`select to_regclass('drizzle.__drizzle_migrations')::text as t`);
  if (!exists.rows[0]?.t) return 0;
  const res = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
  return res.rows[0]?.n ?? 0;
}

const table = (schema: string, name: string): SQL => sql`${sql.identifier(schema)}.${sql.identifier(name)}`;

export interface DumpResult {
  json: string;
  tables: number;
  rows: number;
}

/** Gera o JSON da cópia. O texto das linhas vem pronto do Postgres e é só costurado aqui. */
export async function dumpDatabase(db: Database, now = new Date()): Promise<DumpResult> {
  return db.transaction(
    async (tx) => {
      const tables = (await liveTables(tx)).filter((t) => !EPHEMERAL.has(t.name));
      const migrations = await migrationCount(tx);
      const parts: string[] = [];
      let rows = 0;
      for (const t of tables) {
        const res = await tx.execute<{ n: number; rows: string }>(sql`select count(*)::int as n, coalesce(json_agg(r), '[]'::json)::text as rows from ${table("public", t.name)} r`);
        const { n, rows: text } = res.rows[0]!;
        rows += n;
        parts.push(`${JSON.stringify(t.name)}:{"count":${n},"columns":${JSON.stringify(t.columns)},"rows":${text}}`);
      }
      const head = `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":1,"createdAt":${JSON.stringify(now.toISOString())},"migrations":${migrations},"tables":{`;
      return { json: `${head}${parts.join(",")}}}`, tables: tables.length, rows };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Guarda o JSON numa tabela temporária para cada tabela ler a sua parte sem reenviar o arquivo. */
async function loadPayload(tx: DbExecutor, json: string): Promise<void> {
  await tx.execute(sql`create temp table mb_restore_payload (doc json) on commit drop`);
  await tx.execute(sql`insert into mb_restore_payload (doc) values (${json}::json)`);
}

async function insertRows(tx: DbExecutor, schema: string, name: string, columns: string[], nullColumns: string[] = [], skipExisting = false): Promise<void> {
  if (!columns.length) return;
  const target = table(schema, name);
  const list = sql.join(
    columns.map((c) => sql.identifier(c)),
    sql`, `,
  );
  const values = sql.join(
    columns.map((c) => (nullColumns.includes(c) ? sql`null` : sql`r.${sql.identifier(c)}`)),
    sql`, `,
  );
  await tx.execute(sql`
    insert into ${target} (${list})
    select ${values} from mb_restore_payload p, json_populate_recordset(null::${target}, p.doc -> 'tables' -> ${name}::text -> 'rows') r
    ${skipExisting ? sql`on conflict do nothing` : sql``}`);
}

async function countRows(tx: DbExecutor, schema: string, name: string): Promise<number> {
  const res = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${table(schema, name)}`);
  return res.rows[0]?.n ?? 0;
}

export interface RestoreCheck {
  ok: boolean;
  tables: number;
  rows: number;
  problems: string[];
}

/**
 * Teste de restauração sem tocar em nada: cria um schema provisório com tabelas iguais às de
 * public, carrega a cópia nele, confere as linhas de cada tabela e desfaz tudo (rollback).
 */
export async function checkRestore(db: Database, json: string): Promise<RestoreCheck> {
  let payload: BackupPayload;
  try {
    payload = parseBackup(json);
  } catch (e) {
    return { ok: false, tables: 0, rows: 0, problems: [e instanceof Error ? e.message : "A cópia não pôde ser lida."] };
  }
  let result: RestoreCheck | null = null;
  try {
    await db.transaction(async (tx) => {
      const live = new Map((await liveTables(tx)).map((t) => [t.name, t]));
      const problems: string[] = [];
      let rows = 0;
      await tx.execute(sql`create schema ${sql.identifier(CHECK_SCHEMA)}`);
      await loadPayload(tx, json);
      for (const [name, t] of Object.entries(payload.tables)) {
        const target = live.get(name);
        if (!target) {
          problems.push(`A tabela ${name} da cópia não existe mais no banco.`);
          continue;
        }
        await tx.execute(sql`create table ${table(CHECK_SCHEMA, name)} (like ${table("public", name)} including constraints)`);
        await insertRows(tx, CHECK_SCHEMA, name, t.columns.filter((c) => target.columns.includes(c)));
        const n = await countRows(tx, CHECK_SCHEMA, name);
        if (n !== t.count) problems.push(`${name}: a cópia tinha ${t.count} linhas e voltaram ${n}.`);
        rows += n;
      }
      if (!payload.tables.users?.count) problems.push("A cópia não tem nenhuma pessoa cadastrada.");
      result = { ok: problems.length === 0, tables: Object.keys(payload.tables).length, rows, problems };
      tx.rollback();
    });
  } catch (e) {
    if (!(e instanceof TransactionRollbackError)) {
      return { ok: false, tables: 0, rows: 0, problems: [`A restauração de teste falhou: ${e instanceof Error ? e.message.slice(0, 200) : "erro desconhecido"}`] };
    }
  }
  return result!;
}

/** Ordem de gravação: primeiro as tabelas referenciadas (users antes de accounts, e assim por diante). */
async function restoreOrder(tx: DbExecutor, names: string[]): Promise<{ order: string[]; selfRefs: Map<string, string[]> }> {
  const res = await tx.execute<{ child: string; parent: string; cols: string[] }>(sql`
    select cl.relname::text as child, pcl.relname::text as parent,
           array(select a.attname::text from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) as cols
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_class pcl on pcl.oid = c.confrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f' and n.nspname = 'public'`);
  const deps = new Map(names.map((n) => [n, new Set<string>()]));
  const selfRefs = new Map<string, string[]>();
  for (const r of res.rows) {
    if (r.child === r.parent) selfRefs.set(r.child, [...(selfRefs.get(r.child) ?? []), ...r.cols]);
    else if (deps.has(r.child) && deps.has(r.parent)) deps.get(r.child)!.add(r.parent);
  }
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < names.length) {
    const ready = names.filter((n) => !done.has(n) && [...deps.get(n)!].every((p) => done.has(p)));
    if (!ready.length) throw new Error("Referências circulares entre tabelas: restauração automática não é possível.");
    for (const n of ready) {
      order.push(n);
      done.add(n);
    }
  }
  return { order, selfRefs };
}

export interface RestoreResult {
  tables: number;
  rows: number;
  skipped: string[];
}

/**
 * Restauração de verdade, para um banco NOVO (com as migrações já aplicadas e sem nenhum dado).
 * Recusa um banco que já tenha pessoas cadastradas: nunca sobrescreve nem apaga dados.
 */
export async function restoreIntoEmptyDatabase(db: Database, json: string): Promise<RestoreResult> {
  const payload = parseBackup(json);
  return db.transaction(async (tx) => {
    if ((await countRows(tx, "public", "users")) > 0) throw new Error("O banco de destino já tem dados. A restauração só grava num banco novo e vazio.");
    const live = new Map((await liveTables(tx)).map((t) => [t.name, t]));
    const names = Object.keys(payload.tables).filter((n) => live.has(n));
    const skipped = Object.keys(payload.tables).filter((n) => !live.has(n));
    const { order, selfRefs } = await restoreOrder(tx, names);
    await loadPayload(tx, json);
    let rows = 0;
    for (const name of order) {
      const columns = payload.tables[name]!.columns.filter((c) => live.get(name)!.columns.includes(c));
      const self = (selfRefs.get(name) ?? []).filter((c) => columns.includes(c));
      // Tabelas de referência que as próprias migrações já preenchem (ex.: mascots): só completa.
      const seeded = (await countRows(tx, "public", name)) > 0;
      await insertRows(tx, "public", name, columns, self, seeded);
      // Referência à própria tabela (ex.: subcategoria, parte de um lançamento dividido): grava depois.
      for (const col of self) {
        await tx.execute(sql`
          update ${table("public", name)} t set ${sql.identifier(col)} = r.${sql.identifier(col)}
          from mb_restore_payload p, json_populate_recordset(null::${table("public", name)}, p.doc -> 'tables' -> ${name}::text -> 'rows') r
          where t.id = r.id and r.${sql.identifier(col)} is not null`);
      }
      const n = await countRows(tx, "public", name);
      if (seeded ? n < payload.tables[name]!.count : n !== payload.tables[name]!.count) throw new Error(`${name}: esperadas ${payload.tables[name]!.count} linhas, gravadas ${n}.`);
      rows += n;
    }
    return { tables: order.length, rows, skipped };
  });
}
