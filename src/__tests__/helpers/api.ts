import type { Server } from "node:http";
import { afterAll, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../../app";

export const API_KEY = "test-key";

/**
 * Binds ONE HTTP server for the whole test file and points supertest at it.
 *
 * Passing an Express app straight to supertest makes it listen on an ephemeral
 * port and tear the server down again for EVERY request — several hundred
 * across this suite. Combined with mongod picking its own port, that port churn
 * produced genuinely baffling flakes: assertions seeing 401 or 404 from
 * something that was not this app at all, and "Parse Error: Expected HTTP/"
 * when a client landed on a non-HTTP socket.
 *
 * One long-lived server per file removes the churn, and the helpers below keep
 * the api-key boilerplate out of every call site.
 */
export function useApi() {
    let server: Server;

    beforeAll(() => {
        server = createApp().listen(0);
    });

    afterAll(
        () =>
            new Promise<void>((resolve, reject) =>
                server.close((err) => (err ? reject(err) : resolve())),
            ),
    );

    const authed = (test: request.Test) => test.set("x-api-key", API_KEY);

    return {
        get: (url: string) => authed(request(server).get(url)),
        post: (url: string) => authed(request(server).post(url)),
        put: (url: string) => authed(request(server).put(url)),
        del: (url: string) => authed(request(server).delete(url)),
        /** No API key attached — for testing the middleware itself. */
        raw: () => request(server),
    };
}
