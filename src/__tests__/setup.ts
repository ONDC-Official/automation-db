import { afterAll, afterEach, beforeAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * One mongod per worker, started here rather than in a vitest `globalSetup`.
 *
 * globalSetup runs in vitest's main process, and the mongod it spawns there
 * leaks file handles that stall shutdown for the full 10s teardownTimeout.
 * Owning the server per worker exits cleanly, runs faster, and gives each test
 * file a database nothing else can touch.
 *
 * This is a real MongoDB binary, not an in-memory fake, so aggregation
 * pipelines and index behaviour match production — which is what makes these
 * tests worth anything once Phase B adds `$group` work.
 */
let mongod: MongoMemoryServer;

/**
 * Unique per worker.
 *
 * Test files run in parallel forks, each starting its own mongod on a port it
 * picks itself — and that port selection is a race two workers can lose,
 * landing both on the same server. A per-worker database name makes the suite
 * immune to that: even if two workers share a mongod, they never share data.
 */
const TEST_DB_NAME = `automation_db_test_${process.pid}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    // Published so a test that deliberately disconnects (see apiKey.test.ts)
    // can reconnect to the same place afterwards.
    process.env.MONGO_TEST_URI = mongod.getUri();
    process.env.MONGO_TEST_DB = TEST_DB_NAME;
    await mongoose.connect(mongod.getUri(), { dbName: TEST_DB_NAME });
});

// Empty every collection between tests so ordering never matters.
//
// Enumerated from the database rather than mongoose.connection.collections:
// GridFS creates reports.files/reports.chunks straight through the driver, so
// they never appear in the model registry and would otherwise leak between
// tests.
afterEach(async () => {
    const db = mongoose.connection.db;
    if (!db) return;

    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    await Promise.all(
        collections.map((c) => db.collection(c.name).deleteMany({})),
    );
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop({ doCleanup: true, force: true });
});
