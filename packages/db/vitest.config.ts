import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: "unit", include: ["test/**/*.unit.test.ts"], environment: "node" },
      },
      {
        test: {
          name: "db",
          include: ["test/**/*.db.test.ts"],
          environment: "node",
          globalSetup: ["test/global-setup.ts"],
          // Os arquivos dividem o mesmo banco de teste.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
