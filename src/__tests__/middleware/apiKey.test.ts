import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { useApi } from "../helpers/api";

/**
 * CHARACTERIZATION TESTS — api-key middleware and /health
 *
 * This is the whole of the service's access control: one shared static key,
 * compared by string equality. There is no per-user auth, no scoping, and no
 * rate limiting. Anyone holding the key can read and write everything.
 *
 * That is precisely why the dashboard talks to a BFF instead of calling this
 * service from the browser.
 */

const { raw } = useApi();
const API_KEY = "test-key";

describe("/health", () => {
    // /health is registered BEFORE router.use(apiKeyMiddleware)
    // (routes.ts:10-19), making it the only unauthenticated route in the
    // service. Anything added above that middleware becomes public too.
    it("is reachable with no API key at all", async () => {
        const res = await raw().get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok" });
    });

    it("ignores an invalid API key rather than rejecting it", async () => {
        const res = await raw()
            .get("/health")
            .set("x-api-key", "totally-wrong");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok" });
    });

    it("reports 503 degraded when mongo is not connected", async () => {
        await mongoose.disconnect();

        try {
            const res = await raw().get("/health");

            expect(res.status).toBe(503);
            expect(res.body).toEqual({
                status: "degraded",
                checks: { mongo: "fail" },
            });
        } finally {
            // Restore before the suite-wide afterEach runs — it needs a live
            // connection to truncate collections.
            await mongoose.connect(process.env.MONGO_TEST_URI ?? "", {
                dbName: process.env.MONGO_TEST_DB,
            });
        }
    });
});

describe("api-key middleware", () => {
    // QUIRK: rejections are 403 (not the conventional 401) with a PLAIN TEXT
    // body (api-key.ts:12,16). Any client that expects JSON errors will fail to
    // parse these.
    it("403s with plain text when the key is missing", async () => {
        const res = await raw().get("/api/sessions/");

        expect(res.status).toBe(403);
        expect(res.text).toBe("API key is missing in the request");
        expect(res.type).not.toBe("application/json");
    });

    it("403s with plain text when the key is wrong", async () => {
        const res = await raw()
            .get("/api/sessions/")
            .set("x-api-key", "wrong-key");

        expect(res.status).toBe(403);
        expect(res.text).toBe("API key is invalid.");
    });

    it("allows the request through when the key matches", async () => {
        const res = await raw()
            .get("/api/sessions/")
            .set("x-api-key", API_KEY);

        expect(res.status).toBe(200);
    });

    it("matches the header case-insensitively", async () => {
        const res = await raw()
            .get("/api/sessions/")
            .set("X-API-KEY", API_KEY);

        expect(res.status).toBe(200);
    });

    // The middleware compares by exact string equality (api-key.ts:15) with no
    // trimming of its own — but Node's HTTP parser already strips the optional
    // whitespace around a header value (RFC 7230), so a padded key still
    // matches. Worth pinning so nobody "adds a .trim()" believing it changes
    // behaviour.
    it("accepts a key sent with surrounding whitespace, which HTTP strips", async () => {
        const res = await raw()
            .get("/api/sessions/")
            .set("x-api-key", ` ${API_KEY} `);

        expect(res.status).toBe(200);
    });

    it("rejects a key with embedded whitespace", async () => {
        const res = await raw()
            .get("/api/sessions/")
            .set("x-api-key", "test key");

        expect(res.status).toBe(403);
        expect(res.text).toBe("API key is invalid.");
    });

    it.each([
        ["/api/sessions/", "get"],
        ["/payload/", "get"],
        ["/report/", "get"],
        ["/user/", "get"],
        ["/protocol-specs/builds", "get"],
    ] as const)("guards %s", async (url, method) => {
        const res = await raw()[method](url);

        expect(res.status).toBe(403);
    });

    it("guards write routes too", async () => {
        const res = await raw()
            .post("/api/sessions/")
            .send({ sessionId: "x", npType: "BAP", sessionType: "AUTOMATION" });

        expect(res.status).toBe(403);
    });

    // QUIRK: an unset API_SERVICE_KEY throws synchronously inside the handler
    // (api-key.ts:9) rather than failing closed with a clean 500. In Express 4
    // a synchronous throw is caught by the default error handler, so the client
    // sees a 500 with an HTML stack page.
    it("500s when API_SERVICE_KEY is not configured on the server", async () => {
        const original = process.env.API_SERVICE_KEY;
        delete process.env.API_SERVICE_KEY;

        try {
            const res = await raw()
                .get("/api/sessions/")
                .set("x-api-key", API_KEY);

            expect(res.status).toBe(500);
        } finally {
            process.env.API_SERVICE_KEY = original;
        }
    });
});
