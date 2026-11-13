import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { useApi } from "../helpers/api";
import { payloadData, seedPayload, seedSession } from "../factories";
import { SessionDetails } from "../../entity/SessionDetails";

/** The NP Portal session list and the activity data behind it. */

const { get, post, put } = useApi();

const DAY = 24 * 60 * 60 * 1000;
const ORG = "org-1";
const ago = (ms: number) => new Date(Date.now() - ms);

const session = (sessionId: string, overrides: Record<string, unknown> = {}) =>
    seedSession({
        sessionId,
        orgId: ORG,
        domain: "ONDC:RET10",
        version: "1.2.5",
        usecaseId: "GROCERY",
        lastActivityAt: new Date(),
        ...overrides,
    } as never);

const seedFlow = (flowId: string, ...apis: string[]) =>
    mongoose.connection.db!.collection("build_flows").insertOne({
        flowId,
        domain: "ONDC:RET10",
        version: "1.2.5",
        usecase: "GROCERY",
        config: { steps: apis.map((api) => ({ api })) },
    });

const reply = (status: string) => ({
    jsonResponse: { response: { message: { ack: { status } } } },
});

const saveMessage = (sessionId: string, action: string, status = "ACK", flowId = "A") => {
    const { sessionId: _unused, ...body } = payloadData({
        action,
        flowId,
        transactionId: "t1",
        ...reply(status),
    });
    return post("/api/sessions/payload").send({ ...body, sessionDetails: { sessionId } });
};

/** A message as the recorder sends it: with the transaction's calls so far. */
const sendRun = (
    sessionId: string,
    { flowId = "A", transactionId = "t1", apiList }: { flowId?: string; transactionId?: string; apiList?: unknown },
) => {
    const { sessionId: _unused, ...body } = payloadData({ action: "SEARCH", flowId, transactionId, ...reply("ACK") });
    return post("/api/sessions/payload").send({ ...body, sessionDetails: { sessionId }, apiList });
};

const call = (action: string, ack = "ACK", messageId = `${action}-1`) => ({ action, messageId, ack });

const row = (sessionId: string) =>
    SessionDetails.findOne({ sessionId }).lean() as Promise<any>;

const list = async (query = "", orgId = ORG) => {
    const res = await get(`/api/sessions/portal/${orgId}${query}`);
    expect(res.status).toBe(200);
    return res.body;
};

const ids = (body: { sessions: { sessionId: string }[] }) =>
    body.sessions.map((s) => s.sessionId).sort();

