import "server-only";
import { schema } from "@myoffice/db";
import { eq } from "drizzle-orm";
import type { AuthContext } from "../auth";
import { db } from "../db";

const { profiles } = schema;

export interface ProfileDTO {
  displayName: string;
}

export async function getProfile(auth: AuthContext): Promise<ProfileDTO | null> {
  const [row] = await db().asUser(auth.claims, (tx) =>
    tx.select({ displayName: profiles.displayName }).from(profiles).where(eq(profiles.id, auth.userId)),
  );
  return row ?? null;
}

export async function updateDisplayName(auth: AuthContext, displayName: string): Promise<boolean> {
  const rows = await db().asUser(auth.claims, (tx) =>
    tx.update(profiles).set({ displayName }).where(eq(profiles.id, auth.userId)).returning({ id: profiles.id }),
  );
  return rows.length === 1;
}
