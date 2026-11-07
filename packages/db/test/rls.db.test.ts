/**
 * Testes de isolamento com usuários reais no PostgreSQL (Fase 1).
 * Cada consulta "do app" passa por connect().asUser/asAgent com o papel sem privilégios myoffice_app,
 * exatamente como a aplicação faz em produção.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgErrorCode, schema, type VerifiedClaims } from "../src";
import { createUser, expectPgError, openClients } from "./helpers";

const { workspaces, categories, departments, agents, workspaceMembers, profiles, accessGrants, auditLogs } = schema;

const { urls, admin, app } = openClients();

let ana: VerifiedClaims; // dona dos dois universos
let bruno: VerifiedClaims; // outro usuário, sem relação com Ana
let carla: VerifiedClaims; // leitora (viewer) na empresa de Ana
let anaPersonal: string;
let anaBusiness: string;
let brunoPersonal: string;
let personalAgent: string;
let businessAgent: string;

async function personalOf(claims: VerifiedClaims) {
  const rows = await app.asUser(claims, (tx) =>
    tx.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.kind, "personal"), eq(workspaces.createdBy, claims.sub))),
  );
  return rows[0]!.id;
}

async function categoryNames(claims: VerifiedClaims, ws: string, agentId?: string) {
  const query = (tx: Parameters<Parameters<typeof app.asUser>[1]>[0]) =>
    tx.select({ name: categories.name }).from(categories).where(eq(categories.workspaceId, ws)).orderBy(categories.sortOrder);
  const rows = agentId ? await app.asAgent(claims, agentId, query) : await app.asUser(claims, query);
  return rows.map((r) => r.name);
}

beforeAll(async () => {
  ana = await createUser(admin, "Ana");
  bruno = await createUser(admin, "Bruno");
  carla = await createUser(admin, "Carla");
  anaPersonal = await personalOf(ana);
  brunoPersonal = await personalOf(bruno);

  const [created] = await app.asUser(ana, (tx) =>
    tx.execute(sql.raw(`select app.create_business_workspace('Explosion   Digital ') as id`)) as unknown as Promise<{ id: string }[]>,
  );
  anaBusiness = created!.id;

  // Carla entra como leitora na empresa de Ana (a função de convites chega numa fase futura).
  await admin`insert into public.workspace_members (workspace_id, user_id, role) values (${anaBusiness}, ${carla.sub}, 'viewer')`;

  [{ id: personalAgent }] = await app.asUser(ana, (tx) =>
    tx.insert(agents).values({ workspaceId: anaPersonal, name: "Pesquisador pessoal", specialty: "Pesquisa" }).returning({ id: agents.id }),
  ) as [{ id: string }];
  [{ id: businessAgent }] = await app.asUser(ana, (tx) =>
    tx.insert(agents).values({ workspaceId: anaBusiness, name: "Analista comercial", specialty: "Vendas" }).returning({ id: agents.id }),
  ) as [{ id: string }];
});

afterAll(async () => {
  await app.close();
  await admin.end({ timeout: 5 });
});

describe("provisionamento", () => {
  it("cadastro cria perfil e universo pessoal com as 8 categorias iniciais", async () => {
    const [profile] = await app.asUser(ana, (tx) => tx.select().from(profiles).where(eq(profiles.id, ana.sub)));
    expect(profile?.displayName).toBe("Ana");
    expect(await categoryNames(ana, anaPersonal)).toEqual([
      "Projetos pessoais",
      "Planejamento de vida",
      "Finanças pessoais",
      "Estudos e aprendizado",
      "Pesquisas",
      "Desenvolvimento de ideias",
      "Organização e produtividade",
      "Projetos experimentais",
    ]);
  });

  it("empresa criada pela função tem nome normalizado, dono e as 8 categorias empresariais", async () => {
    const [ws] = await app.asUser(ana, (tx) => tx.select().from(workspaces).where(eq(workspaces.id, anaBusiness)));
    expect(ws).toMatchObject({ kind: "business", name: "Explosion Digital", createdBy: ana.sub });
    const names = await categoryNames(ana, anaBusiness);
    expect(names).toHaveLength(8);
    expect(names[0]).toBe("Estratégia empresarial");
    const [member] = await app.asUser(ana, (tx) =>
      tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, anaBusiness), eq(workspaceMembers.userId, ana.sub))),
    );
    expect(member?.role).toBe("owner");
  });

  it("cada usuário vê só os próprios universos", async () => {
    const anaWs = await app.asUser(ana, (tx) => tx.select({ id: workspaces.id }).from(workspaces));
    expect(anaWs.map((w) => w.id).sort()).toEqual([anaPersonal, anaBusiness].sort());
    const brunoWs = await app.asUser(bruno, (tx) => tx.select({ id: workspaces.id }).from(workspaces));
    expect(brunoWs.map((w) => w.id)).toEqual([brunoPersonal]);
  });

  it("nome de empresa inválido é recusado pelo banco", async () => {
    await expectPgError(app.asUser(ana, (tx) => tx.execute(sql.raw(`select app.create_business_workspace('   ')`))), "22023");
  });

  it("provisionamento gera um único evento de auditoria resumido", async () => {
    const rows = await admin`select action from public.audit_logs where workspace_id = ${anaBusiness} order by id`;
    expect(rows[0]?.action).toBe("workspace.provisioned");
    expect(rows.filter((r) => r.action === "categories.insert")).toHaveLength(0);
  });
});

describe("isolamento entre usuários", () => {
  it("Bruno não lê nada de Ana: universos, categorias, membros, agentes, perfil", async () => {
    const result = await app.asUser(bruno, async (tx) => ({
      ws: await tx.select().from(workspaces).where(inArray(workspaces.id, [anaPersonal, anaBusiness])),
      cats: await tx.select().from(categories).where(inArray(categories.workspaceId, [anaPersonal, anaBusiness])),
      members: await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, ana.sub)),
      ags: await tx.select().from(agents),
      prof: await tx.select().from(profiles).where(eq(profiles.id, ana.sub)),
    }));
    expect(result).toEqual({ ws: [], cats: [], members: [], ags: [], prof: [] });
  });

  it("Bruno não cria categoria no universo de Ana", async () => {
    await expectPgError(
      app.asUser(bruno, (tx) => tx.insert(categories).values({ workspaceId: anaPersonal, name: "Intrusa" })),
      "42501",
    );
  });

  it("Bruno não renomeia o universo de Ana (0 linhas afetadas)", async () => {
    const updated = await app.asUser(bruno, (tx) =>
      tx.update(workspaces).set({ name: "Hackeado" }).where(eq(workspaces.id, anaBusiness)).returning({ id: workspaces.id }),
    );
    expect(updated).toEqual([]);
    const [row] = await admin`select name from public.workspaces where id = ${anaBusiness}`;
    expect(row?.name).toBe("Explosion Digital");
  });

  it("Bruno não concede a si mesmo acesso aos dados de Ana", async () => {
    await expectPgError(
      app.asUser(bruno, (tx) =>
        tx.execute(sql.raw(`select app.grant_workspace_read('${anaBusiness}', '${brunoPersonal}', null, 'quero ver')`)),
      ),
      "42501",
    );
  });

  it("ninguém se adiciona como membro de um workspace (sem escrita direta em membros)", async () => {
    await expectPgError(
      app.asUser(bruno, (tx) => tx.insert(workspaceMembers).values({ workspaceId: anaBusiness, userId: bruno.sub, role: "owner" })),
      "42501",
    );
    await expectPgError(
      app.asUser(carla, (tx) =>
        tx.update(workspaceMembers).set({ role: "owner" }).where(eq(workspaceMembers.userId, carla.sub)),
      ),
      "42501",
    );
  });
});

describe("privilégios por coluna e integridade", () => {
  it("o cliente não forja is_seed, autor, datas nem estado de agente (o banco normaliza)", async () => {
    const past = new Date("2001-01-01T00:00:00Z");
    const [cat] = await app.asUser(ana, (tx) =>
      tx
        .insert(categories)
        .values({ workspaceId: anaPersonal, name: "Viagens", isSeed: true, createdBy: bruno.sub, createdAt: past })
        .returning(),
    );
    expect(cat).toMatchObject({ isSeed: false, createdBy: ana.sub });
    expect(cat!.createdAt.getTime()).toBeGreaterThan(past.getTime());

    const [agent] = await app.asUser(ana, (tx) =>
      tx.insert(agents).values({ workspaceId: anaPersonal, name: "Forjado", status: "working" }).returning(),
    );
    expect(agent?.status).toBe("available");
    await app.asUser(ana, (tx) => tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, agent!.id)));
  });

  it("categoria não muda de universo (workspace_id não é atualizável)", async () => {
    await expectPgError(
      app.asUser(ana, (tx) => tx.update(categories).set({ workspaceId: anaBusiness }).where(eq(categories.name, "Viagens"))),
      "42501",
    );
  });

  it("nome de categoria duplicado no mesmo universo é recusado; em outro universo é permitido", async () => {
    await expectPgError(
      app.asUser(ana, (tx) => tx.insert(categories).values({ workspaceId: anaPersonal, name: "viagens" })),
      "23505",
    );
    await app.asUser(ana, (tx) => tx.insert(categories).values({ workspaceId: anaBusiness, name: "Viagens" }));
  });

  it("departamento não aponta para categoria de outro universo (FK composta)", async () => {
    const [bizCat] = await app.asUser(ana, (tx) =>
      tx.select({ id: categories.id }).from(categories).where(eq(categories.workspaceId, anaBusiness)).limit(1),
    );
    await expectPgError(
      app.asUser(ana, (tx) =>
        tx.insert(departments).values({ workspaceId: anaPersonal, categoryId: bizCat!.id, name: "Misturado" }),
      ),
      "23503",
    );
  });

  it("humano não marca agente como 'trabalhando' (só execuções reais); pausar é permitido", async () => {
    await expectPgError(
      app.asUser(ana, (tx) => tx.update(agents).set({ status: "working" }).where(eq(agents.id, personalAgent))),
      "42501",
    );
    const paused = await app.asUser(ana, (tx) =>
      tx.update(agents).set({ status: "paused" }).where(eq(agents.id, personalAgent)).returning({ status: agents.status }),
    );
    expect(paused).toEqual([{ status: "paused" }]);
    await app.asUser(ana, (tx) => tx.update(agents).set({ status: "available" }).where(eq(agents.id, personalAgent)));
  });
});

describe("papéis", () => {
  it("leitora vê a empresa, não escreve e enxerga apenas perfis com quem divide workspace", async () => {
    expect(await categoryNames(carla, anaBusiness)).toContain("Comercial");
    await expectPgError(
      app.asUser(carla, (tx) => tx.insert(categories).values({ workspaceId: anaBusiness, name: "Da leitora" })),
      "42501",
    );
    const [{ can_write: canWrite }] = (await app.asUser(carla, (tx) =>
      tx.execute(sql.raw(`select app.can_write('${anaBusiness}') as can_write`)),
    )) as unknown as [{ can_write: boolean }];
    expect(canWrite).toBe(false);
    const visible = await app.asUser(carla, (tx) => tx.select({ id: profiles.id }).from(profiles));
    expect(visible.map((p) => p.id).sort()).toEqual([ana.sub, carla.sub].sort());
    // Carla não vê o universo pessoal de Ana.
    expect(await categoryNames(carla, anaPersonal)).toEqual([]);
  });

  it("leitora não lê a auditoria (só donos/admins)", async () => {
    const rows = await app.asUser(carla, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.workspaceId, anaBusiness)));
    expect(rows).toEqual([]);
  });
});

describe("isolamento pessoal × empresarial no contexto de agente", () => {
  it("agente pessoal lê o universo pessoal e NÃO lê o empresarial do mesmo dono", async () => {
    expect((await categoryNames(ana, anaPersonal, personalAgent)).length).toBeGreaterThan(0);
    expect(await categoryNames(ana, anaBusiness, personalAgent)).toEqual([]);
    const ws = await app.asAgent(ana, personalAgent, (tx) => tx.select({ id: workspaces.id }).from(workspaces));
    expect(ws.map((w) => w.id)).toEqual([anaPersonal]);
  });

  it("agente empresarial lê a empresa e NÃO lê o universo pessoal", async () => {
    expect(await categoryNames(ana, anaPersonal, businessAgent)).toEqual([]);
    expect((await categoryNames(ana, anaBusiness, businessAgent)).length).toBeGreaterThan(0);
  });

  it("contexto de agente nunca amplia: agente de Ana usado com as claims de Bruno não vê nada de Ana", async () => {
    expect(await categoryNames(bruno, anaPersonal, personalAgent)).toEqual([]);
    const ws = await app.asAgent(bruno, personalAgent, (tx) => tx.select().from(workspaces));
    expect(ws).toEqual([]);
  });

  it("agente só escreve no próprio universo (contrato de app.can_write para as próximas fases)", async () => {
    const check = (agent: string, ws: string) =>
      app.asAgent(ana, agent, (tx) => tx.execute(sql.raw(`select app.can_write('${ws}') as ok`))) as unknown as Promise<
        [{ ok: boolean }]
      >;
    expect((await check(personalAgent, anaPersonal))[0].ok).toBe(true);
    expect((await check(personalAgent, anaBusiness))[0].ok).toBe(false);
  });

  it("concessão explícita libera leitura; revogação corta; o caminho inverso continua fechado", async () => {
    const [{ id: grantId }] = (await app.asUser(ana, (tx) =>
      tx.execute(
        sql`select app.grant_workspace_read(${anaBusiness}, null, ${personalAgent}, 'Planejar finanças com dados da empresa') as id`,
      ),
    )) as unknown as [{ id: string }];

    expect(await categoryNames(ana, anaBusiness, personalAgent)).toContain("Comercial");
    // A concessão é para o agente pessoal; o agente empresarial continua sem ver o pessoal.
    expect(await categoryNames(ana, anaPersonal, businessAgent)).toEqual([]);
    // Leitura sim, escrita entre universos não.
    const [{ ok }] = (await app.asAgent(ana, personalAgent, (tx) =>
      tx.execute(sql.raw(`select app.can_write('${anaBusiness}') as ok`)),
    )) as unknown as [{ ok: boolean }];
    expect(ok).toBe(false);

    await app.asUser(ana, (tx) => tx.execute(sql.raw(`select app.revoke_access_grant('${grantId}')`)));
    expect(await categoryNames(ana, anaBusiness, personalAgent)).toEqual([]);

    const [grant] = await admin`select revoked_at, revoked_by from public.access_grants where id = ${grantId}`;
    expect(grant?.revoked_at).toBeInstanceOf(Date);
    expect(grant?.revoked_by).toBe(ana.sub);
  });

  it("concessão expirada não vale", async () => {
    const [{ id: grantId }] = (await app.asUser(ana, (tx) =>
      tx.execute(sql.raw(`select app.grant_workspace_read('${anaBusiness}', null, '${personalAgent}', 'Teste de validade') as id`)),
    )) as unknown as [{ id: string }];
    expect(await categoryNames(ana, anaBusiness, personalAgent)).not.toEqual([]);
    await admin`update public.access_grants
                set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
                where id = ${grantId}`;
    expect(await categoryNames(ana, anaBusiness, personalAgent)).toEqual([]);
  });

  it("concessão para o universo inteiro vale para todos os agentes dele", async () => {
    const [{ id: grantId }] = (await app.asUser(ana, (tx) =>
      tx.execute(sql.raw(`select app.grant_workspace_read('${anaBusiness}', '${anaPersonal}', null, 'Visão consolidada') as id`)),
    )) as unknown as [{ id: string }];
    expect(await categoryNames(ana, anaBusiness, personalAgent)).not.toEqual([]);
    expect(await categoryNames(ana, anaPersonal, businessAgent)).toEqual([]);
    await app.asUser(ana, (tx) => tx.execute(sql.raw(`select app.revoke_access_grant('${grantId}')`)));
    expect(await categoryNames(ana, anaBusiness, personalAgent)).toEqual([]);
  });

  it("agentes não alteram permissões: não concedem, não editam agentes, não veem concessões", async () => {
    await expectPgError(
      app.asAgent(ana, personalAgent, (tx) =>
        tx.execute(sql.raw(`select app.grant_workspace_read('${anaBusiness}', null, '${personalAgent}', 'auto-concessão')`)),
      ),
      "42501",
    );
    const renamed = await app.asAgent(ana, personalAgent, (tx) =>
      tx.update(agents).set({ name: "Superagente" }).where(eq(agents.id, personalAgent)).returning({ id: agents.id }),
    );
    expect(renamed).toEqual([]);
    await expectPgError(
      app.asAgent(ana, personalAgent, (tx) => tx.insert(agents).values({ workspaceId: anaPersonal, name: "Clone" })),
      "42501",
    );
    await expectPgError(
      app.asAgent(ana, personalAgent, (tx) => tx.insert(categories).values({ workspaceId: anaPersonal, name: "Do agente" })),
      "42501",
    );
    const grants = await app.asAgent(ana, personalAgent, (tx) => tx.select().from(accessGrants));
    expect(grants).toEqual([]);
  });

  it("agente arquivado perde todo o acesso", async () => {
    const [{ id: temp }] = await app.asUser(ana, (tx) =>
      tx.insert(agents).values({ workspaceId: anaPersonal, name: "Temporário" }).returning({ id: agents.id }),
    ) as [{ id: string }];
    expect(await categoryNames(ana, anaPersonal, temp)).not.toEqual([]);
    await app.asUser(ana, (tx) => tx.update(agents).set({ archivedAt: new Date() }).where(eq(agents.id, temp)));
    expect(await categoryNames(ana, anaPersonal, temp)).toEqual([]);
  });
});

describe("auditoria", () => {
  it("registra autor e alterações; dona lê; Bruno não lê", async () => {
    await app.asUser(ana, (tx) =>
      tx.update(workspaces).set({ description: "Agência de marketing" }).where(eq(workspaces.id, anaBusiness)),
    );
    const logs = await app.asUser(ana, (tx) =>
      tx.select().from(auditLogs).where(and(eq(auditLogs.workspaceId, anaBusiness), eq(auditLogs.action, "workspaces.update"))),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorType: "user", actorUserId: ana.sub });
    expect(logs[0]!.details).toMatchObject({ alteracoes: { description: { de: null, para: "Agência de marketing" } } });

    const brunoView = await app.asUser(bruno, (tx) => tx.select().from(auditLogs).where(eq(auditLogs.workspaceId, anaBusiness)));
    expect(brunoView).toEqual([]);
  });

  it("ninguém altera ou apaga a auditoria", async () => {
    await expectPgError(app.asUser(ana, (tx) => tx.update(auditLogs).set({ action: "apagado" })), "42501");
    await expectPgError(app.asUser(ana, (tx) => tx.delete(auditLogs)), "42501");
    await expectPgError(
      app.asUser(ana, (tx) => tx.insert(auditLogs).values({ actorType: "system", action: "forjado" })),
      "42501",
    );
  });

  it("concessões entram na auditoria com o autor", async () => {
    const rows = await admin`select actor_user_id from public.audit_logs where action = 'access_grants.insert'`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.actor_user_id === ana.sub)).toBe(true);
  });
});

describe("acessos sem contexto", () => {
  it("anon não lê nenhuma tabela", async () => {
    let caught: unknown;
    try {
      await admin.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select id from public.workspaces limit 1`;
      });
    } catch (error) {
      caught = error;
    }
    expect(pgErrorCode(caught)).toBe("42501");
  });

  it("o papel de conexão do app, fora do contexto do usuário, não lê nada (falha em vez de ignorar a RLS)", async () => {
    const raw = postgres(urls.appUrl, { max: 1, onnotice: () => {} });
    try {
      let caught: unknown;
      try {
        await raw`select id from public.workspaces limit 1`;
      } catch (error) {
        caught = error;
      }
      expect(pgErrorCode(caught)).toBe("42501");
    } finally {
      await raw.end({ timeout: 5 });
    }
  });
});