describe("GET /api/sessions/portal/:orgId", () => {
    it("returns only that organisation's sessions, newest first", async () => {
        await session("old", { createdAt: ago(2 * DAY) });
        await session("new", { createdAt: ago(DAY) });
        await session("other", { orgId: "org-2" });
        await session("no-org", { orgId: undefined });

        const body = await list();

        expect(body.sessions.map((s: any) => s.sessionId)).toEqual(["new", "old"]);
        expect(body.hasMore).toBe(false);
    });

    it("returns an empty list for an organisation with no sessions", async () => {
        expect(await list("", "nobody")).toEqual({ sessions: [], hasMore: false });
    });

    it("stops at 100 and says when more matched", async () => {
        await SessionDetails.insertMany(
            Array.from({ length: 101 }, (_, i) => ({
                sessionId: `s-${i}`,
                npType: "BAP",
                sessionType: "AUTOMATION",
                orgId: ORG,
            })),
        );

        const body = await list();

        expect(body.sessions).toHaveLength(100);
        expect(body.hasMore).toBe(true);
    });

    it("decides status from the last 4 days of activity", async () => {
        await session("live", { lastActivityAt: ago(3 * DAY) });
        await session("gone", { lastActivityAt: ago(5 * DAY) });

        const body = await list();
        const status = (id: string) =>
            body.sessions.find((s: any) => s.sessionId === id).status;

        expect(status("live")).toBe("active");
        expect(status("gone")).toBe("expired");
        expect(ids(await list("?status=active"))).toEqual(["live"]);
        expect(ids(await list("?status=expired"))).toEqual(["gone"]);
    });

    it("combines different filters with AND and repeats with OR", async () => {
        await session("a", { domain: "ONDC:RET10", npType: "BAP" });
        await session("b", { domain: "ONDC:RET11", npType: "BAP" });
        await session("c", { domain: "ONDC:RET11", npType: "BPP" });
        await session("d", { domain: "ONDC:RET12", npType: "BAP" });

        expect(ids(await list("?domain=ONDC:RET10&domain=ONDC:RET11"))).toEqual(["a", "b", "c"]);
        expect(ids(await list("?domain=ONDC:RET11&npType=BPP"))).toEqual(["c"]);
    });

    it.each([
        ["reportExists=true", { reportExists: true }],
        ["userId=u9", { userId: "u9" }],
        ["version=9.9.9", { version: "9.9.9" }],
        ["usecaseId=F%26B", { usecaseId: "F&B" }],
        ["sessionType=MANUAL", { sessionType: "MANUAL" }],
        ["npId=https://x.example", { npId: "https://x.example" }],
        ["flowId=F1", { flowIds: ["F0", "F1"] }],
    ])("filters by %s", async (query, match) => {
        await session("hit", match);
        await session("miss");

        expect(ids(await list(`?${query}`))).toEqual(["hit"]);
    });

    it("treats reportExists=false as no report, including older sessions", async () => {
        await session("with", { reportExists: true });
        await session("without", { reportExists: false });

        expect(ids(await list("?reportExists=false"))).toEqual(["without"]);
        expect(ids(await list("?reportExists=maybe"))).toEqual(["with", "without"]);
    });

    it("treats the from time as inclusive and the to time as exclusive", async () => {
        const at = new Date("2026-10-10T00:00:00.000Z");
        await session("at", { createdAt: at, lastActivityAt: at });
        const iso = at.toISOString();

        expect(ids(await list(`?createdFrom=${iso}`))).toEqual(["at"]);
        expect(ids(await list(`?createdTo=${iso}`))).toEqual([]);
        expect(ids(await list(`?lastActivityFrom=${iso}`))).toEqual(["at"]);
        expect(ids(await list(`?lastActivityTo=${iso}`))).toEqual([]);
    });

    it("searches session, subscriber and user, ignoring case", async () => {
        await session("sess-ABC");
        await session("x", { npId: "https://abc.example" });
        await session("y", { userId: "user-abc" });
        await session("z");

        expect(ids(await list("?q=aBc"))).toEqual(["sess-ABC", "x", "y"]);
    });

    it("treats q as plain text, not a pattern", async () => {
        await session("plain");

        expect(ids(await list("?q=.*"))).toEqual([]);
    });

    it("sends list fields only", async () => {
        await session("s");

        const [item] = (await list()).sessions;

        expect(Object.keys(item).sort()).toEqual(
            [
                "createdAt",
                "domain",
                "lastActivityAt",
                "npId",
                "npType",
                "reportExists",
                "sessionId",
                "sessionType",
                "status",
                "usecaseId",
                "userId",
                "version",
            ].sort(),
        );
    });
});

