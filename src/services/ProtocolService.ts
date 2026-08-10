import {
    BuildConfig,
    ingestBuild,
    COLLECTIONS,
    ingestValidationTable,
    VALIDATION_TABLE_COLLECTION,
} from "@ondc/build-tools";
import type { IngestResult } from "@ondc/build-tools";
import { gunzipSync } from "zlib";
import yaml from "yaml";
import { z } from "zod";
import { getDb } from "../utils/mongoClient";

export interface UsecaseStatus {
    usecase: string;
    status: string;
}

/** Normalize a usecase label for matching (case- and separator-insensitive). */
const normalizeUsecase = (value: unknown): string =>
    String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/[_\s]+/g, " ");

/**
 * Extract `info.x-status` from a raw parsed build.yaml and align each entry's
 * usecase to the canonical `info.x-usecases` label where possible. Accepts the
 * authored shape `[{ use_case, status }]` (also tolerates `usecase`), and is
 * separator/case-insensitive so `BUSINESS_LOAN` matches `BUSINESS LOAN`.
 */
function extractUsecaseStatus(parsed: unknown): UsecaseStatus[] {
    const info = (parsed as { info?: Record<string, unknown> })?.info;
    const rawStatus = info?.["x-status"];
    if (!Array.isArray(rawStatus)) return [];

    const usecases = Array.isArray(info?.["x-usecases"])
        ? (info?.["x-usecases"] as unknown[]).map((u) => String(u))
        : [];

    return rawStatus
        .filter(
            (e): e is Record<string, unknown> =>
                !!e &&
                typeof e === "object" &&
                ((e as Record<string, unknown>).use_case != null ||
                    (e as Record<string, unknown>).usecase != null) &&
                (e as Record<string, unknown>).status != null,
        )
        .map((e) => {
            const raw = String(e.use_case ?? e.usecase);
            const canonical =
                usecases.find(
                    (u) => normalizeUsecase(u) === normalizeUsecase(raw),
                ) ?? raw;
            return { usecase: canonical, status: String(e.status) };
        });
}

export interface SpecsQuery {
    domain: string;
    version: string;
    include?: string[];
    usecase?: string;
    flowId?: string;
    tag?: string;
    docSlug?: string;
}

const VALID_INCLUDES = [
    "meta",
    "flows",
    "attributes",
    "docs",
    "validations",
    "changelog",
    "validationTable",
] as const;

export class ProtocolService {
    async ingestSpec(gzipBuffer: Buffer): Promise<IngestResult> {
        const decompressed = gunzipSync(gzipBuffer);
        const parsed = yaml.parse(decompressed.toString("utf-8"));

        const result = BuildConfig.safeParse(parsed);
        if (!result.success) {
            throw new Error(z.prettifyError(result.error));
        }

        const db = getDb();
        const ingestResult = await ingestBuild(db, result.data);

        // `x-status` carries per-usecase lifecycle status. It is an unknown key to
        // BuildConfig (stripped by zod) and does not affect the build hash, so a
        // status-only change would be "skipped" by ingestBuild. Read it from the
        // raw parsed doc and persist it onto build_meta unconditionally.
        const usecaseStatus = extractUsecaseStatus(parsed);
        await db
            .collection(COLLECTIONS.META)
            .updateOne(
                {
                    domain: ingestResult.domain,
                    version: ingestResult.version,
                },
                { $set: { usecaseStatus } },
            );

        return ingestResult;
    }

    async ingestValidationTable(
        domain: string,
        version: string,
        gzipBuffer: Buffer,
    ): Promise<void> {
        try {
            const decompressed = gunzipSync(gzipBuffer);
            const parsed = yaml.parse(decompressed.toString("utf-8"));
            const db = getDb();
            await ingestValidationTable(db, {
                domain,
                version,
                table: parsed,
            });
        } catch (error) {
            throw new Error(`Error ingesting validation table: ${error}`);
        }
    }

