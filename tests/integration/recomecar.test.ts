import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { ValidationError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import { createGoal } from "@/server/services/goals";
import { completeOnboarding, getPreferences, selectMascot } from "@/server/services/preferences";
import { createTransaction, listTransactions } from "@/server/services/transactions";
import { authenticate, resetUserData } from "@/server/services/users";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

async function count(table: string, userId: string): Promise<number> {
  const [{ n }] = (await getDb().execute(sql.raw(`select count(*)::int as n from ${table} where user_id = '${userId}'`))).rows as [{ n: number }];
  return n;
}

describe("Recomeçar do zero", () => {
  it("apaga só os dados financeiros da pessoa, mantém o login e volta ao primeiro acesso", async () => {
    const db = getDb();
    const lucas = await createUser("Lucas Reset");
    const outra = await createUser("Outra Pessoa");
    await selectMascot(lucas, "banqueiro");
    await completeOnboarding(lucas);
    const acc = await createAccount(lucas, { name: "Conta", type: "checking", initialBalanceCents: 100_000 });
    await createTransaction(lucas, { kind: "expense", amountCents: 2_500, date: "2026-10-20", description: "Café", accountId: acc.id });
    await createGoal(lucas, { name: "Viagem", kind: "travel", targetCents: 500_000, priority: 1 });
    const accOutra = await createAccount(outra, { name: "Conta dela", type: "checking", initialBalanceCents: 50_000 });
    await createTransaction(outra, { kind: "expense", amountCents: 1_000, date: "2026-10-20", description: "Pão", accountId: accOutra.id });
    const categoriesBefore = await count("categories", lucas.userId);
    expect(categoriesBefore).toBeGreaterThan(0);

    await expect(resetUserData(lucas, "senha-errada")).rejects.toBeInstanceOf(ValidationError);
    await resetUserData(lucas, lucas.password);

    for (const table of ["transactions", "accounts", "goals", "mascot_selections", "briefing_sections"]) expect(await count(table, lucas.userId)).toBe(0);
    // Categorias padrão voltam, como no cadastro.
    expect(await count("categories", lucas.userId)).toBe(categoriesBefore);
    const prefs = await getPreferences(lucas);
    expect(prefs.mascotId).toBeNull();
    expect(prefs.onboardingCompletedAt).toBeNull();
    expect(prefs.onboardingStep).toBe("welcome");
    const [profile] = await db.select().from(s.financialProfiles).where(eq(s.financialProfiles.userId, lucas.userId));
    expect(profile?.preferredName).toBe("Lucas");
    // Login continua o mesmo.
    await expect(authenticate(db, { email: lucas.email, password: lucas.password })).resolves.toBeTruthy();
    // A outra pessoa não perdeu nada.
    expect(await listTransactions(outra, {})).toHaveLength(1);
    expect(await count("accounts", outra.userId)).toBe(1);
  });
});