describe("activity recording", () => {
    it("starts last activity when a session is created or updated", async () => {
        const created = await post("/api/sessions").send({
            sessionId: "c1",
            npType: "BAP",
            sessionType: "AUTOMATION",
        });
        expect(created.status).toBe(201);
        const first = (await row("c1")).lastActivityAt;
        expect(first).toBeInstanceOf(Date);

        await new Promise((resolve) => setTimeout(resolve, 5));
        await put("/api/sessions/c1").send({ domain: "ONDC:RET10" });
        expect((await row("c1")).lastActivityAt.getTime()).toBeGreaterThan(first.getTime());

        await post("/api/sessions/upsert").send({ sessionId: "u1", npType: "BAP" });
        expect((await row("u1")).lastActivityAt).toBeInstanceOf(Date);
    });

    it("updates activity and flows when a message is saved", async () => {
        await session("s", { lastActivityAt: ago(9 * DAY) });
        const before = await row("s");

        expect((await saveMessage("s", "SEARCH")).status).toBe(201);
        await vi.waitFor(async () => expect((await row("s")).flowIds).toEqual(["A"]));
        expect((await row("s")).lastActivityAt.getTime()).toBeGreaterThan(
            before.lastActivityAt.getTime(),
        );

        await saveMessage("s", "ON_SEARCH");
        await saveMessage("s", "SELECT", "ACK", "B");
        await vi.waitFor(async () => expect((await row("s")).flowIds).toEqual(["A", "B"]));
    });

    it("works from the saved message alone, reading nothing", async () => {
        await session("s");
        const findOne = vi.spyOn(SessionDetails, "findOne");
        const find = vi.spyOn(SessionDetails, "find");

        await saveMessage("s", "SEARCH");
        await new Promise((resolve) => setTimeout(resolve, 50));
        const reads = findOne.mock.calls.length + find.mock.calls.length;
        findOne.mockRestore();
        find.mockRestore();

        expect(reads).toBe(0);
        expect((await row("s")).flowIds).toEqual(["A"]);
    });

    it("leaves updatedAt alone, because the dashboard reads it", async () => {
        await session("s");
        const before = await row("s");

        await saveMessage("s", "SEARCH");
        await vi.waitFor(async () => expect((await row("s")).flowIds).toEqual(["A"]));

        expect((await row("s")).updatedAt).toEqual(before.updatedAt);
    });

    it("skips sessions with no organisation", async () => {
        await session("s", { orgId: undefined, lastActivityAt: undefined });

        await saveMessage("s", "SEARCH");
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect((await row("s")).flowIds).toEqual([]);
    });

    it("still saves the message when the update fails", async () => {
        const spy = vi
            .spyOn(SessionDetails, "updateOne")
            .mockImplementation(() => {
                throw new Error("database down");
            });
        await session("s");

        const res = await saveMessage("s", "SEARCH");
        await new Promise((resolve) => setTimeout(resolve, 50));
        spy.mockRestore();

        expect(res.status).toBe(201);
        expect((await get("/api/sessions/payload/s")).status).toBe(200);
        expect((await row("s")).flowIds).toEqual([]);
    });

    it("does not move last activity back for a message that arrives late", async () => {
        const now = new Date();
        await session("s", { lastActivityAt: now });
        const { SessionDetailsRepository } = await import(
            "../../repositories/SessionDetailsRepository"
        );

        await new SessionDetailsRepository().saveMessageActivity("s", {
            at: ago(DAY),
            flowId: "A",
        });

        const saved = await row("s");
        expect(saved.lastActivityAt).toEqual(now);
        expect(saved.flowIds).toEqual(["A"]);
    });
});

