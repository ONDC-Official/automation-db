import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        // No globals — tests import describe/it/expect from "vitest" explicitly
        // so tsc can typecheck them without a global type shim.
        globals: false,
        // Forks keep each file's mongod and mongoose connection isolated.
        pool: "forks",
        // Parallel is safe ONLY because of two things, both load-bearing:
        //   1. helpers/api.ts binds one server per FILE instead of letting
        //      supertest create and destroy one per request. The old churn of
        //      several hundred ephemeral servers racing mongod for ports caused
        //      assertions to see responses from something that was not this app
        //      ("Parse Error: Expected HTTP/", stray 401s and 404s).
        //   2. setup.ts gives each worker a uniquely-named database, so even if
        //      two mongod instances collide on a port, they cannot share data.
        // Remove either and the suite goes intermittently red.
        fileParallelism: true,
        // First run downloads a mongod binary.
        testTimeout: 30_000,
        hookTimeout: 60_000,
        setupFiles: ["src/__tests__/setup.ts"],
        include: ["src/__tests__/**/*.test.ts"],
        env: {
            NODE_ENV: "test",
            API_SERVICE_KEY: "test-key",
        },
    },
    resolve: {
        alias: {
            // The real logger throws at import time unless NODE_ENV is set, and
            // ships logs to Loki as a side effect. Neither is wanted in tests.
            "@ondc/automation-logger": path.resolve(
                dirname,
                "src/__tests__/stubs/logger.ts",
            ),
        },
    },
});
