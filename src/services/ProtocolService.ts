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
        return ingestBuild(db, result.data);
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
                { projection: { _id: 0, domain: 1, version: 1, usecases: 1 } },
            )
            .toArray();

        // Group by domain, collect versions with their usecases
        const map = new Map<string, { key: string; usecase: string[] }[]>();
        for (const doc of docs) {
            const entry = {
                key: doc.version as string,
                usecase: (doc.usecases ?? []) as string[],
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