describe("flow runs from the recorder", () => {
    const runs = async (sessionId = "s") => (await row(sessionId)).flowRuns ?? [];
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

    it("starts a run for a flow seen for the first time", async () => {
        await session("s");

        await sendRun("s", { apiList: [call("search")] });

        await vi.waitFor(async () =>
            expect(await runs()).toEqual([
                { flowId: "A", transactionId: "t1", transactionIds: ["t1"], steps: [call("search")] },
            ]),
        );
        expect((await row("s")).flowIds).toEqual(["A"]);
    });

    it("keeps the growing list of the same transaction", async () => {
        await session("s");
        await sendRun("s", { apiList: [call("search")] });
        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));

        await sendRun("s", { apiList: [call("search"), call("on_search", "NACK")] });

        await vi.waitFor(async () => expect((await runs())[0].steps).toHaveLength(2));
        expect((await runs())[0]).toMatchObject({ transactionId: "t1", transactionIds: ["t1"] });
    });

    it("does not let an older, shorter list of the same transaction replace a longer one", async () => {
        await session("s");
        await sendRun("s", { apiList: [call("search"), call("on_search")] });
        await vi.waitFor(async () => expect((await runs())[0]?.steps).toHaveLength(2));

        await sendRun("s", { apiList: [call("search")] });
        await settle();

        expect((await runs())[0].steps).toHaveLength(2);
    });

    it("makes a new transaction (a retry) the latest run and keeps every ID", async () => {
        await session("s");
        await sendRun("s", { transactionId: "t1", apiList: [call("search", "NACK")] });
        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));

        await sendRun("s", { transactionId: "t2", apiList: [call("search")] });

        await vi.waitFor(async () => expect((await runs())[0].transactionId).toBe("t2"));
        expect(await runs()).toEqual([
            { flowId: "A", transactionId: "t2", transactionIds: ["t1", "t2"], steps: [call("search")] },
        ]);
    });

    it("ignores a late message from an older transaction", async () => {
        await session("s");
        await sendRun("s", { transactionId: "t1", apiList: [call("search", "NACK")] });
        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));
        await sendRun("s", { transactionId: "t2", apiList: [call("search")] });
        await vi.waitFor(async () => expect((await runs())[0].transactionId).toBe("t2"));

        await sendRun("s", { transactionId: "t1", apiList: [call("search", "NACK"), call("on_search", "NACK"), call("x")] });
        await settle();

        expect(await runs()).toEqual([
            { flowId: "A", transactionId: "t2", transactionIds: ["t1", "t2"], steps: [call("search")] },
        ]);
    });

    it("keeps each flow's run separate, including flow IDs with dots", async () => {
        await session("s");
        await sendRun("s", { flowId: "ORDER_FLOW_WITH_IGM(v-1.0.0)", apiList: [call("search")] });
        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));

        await sendRun("s", { flowId: "B", transactionId: "t9", apiList: [call("select", "NACK")] });

        await vi.waitFor(async () => expect(await runs()).toHaveLength(2));
        expect((await runs()).map((r: any) => [r.flowId, r.transactionId, r.steps.length])).toEqual([
            ["ORDER_FLOW_WITH_IGM(v-1.0.0)", "t1", 1],
            ["B", "t9", 1],
        ]);
        expect((await row("s")).flowIds).toEqual(["ORDER_FLOW_WITH_IGM(v-1.0.0)", "B"]);
    });

    it("stores text from a message as text, never as a database expression", async () => {
        await session("s", { flowIds: ["$flowIds"] });

        await sendRun("s", {
            flowId: "$flowIds",
            transactionId: "$$ROOT",
            apiList: [{ action: "$sessionId", messageId: "$$REMOVE", ack: "$lastActivityAt" }],
        });

        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));
        expect(await runs()).toEqual([
            {
                flowId: "$flowIds",
                transactionId: "$$ROOT",
                transactionIds: ["$$ROOT"],
                steps: [{ action: "$sessionId", messageId: "$$REMOVE", ack: "$LASTACTIVITYAT" }],
            },
        ]);
        expect((await row("s")).flowIds).toEqual(["$flowIds"]);
    });

    it("leaves runs alone when the recorder sends no list (older recorder)", async () => {
        await session("s");
        await sendRun("s", { apiList: [call("search")] });
        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));

        await saveMessage("s", "ON_SEARCH", "ACK", "B");

        await vi.waitFor(async () => expect((await row("s")).flowIds).toEqual(["A", "B"]));
        expect(await runs()).toHaveLength(1);
    });

    it("records no run for a message without a transaction or flow", async () => {
        await session("s");
        const { SessionDetailsRepository } = await import("../../repositories/SessionDetailsRepository");
        const repo = new SessionDetailsRepository();

        await repo.saveMessageActivity("s", { at: new Date(), flowId: "A", steps: [call("search")] });
        await repo.saveMessageActivity("s", { at: new Date(), transactionId: "t1", steps: [call("search")] });

        expect(await runs()).toEqual([]);
        expect((await row("s")).flowIds).toEqual(["A"]);
    });

    it("saves an empty list as a run with no calls", async () => {
        await session("s");

        await sendRun("s", { apiList: [] });

        await vi.waitFor(async () =>
            expect(await runs()).toEqual([{ flowId: "A", transactionId: "t1", transactionIds: ["t1"], steps: [] }]),
        );
    });

    it("skips sessions with no organisation", async () => {
        await session("s", { orgId: undefined });

        await sendRun("s", { apiList: [call("search")] });
        await settle();

        expect(await runs()).toEqual([]);
    });

    it("does not save the list in the payload itself", async () => {
        await session("s");

        expect((await sendRun("s", { apiList: [call("search")] })).status).toBe(201);

        const { Payload } = await import("../../entity/Payload");
        const saved: any = await Payload.findOne({ sessionId: "s" }).lean();
        expect(saved).toBeTruthy();
        expect(saved.apiList).toBeUndefined();
    });

    it("still writes only once per message and reads nothing", async () => {
        await session("s");
        const findOne = vi.spyOn(SessionDetails, "findOne");
        const find = vi.spyOn(SessionDetails, "find");
        const updateOne = vi.spyOn(SessionDetails, "updateOne");

        await sendRun("s", { apiList: [call("search")] });
        await vi.waitFor(async () => expect(updateOne).toHaveBeenCalledTimes(1));
        await settle();
        const reads = findOne.mock.calls.length + find.mock.calls.length;
        const writes = updateOne.mock.calls.length;
        findOne.mockRestore();
        find.mockRestore();
        updateOne.mockRestore();

        expect(reads).toBe(0);
        expect(writes).toBe(1);
    });

    it("counts the steps end to end: retry, NACK, late callback, forms", async () => {
        await seedFlow("A", "search", "on_search", "html_form", "select", "on_select");
        await session("s");
        await sendRun("s", { transactionId: "t1", apiList: [call("search", "NACK")] });
        await vi.waitFor(async () => expect(await runs()).toHaveLength(1));
        await sendRun("s", {
            transactionId: "t2",
            apiList: [call("search"), call("on_search"), call("select"), call("search", "NACK")],
        });
        await vi.waitFor(async () => expect((await runs())[0].transactionId).toBe("t2"));

        const { body } = await get(`/api/sessions/portal/${ORG}/s`);

        expect(body.flowSummary).toEqual([
            { flowId: "A", totalSteps: 5, passedSteps: 4, failedSteps: 0, transactionIds: ["t1", "t2"] },
        ]);
    });
});

