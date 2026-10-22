import { config } from "dotenv";

/** Mesma ordem do Next.js: .env.local (máquina do desenvolvedor) tem prioridade sobre .env. */
config({ path: [".env.local", ".env"], quiet: true });