    async getSpec(query: SpecsQuery) {
        const db = getDb();
        const { domain, version } = query;
        const filter = { domain, version };

        const include = query.include?.length
            ? query.include.filter((i): i is (typeof VALID_INCLUDES)[number] =>
                  (VALID_INCLUDES as readonly string[]).includes(i),
              )
            : [...VALID_INCLUDES];

        const result: Record<string, unknown> = {};

        const tasks: Promise<void>[] = [];

        if (include.includes("meta")) {
            tasks.push(
                db
                    .collection(COLLECTIONS.META)
                    .findOne(filter, { projection: { _id: 0 } })
                    .then((doc) => {
                        result.meta = doc;
                    }),
            );
        }

        if (include.includes("flows")) {
            const flowFilter: Record<string, unknown> = { ...filter };
            if (query.usecase) flowFilter.usecase = query.usecase;
            if (query.flowId) flowFilter.flowId = query.flowId;
            if (query.tag) flowFilter.tags = query.tag;

            tasks.push(
                db
                    .collection(COLLECTIONS.FLOWS)
                    .find(flowFilter, { projection: { _id: 0 } })
                    .toArray()
                    .then((docs) => {
                        docs.sort((a, b) => {
                            const oa = (a as any).meta?.order;
                            const ob = (b as any).meta?.order;
                            const hasA = typeof oa === "number";
                            const hasB = typeof ob === "number";
                            if (hasA && hasB && oa !== ob) return oa - ob;
                            if (hasA && !hasB) return -1;
                            if (!hasA && hasB) return 1;
                            return String(a.flowId).localeCompare(String(b.flowId));
                        });
                        result.flows = docs;
                    }),
            );
        }

        if (include.includes("attributes")) {
            const attrFilter: Record<string, unknown> = { ...filter };
            if (query.usecase) attrFilter.useCaseId = query.usecase;

            tasks.push(
                db
                    .collection(COLLECTIONS.ATTRIBUTES)
                    .find(attrFilter, { projection: { _id: 0 } })
                    .toArray()
                    .then((docs) => {
                        result.attributes = docs;
                    }),
            );
        }

        if (include.includes("docs")) {
            const docFilter: Record<string, unknown> = { ...filter };
            if (query.docSlug) docFilter.slug = query.docSlug;

            tasks.push(
                db
                    .collection(COLLECTIONS.DOCS)
                    .find(docFilter, { projection: { _id: 0 } })
                    .sort({ order: 1 })
                    .toArray()
                    .then((docs) => {
                        result.docs = docs;
                    }),
            );
        }

        if (include.includes("validations")) {
            tasks.push(
                db
                    .collection(COLLECTIONS.VALIDATIONS)
                    .findOne(filter, { projection: { _id: 0 } })
                    .then((doc) => {
                        result.validations = doc;
                    }),
            );
        }

        if (include.includes("validationTable")) {
            tasks.push(
                db
                    .collection(VALIDATION_TABLE_COLLECTION)
                    .findOne(filter, { projection: { _id: 0 } })
                    .then((doc) => {
                        result.validationTable = doc;
                    }),
            );
        }

        if (include.includes("changelog")) {
            tasks.push(
                db
                    .collection(COLLECTIONS.CHANGELOG)
                    .find(
                        {
                            domain,
                            $or: [
                                { fromVersion: version },
                                { toVersion: version },
                            ],
                        },
                        { projection: { _id: 0 } },
                    )
                    .toArray()
                    .then((docs) => {
                        result.changelog = docs;
                    }),
            );
        }

        await Promise.all(tasks);
        return result;
    }

    async getBuilds() {
        const db = getDb();
        const docs = await db
            .collection(COLLECTIONS.META)
            .find(
                {},
                {
                    projection: {
                        _id: 0,
                        domain: 1,
                        version: 1,
                        usecases: 1,
                        usecaseStatus: 1,
                    },
                },
            )
            .toArray();

        // Group by domain, collect versions with their usecases
        const map = new Map<
            string,
            {
                key: string;
                usecase: string[];
                usecaseStatus: UsecaseStatus[];
            }[]
        >();
        for (const doc of docs) {
            const entry = {
                key: doc.version as string,
                usecase: (doc.usecases ?? []) as string[],
                usecaseStatus: (doc.usecaseStatus ?? []) as UsecaseStatus[],
            };
            const existing = map.get(doc.domain as string);
            if (existing) {
                existing.push(entry);
            } else {
                map.set(doc.domain as string, [entry]);
            }
        }

        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, version]) => ({ key, version }));
    }
}