describe("GET /api/sessions/portal/:orgId/:sessionId", () => {
    const detail = (sessionId: string, orgId = ORG) =>
        get(`/api/sessions/portal/${orgId}/${sessionId}`);

    it("returns the session in full, with every flow of the build", async () => {
        await seedFlow("A", "search", "on_search");
        await seedFlow("B", "select");
        await session("s", {
            reportExists: true,
            settings: { useGzip: false },
            settingsHistory: [
                {
                    changedAt: new Date(),
                    changedBy: "u1",
                    changes: [{ setting: "useGzip", previousValue: true, newValue: false }],
                },
            ],
        });
        await sendRun("s", { apiList: [call("search")] });
        await vi.waitFor(async () => expect((await row("s")).flowRuns).toHaveLength(1));

        const res = await detail("s");

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            sessionId: "s",
            orgId: ORG,
            status: "active",
            reportExists: true,
            settings: { useGzip: false },
            settingsHistory: [{ changedBy: "u1" }],
        });
        expect(res.body.flowSummary).toEqual([
            { flowId: "A", totalSteps: 2, passedSteps: 1, failedSteps: 0, transactionIds: ["t1"] },
            { flowId: "B", totalSteps: 1, passedSteps: 0, failedSteps: 0, transactionIds: [] },
        ]);
        expect(res.body.flowRuns).toBeUndefined();
    });

    it("never reads saved messages", async () => {
        await seedFlow("A", "search", "on_search");
        await session("s");
        await sendRun("s", { apiList: [call("search"), call("on_search", "NACK")] });
        await vi.waitFor(async () => expect((await row("s")).flowRuns).toHaveLength(1));
        const { Payload } = await import("../../entity/Payload");
        const find = vi.spyOn(Payload, "find");
        const findOne = vi.spyOn(Payload, "findOne");
        const aggregate = vi.spyOn(Payload, "aggregate");

        const res = await detail("s");
        const reads = find.mock.calls.length + findOne.mock.calls.length + aggregate.mock.calls.length;
        find.mockRestore();
        findOne.mockRestore();
        aggregate.mockRestore();

        expect(reads).toBe(0);
        expect(res.body.flowSummary[0]).toMatchObject({ passedSteps: 1, failedSteps: 1 });
    });

    it("shows zero counts for a session from before flow runs were saved", async () => {
        await seedFlow("A", "search");
        await session("s", { flowIds: ["A"] });
        await seedPayload({ sessionId: "s", action: "SEARCH", flowId: "A", transactionId: "t1", ...reply("ACK") });

        const { body } = await detail("s");

        expect(body.flowSummary).toEqual([
            { flowId: "A", totalSteps: 1, passedSteps: 0, failedSteps: 0, transactionIds: [] },
        ]);
    });

    it("gives the expiry 4 days after last activity", async () => {
        const at = ago(DAY);
        await session("s", { lastActivityAt: at });

        const { body } = await detail("s");

        expect(new Date(body.expiresAt).getTime()).toBe(at.getTime() + 4 * DAY);
    });

    it("has no expiry once expired", async () => {
        await session("s", { lastActivityAt: ago(5 * DAY) });

        const { body } = await detail("s");

        expect(body.status).toBe("expired");
        expect(body.expiresAt).toBeNull();
    });

    it("has null settings and no history for an older session", async () => {
        await session("s");

        const { body } = await detail("s");

        expect(body.settings).toBeNull();
        expect(body.settingsHistory).toEqual([]);
    });

    it("answers 404 for an unknown session, another company, or no company", async () => {
        await session("mine");
        await session("theirs", { orgId: "org-2" });
        await session("none", { orgId: undefined });

        expect((await detail("nope")).status).toBe(404);
        expect((await detail("theirs")).status).toBe(404);
        expect((await detail("none")).status).toBe(404);
    });
});

