/**
 * EMULADOR DO PROTOCOLO DO SUPABASE AUTH — SOMENTE PARA TESTES E2E.
 *
 * Esta sessão de desenvolvimento não consegue rodar o Supabase local (sem acesso a registros de contêiner), então
 * os testes de navegador usam este servidor mínimo que fala o mesmo protocolo HTTP que o @supabase/supabase-js
 * espera (/auth/v1/signup, /token, /user, /logout, /.well-known/jwks.json), assina JWT ES256 com JWKS como um
 * projeto Supabase com chaves assimétricas, e grava o usuário em auth.users — disparando o gatilho real de
 * provisionamento do banco. A validação contra o Supabase verdadeiro roda no CI (job "supabase-real").
 *
 * Nunca use isto fora dos testes.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import postgres from "postgres";

const PORT = Number(process.env.AUTH_EMULATOR_PORT ?? 54399);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_URL = process.env.E2E_ADMIN_DATABASE_URL;
if (!DB_URL) throw new Error("E2E_ADMIN_DATABASE_URL é obrigatório para o emulador.");

const sql = postgres(DB_URL, { max: 2, onnotice: () => {} });
const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
const kid = randomUUID();
const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig", key_ops: ["verify"] };

interface EmulatedUser {
  id: string;
  email: string;
  passwordHash: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const usersByEmail = new Map<string, EmulatedUser>();
const usersById = new Map<string, EmulatedUser>();
const refreshTokens = new Map<string, string>(); // token → user id (uso único)

const hash = (password: string) => createHash("sha256").update(password).digest("hex");

function userJson(u: EmulatedUser) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.createdAt,
    confirmed_at: u.createdAt,
    phone: "",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.metadata,
    identities: [],
    created_at: u.createdAt,
    updated_at: u.createdAt,
    is_anonymous: false,
  };
}

async function sessionFor(u: EmulatedUser) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const accessToken = await new SignJWT({
    email: u.email,
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.metadata,
    role: "authenticated",
    aal: "aal1",
    amr: [{ method: "password", timestamp: now }],
    session_id: randomUUID(),
    is_anonymous: false,
  })
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setIssuer(`${BASE}/auth/v1`)
    .setSubject(u.id)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .sign(privateKey);
  const refreshToken = randomBytes(24).toString("base64url");
  refreshTokens.set(refreshToken, u.id);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token: refreshToken,
    user: userJson(u),
  };
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, { "content-type": "application/json", "x-supabase-api-version": "2024-01-01" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, code: string, msg: string) {
  send(res, status, { code, error_code: code, msg });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function userFromBearer(req: IncomingMessage): Promise<EmulatedUser | null> {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "")?.[1];
  if (!token) return null;
  try {
    const { jwtVerify, importJWK } = await import("jose");
    const key = await importJWK(publicJwk, "ES256");
    const { payload } = await jwtVerify(token, key, { audience: "authenticated" });
    return usersById.get(String(payload.sub)) ?? null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", BASE);
    const path = url.pathname.replace(/^\/auth\/v1/, "");

    if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true, emulator: true });
    if (req.method === "GET" && path === "/.well-known/jwks.json") return send(res, 200, { keys: [publicJwk] });

    if (req.method === "POST" && path === "/signup") {
      const body = await readJson(req);
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!email.includes("@")) return fail(res, 400, "validation_failed", "Unable to validate email address");
      if (password.length < 6) return fail(res, 422, "weak_password", "Password should be at least 6 characters.");
      if (usersByEmail.has(email)) return fail(res, 422, "user_already_exists", "User already registered");
      const user: EmulatedUser = {
        id: randomUUID(),
        email,
        passwordHash: hash(password),
        metadata: (body.data as Record<string, unknown>) ?? {},
        createdAt: new Date().toISOString(),
      };
      // Mesmo efeito do Supabase: a linha em auth.users dispara o gatilho de provisionamento.
      await sql`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
                values (${user.id}, ${email}, ${sql.json(user.metadata as never)}, now())`;
      usersByEmail.set(email, user);
      usersById.set(user.id, user);
      return send(res, 200, await sessionFor(user));
    }

    if (req.method === "POST" && path === "/token") {
      const grant = url.searchParams.get("grant_type");
      const body = await readJson(req);
      if (grant === "password") {
        const user = usersByEmail.get(String(body.email ?? "").trim().toLowerCase());
        if (!user || user.passwordHash !== hash(String(body.password ?? ""))) {
          return fail(res, 400, "invalid_credentials", "Invalid login credentials");
        }
        return send(res, 200, await sessionFor(user));
      }
      if (grant === "refresh_token") {
        const token = String(body.refresh_token ?? "");
        const userId = refreshTokens.get(token);
        refreshTokens.delete(token);
        const user = userId ? usersById.get(userId) : undefined;
        if (!user) return fail(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
        return send(res, 200, await sessionFor(user));
      }
      return fail(res, 400, "validation_failed", "unsupported grant_type");
    }

    if (req.method === "GET" && path === "/user") {
      const user = await userFromBearer(req);
      if (!user) return fail(res, 401, "bad_jwt", "invalid JWT");
      return send(res, 200, userJson(user));
    }

    if (req.method === "POST" && path === "/logout") {
      res.writeHead(204);
      return res.end();
    }

    fail(res, 404, "not_found", `emulador: rota não suportada ${req.method} ${url.pathname}`);
  } catch (error) {
    console.error("[auth-emulator]", error);
    fail(res, 500, "unexpected_failure", "emulator error");
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`[auth-emulator] ouvindo em ${BASE}/auth/v1 (SOMENTE TESTES)`));

const shutdown = async () => {
  server.close();
  await sql.end({ timeout: 2 });
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
