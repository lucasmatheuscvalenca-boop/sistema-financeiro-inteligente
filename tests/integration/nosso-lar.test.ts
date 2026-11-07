import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createAccount } from "@/server/services/accounts";
import {
  getCoupleMonth,
  getHousehold,
  getMeeting,
  inviteToHousehold,
  leaveHousehold,
  receivedInvites,
  recordSettlement,
  respondInvite,
  saveMeeting,
  setAccountShared,
  setTransactionOwnership,
  updateHouseholdSettings,
} from "@/server/services/household";
import { createTransaction } from "@/server/services/transactions";
import { createUser } from "./helpers";

afterAll(async () => {
  await closeDb();
});

async function couple() {
  const ana = await createUser("Ana Lar");
  const bia = await createUser("Bia Lar");
  await inviteToHousehold(ana, { email: bia.email.toUpperCase() });
  const [invite] = await receivedInvites(bia);
  expect(invite?.inviterName).toBe("Ana Lar");
  await respondInvite(bia, invite!.id, true);
  return { ana, bia };
}

describe("Nosso lar", () => {
  it("convite pelo e-mail, aceite e as duas pessoas no mesmo lar", async () => {
    const { ana, bia } = await couple();
    const a = await getHousehold(ana);
    const b = await getHousehold(bia);
    expect(a!.id).toBe(b!.id);
    expect(a!.partner!.name).toBe("Bia Lar");
    expect(b!.partner!.name).toBe("Ana Lar");
    const intrusa = await createUser("Intrusa Lar");
    await expect(inviteToHousehold(ana, { email: intrusa.email })).rejects.toBeInstanceOf(ConflictError);
    await expect(inviteToHousehold(intrusa, { email: intrusa.email })).rejects.toBeInstanceOf(ValidationError);
  });

  it("a outra pessoa só vê o que é nosso; a divisão e o Pix saem para quem deve", async () => {
    const { ana, bia } = await couple();
    const contaAna = await createAccount(ana, { name: "Conta Ana", type: "checking", initialBalanceCents: 500_000, initialBalanceDate: "2026-10-01" });
    const contaBia = await createAccount(bia, { name: "Conta Bia", type: "checking", initialBalanceCents: 500_000, initialBalanceDate: "2026-10-01" });
    const [mercado] = await createTransaction(ana, { kind: "expense", amountCents: 40_000, date: "2026-10-10", description: "Mercado do mês", accountId: contaAna.id });
    const [remedio] = await createTransaction(ana, { kind: "expense", amountCents: 6_000, date: "2026-10-11", description: "Remédio da Bia", accountId: contaAna.id });
    await createTransaction(ana, { kind: "expense", amountCents: 99_000, date: "2026-10-12", description: "Presente surpresa", accountId: contaAna.id });
    const [luz] = await createTransaction(bia, { kind: "expense", amountCents: 10_000, date: "2026-10-15", description: "Luz", accountId: contaBia.id });
    await setTransactionOwnership(ana, mercado!.id, "ours");
    await setTransactionOwnership(ana, remedio!.id, "theirs");
    await setTransactionOwnership(bia, luz!.id, "ours");
    // Bia não consegue marcar lançamento da Ana.
    await expect(setTransactionOwnership(bia, mercado!.id, "mine")).rejects.toBeInstanceOf(NotFoundError);

    const vistoPelaBia = await getCoupleMonth(bia, "2026-10");
    expect(vistoPelaBia!.items.map((i) => i.description).sort()).toEqual(["Luz", "Mercado do mês", "Remédio da Bia"]);
    expect(vistoPelaBia!.items.some((i) => i.description === "Presente surpresa")).toBe(false);
    // Nosso: 400 + 100 = 500 → 250 cada; Ana pagou 400 + 60 (remédio da Bia); Bia pagou 100 e deve 250 + 60.
    expect(vistoPelaBia!.split.sharedCents).toBe(50_000);
    expect(vistoPelaBia!.split.settlement).toEqual({ fromId: bia.userId, toId: ana.userId, amountCents: 21_000 });
    expect(vistoPelaBia!.pix).toBeNull(); // Ana ainda não cadastrou a chave

    await updateHouseholdSettings(ana, { pixKey: "ana@exemplo.com", pixCity: "Recife" });
    const comPix = await getCoupleMonth(bia, "2026-10");
    expect(comPix!.pix).toContain("0014br.gov.bcb.pix0115ana@exemplo.com");
    expect(comPix!.pix).toContain("5406210.00");
    expect((await getCoupleMonth(ana, "2026-10"))!.pix).toBeNull(); // quem recebe não vê código para pagar

    await expect(recordSettlement(bia, { month: "2026-10", amountCents: 30_000 })).rejects.toBeInstanceOf(ValidationError);
    await recordSettlement(bia, { month: "2026-10", amountCents: 21_000 });
    expect((await getCoupleMonth(ana, "2026-10"))!.split.settlement).toBeNull();
  });

  it("conta conjunta: tudo que sai dela é nosso; proporcional à renda", async () => {
    const { ana, bia } = await couple();
    const conjunta = await createAccount(ana, { name: "Conjunta", type: "checking", initialBalanceCents: 500_000, initialBalanceDate: "2026-10-01" });
    await setAccountShared(ana, conjunta.id, true);
    await createTransaction(ana, { kind: "expense", amountCents: 100_000, date: "2026-10-05", description: "Aluguel", accountId: conjunta.id });
    await updateHouseholdSettings(ana, { splitMode: "income", incomeCents: 600_000 });
    expect((await getCoupleMonth(bia, "2026-10"))!.incomeMissing).toBe(true);
    await updateHouseholdSettings(bia, { incomeCents: 400_000 });
    const m = await getCoupleMonth(bia, "2026-10");
    expect(m!.incomeMissing).toBe(false);
    expect(m!.split.settlement).toEqual({ fromId: bia.userId, toId: ana.userId, amountCents: 40_000 });
  });

  it("reunião guarda os combinados; sair do lar esconde tudo da outra pessoa", async () => {
    const { ana, bia } = await couple();
    await saveMeeting(ana, { month: "2026-10", decisions: ["Delivery no máximo 2x por semana", "Juntar 500 para a viagem"], notes: "Foi tranquilo." });
    expect((await getMeeting(bia, "2026-10"))!.decisions).toEqual(["Delivery no máximo 2x por semana", "Juntar 500 para a viagem"]);
    await leaveHousehold(bia);
    expect(await getHousehold(bia)).toBeNull();
    expect((await getHousehold(ana))!.partner).toBeNull();
    expect(await getCoupleMonth(ana, "2026-10")).toBeNull();
  });
});
