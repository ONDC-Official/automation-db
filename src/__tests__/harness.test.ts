import { describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { useApi } from "./helpers/api";
import { seedSession } from "./factories";
import { SessionDetails } from "../entity/SessionDetails";

const { get, raw } = useApi();

describe("test harness", () => {
    it("connects mongoose to the in-memory mongod", () => {
        expect(mongoose.connection.readyState).toBe(1);
    });

    it("serves /health without an API key", async () => {
        const res = await raw().get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok" });
    });

    it("persists and reads back a seeded session", async () => {
        await seedSession({ sessionId: "harness-session" });

        const found = await SessionDetails.findOne({
            sessionId: "harness-session",
        });

        expect(found?.domain).toBe("ONDC:FIS10");
    });

    it("cleans collections between tests", async () => {
        expect(await SessionDetails.countDocuments()).toBe(0);
    });
});
