import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // O app web nunca importa o migrador nem cria conexões fora do contexto de usuário.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "postgres", message: "Use @myoffice/db (connect().asUser) — nunca o driver direto no app web." },
            { name: "@myoffice/db/migrate", message: "Migrações não rodam pelo app web." },
          ],
        },
      ],
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"],
  },
];

export default config;