describe("POST /api/sessions/:sessionId/settings", () => {
    const change = (setting: string) => ({
        settings: { [setting]: true },
        changedBy: "u1",
        changes: [{ setting, previousValue: false, newValue: true }],
    });
    const save = (sessionId: string, body: unknown) =>
        post(`/api/sessions/${sessionId}/settings`).send(body as object);

    it("saves the settings and the change", async () => {
        await session("s");

        const res = await save("s", change("useGzip"));

        expect(res.status).toBe(204);
        const stored = await row("s");
        expect(stored.settings).toEqual({ useGzip: true });
        expect(stored.settingsHistory).toHaveLength(1);
        expect(stored.settingsHistory[0]).toMatchObject({
            changedBy: "u1",
            changes: [{ setting: "useGzip", previousValue: false, newValue: true }],
        });
    });

    it("saves the settings but no history entry when nothing changed", async () => {
        await session("s");

        await save("s", { settings: { useGzip: true }, changes: [] });

        const stored = await row("s");
        expect(stored.settings).toEqual({ useGzip: true });
        expect(stored.settingsHistory).toEqual([]);
    });

    it("keeps the last 10 changes, newest first", async () => {
        await session("s");

        for (let i = 0; i < 11; i++) {
            await save("s", change(`setting${i}`));
        }

        const names = (await row("s")).settingsHistory.map(
            (entry: any) => entry.changes[0].setting,
        );
        expect(names).toHaveLength(10);
        expect(names[0]).toBe("setting10");
        expect(names[9]).toBe("setting1");
    });

    it("leaves updatedAt alone", async () => {
        await session("s");
        const before = await row("s");

        await save("s", change("useGzip"));

        expect((await row("s")).updatedAt).toEqual(before.updatedAt);
    });

    it("answers 404 for an unknown session and 400 with no settings", async () => {
        await session("s");

        expect((await save("nope", change("useGzip"))).status).toBe(404);
        expect((await save("s", {})).status).toBe(400);
    });

    it("keeps starting settings given when the session is created", async () => {
        await post("/api/sessions/upsert").send({
            sessionId: "u1",
            npType: "BAP",
            settings: { useGzip: false },
        });

        expect((await row("u1")).settings).toEqual({ useGzip: false });
    });

    it("keeps saved settings when a later upsert does not send any", async () => {
        await post("/api/sessions/upsert").send({
            sessionId: "u1",
            npType: "BAP",
            settings: { useGzip: false },
        });

        await post("/api/sessions/upsert").send({ sessionId: "u1", npType: "BAP" });

        expect((await row("u1")).settings).toEqual({ useGzip: false });
    });
});
