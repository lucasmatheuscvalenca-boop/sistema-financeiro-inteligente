/**
 * Espelho tipado das tabelas criadas em supabase/migrations (a fonte da verdade).
 * O teste test/drift.db.test.ts compara estas definições com o banco real.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const workspaceKind = pgEnum("workspace_kind", ["personal", "business"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const agentStatus = pgEnum("agent_status", [
  "available",
  "planning",
  "working",
  "waiting_agent",
  "waiting_approval",
  "paused",
  "done",
  "error",
]);
export const actorType = pgEnum("actor_type", ["user", "agent", "system"]);
export const grantResource = pgEnum("grant_resource", ["workspace", "category", "project", "document", "memory"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  emergencyStopAt: tz("emergency_stop_at"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  kind: workspaceKind("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  pausedAt: tz("paused_at"),
  createdBy: uuid("created_by").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  archivedAt: tz("archived_at"),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: memberRole("role").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  isSeed: boolean("is_seed").notNull().default(false),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  archivedAt: tz("archived_at"),
});

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  categoryId: uuid("category_id"),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  archivedAt: tz("archived_at"),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull(),
  departmentId: uuid("department_id"),
  name: text("name").notNull(),
  specialty: text("specialty"),
  description: text("description"),
  status: agentStatus("status").notNull().default("available"),
  createdBy: uuid("created_by"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at").notNull().defaultNow(),
  archivedAt: tz("archived_at"),
});

export const accessGrants = pgTable("access_grants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceWorkspaceId: uuid("source_workspace_id").notNull(),
  granteeWorkspaceId: uuid("grantee_workspace_id"),
  granteeAgentId: uuid("grantee_agent_id"),
  resourceType: grantResource("resource_type").notNull().default("workspace"),
  resourceId: uuid("resource_id"),
  permission: text("permission").notNull().default("read"),
  reason: text("reason").notNull(),
  grantedBy: uuid("granted_by").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
  expiresAt: tz("expires_at"),
  revokedAt: tz("revoked_at"),
  revokedBy: uuid("revoked_by"),
});

export const auditLogs = pgTable("audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  workspaceId: uuid("workspace_id"),
  actorType: actorType("actor_type").notNull(),
  actorUserId: uuid("actor_user_id"),
  actorAgentId: uuid("actor_agent_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: tz("created_at").notNull().defaultNow(),
});

export const allTables = {
  profiles,
  workspaces,
  workspaceMembers,
  categories,
  departments,
  agents,
  accessGrants,
  auditLogs,
} as const;
