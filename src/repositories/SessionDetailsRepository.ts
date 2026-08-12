import { PipelineStage } from "mongoose";
import { SessionDetails, ISessionDetails } from "../entity/SessionDetails";
import { UserModel } from "../entity/User";
import {
  buildSessionPipeline,
  ParsedSessionQuery,
} from "../utils/sessionFilters";
import {
  EXCLUDED_HOSTS,
  hostExpr,
  ParsedNpQuery,
} from "../utils/npFilters";

export interface PaginatedSessions {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * One Network Participant, keyed by the host of its subscriber URL.
 *
 * The three flow figures are all *distinct flow identities*, never per-session
 * totals — mixing the two makes "judged" exceed "attempted" for any participant
 * that ran the same flow in several sessions.
 */
export interface ParticipantRow {
  host: string;
  /**
   * One row is one NP in ONE role on ONE domain+version, so a host that acted
   * as both sides — or spanned domains — appears once per combination.
   *
   * All three are nullable for the reason hostExpr type-guards npId: these
   * documents come from an upsert that does not always cast, and domain and
   * version are optional on the schema besides. A null here is a real value —
   * "ran sessions with none recorded" — addressable through NP_NULL_SENTINEL.
   */
  npType: string | null;
  domain: string | null;
  version: string | null;
  /** The raw subscriber URLs that collapsed into this row. */
  npIds: string[];
  /** Distinct sessionIds — session documents are not unique on sessionId. */
  sessions: number;
  firstSessionAt: Date | null;
  lastSessionAt: Date | null;
  firstPayloadAt: Date | null;
  /** Distinct flowIds seen on this participant's payloads. */
  flowsAttempted: number;
  /** Distinct flowIds carrying a verdict in flowMap. */
  flowsJudged: number;
  /** Distinct flowIds that passed at least once. */
  flowsPassed: number;
  /**
   * Distinct flowIds that were judged but never passed.
   *
   * The complement of flowsPassed, deliberately not a distinct union of FAIL
   * verdicts: a flow that failed once and passed later already counts as
   * passed, so counting it as failed too would break passed + failed = judged
   * and leave the row disagreeing with its own passRate.
   */
  flowsFailed: number;
  passRate: number | null;
}

export interface PaginatedParticipants {
  data: ParticipantRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ParticipantDetail extends ParticipantRow {
  recentSessions: Array<{
    sessionId: string;
    npType: string | null;
    domain: string | null;
    version: string | null;
    createdAt: Date | null;
    reportExists: boolean;
    flowsJudged: number;
    flowsPassed: number;
  }>;
  /** Per-flow rollup across every session in this slice. */
  flows: Array<{ flowId: string; passed: number; failed: number }>;
}

export interface StatsTotals {
  sessions: number;
  withReports: number;
  flowsTotal: number;
  flowsCompleted: number;
  flowsPassed: number;
  flowsFailed: number;
  /** Share of judged flows that passed, 0–1. Null when nothing is judged. */
  passRate: number | null;
}

export interface StatsBucket {
  sessions: number;
  flowsPassed: number;
  flowsFailed: number;
  passRate: number | null;
}

export interface SessionStats {
  totals: StatsTotals;
  byDay: Array<{ date: string; sessions: number; passed: number; failed: number }>;
  byDomain: Array<StatsBucket & { domain: string | null }>;
  byNpType: Array<StatsBucket & { npType: string | null }>;
  byVersion: Array<StatsBucket & { version: string | null }>;
}

export interface SessionFacets {
  domains: string[];
  versions: string[];
  npTypes: string[];
  sessionTypes: string[];
  usecaseIds: string[];
}

/** Judged-flow pass share, consistent with the per-session passRate. */
const passRateOf = (passed: number, failed: number): number | null =>
  passed + failed > 0 ? passed / (passed + failed) : null;

/**
 * A participant's pass share: distinct flows that ever passed, over distinct
 * flows that were judged at all. Null — never 0 — when nothing is judged, so
 * "no report yet" stays distinguishable from "everything failed".
 *
 * Unlike the session breakdowns, this one is computed in the pipeline rather
 * than in JS: it is a sortable column, so it has to exist before $sort/$skip or
 * paging would order on a field the database cannot see.
 */
const PARTICIPANT_PASS_RATE: Record<string, unknown> = {
  $cond: [
    { $gt: ["$flowsJudged", 0] },
    { $divide: ["$flowsPassed", "$flowsJudged"] },
    null,
  ],
};

/**
 * Missing, null and "" are one value, not three.
 *
 * A document-valued $group._id OMITS a field whose expression resolves to
 * missing, so grouping on a raw optional field would put a session with no
 * `domain` and a session with `domain: null` in two different buckets — and the
 * second bucket's `$_id.domain` is itself missing, so the field would vanish
 * from the row entirely. NP_NULL_SENTINEL selects exactly these three states on
 * the way back in.
 */
const blankToNull = (field: string): Record<string, unknown> => ({
  $cond: [{ $in: [{ $ifNull: [field, null] }, [null, ""]] }, null, field],
});

/**
 * The compound identity of a participant row, in tiebreaker order.
 *
 * Every one of these is both sortable and part of the paging tiebreaker, which
 * is why participantSort has to build its key object carefully.
 */
const PARTICIPANT_KEY_FIELDS = ["host", "npType", "domain", "version"] as const;

/** Flattens an array-of-arrays into one distinct set, inside the pipeline. */
const distinctUnion = (field: string): Record<string, unknown> => ({
  $reduce: {
    input: { $ifNull: [field, []] },
    initialValue: [],
    in: { $setUnion: ["$$value", { $ifNull: ["$$this", []] }] },
  },
});

interface RawBucket {
  _id: unknown;
  sessions: number;
  flowsPassed: number;
  flowsFailed: number;
}

function shapeStats(raw: Record<string, any> | undefined): SessionStats {
  const t = raw?.totals?.[0];

  const bucket = <K extends string>(rows: RawBucket[] | undefined, key: K) =>
    (rows ?? []).map((r) => ({
      [key]: r._id === null || r._id === undefined ? null : String(r._id),
      sessions: r.sessions,
      flowsPassed: r.flowsPassed,
      flowsFailed: r.flowsFailed,
      passRate: passRateOf(r.flowsPassed, r.flowsFailed),
    })) as Array<StatsBucket & Record<K, string | null>>;

  return {
    totals: {
      sessions: t?.sessions ?? 0,
      withReports: t?.withReports ?? 0,
      flowsTotal: t?.flowsTotal ?? 0,
      flowsCompleted: t?.flowsCompleted ?? 0,
      flowsPassed: t?.flowsPassed ?? 0,
      flowsFailed: t?.flowsFailed ?? 0,
      passRate: passRateOf(t?.flowsPassed ?? 0, t?.flowsFailed ?? 0),
    },
    byDay: (raw?.byDay ?? []).map(
      (r: { _id: string; sessions: number; passed: number; failed: number }) => ({
        date: r._id,
        sessions: r.sessions,
        passed: r.passed,
        failed: r.failed,
      }),
    ),
    byDomain: bucket(raw?.byDomain, "domain"),
    byNpType: bucket(raw?.byNpType, "npType"),
    byVersion: bucket(raw?.byVersion, "version"),
  };
}

export class SessionDetailsRepository {
  /**
   * Filtered, sorted, paginated sessions with the dashboard's derived fields.
   *
   * $facet runs the page and its total count in a single round trip over one
   * shared filter pass, so the two can never disagree.
   */
  async findFiltered(parsed: ParsedSessionQuery): Promise<PaginatedSessions> {
    const skip = (parsed.page - 1) * parsed.limit;

    const [result] = await SessionDetails.aggregate([
      ...buildSessionPipeline(parsed),
      {
        $facet: {
          data: [
            { $sort: { [parsed.sort]: parsed.order, _id: 1 } },
            { $skip: skip },
            { $limit: parsed.limit },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]).exec();

    const total = (result?.total?.[0]?.count as number) ?? 0;

    return {
      data: result?.data ?? [],
      total,
      page: parsed.page,
      limit: parsed.limit,
      totalPages: Math.ceil(total / parsed.limit),
    };
  }

  /**
   * Dashboard KPIs and breakdowns for the filtered set, in one round trip.
   *
   * Every branch of the $facet reads the same filtered, derived documents, so
   * the headline numbers can never disagree with the charts beneath them.
   */
  async aggregateStats(parsed: ParsedSessionQuery): Promise<SessionStats> {
    const breakdown = (field: string) => [
      {
        $group: {
          _id: `$${field}`,
          sessions: { $sum: 1 },
          flowsPassed: { $sum: "$flowsPassed" },
          flowsFailed: { $sum: "$flowsFailed" },
        },
      },
      { $sort: { sessions: -1 as const, _id: 1 as const } },
    ];

    const [raw] = await SessionDetails.aggregate([
      ...buildSessionPipeline(parsed),
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                sessions: { $sum: 1 },
                withReports: {
                  $sum: { $cond: ["$reportExists", 1, 0] },
                },
                flowsTotal: { $sum: "$flowsTotal" },
                flowsCompleted: { $sum: "$flowsCompleted" },
                flowsPassed: { $sum: "$flowsPassed" },
                flowsFailed: { $sum: "$flowsFailed" },
              },
            },
          ],
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt",
                  },
                },
                sessions: { $sum: 1 },
                passed: { $sum: "$flowsPassed" },
                failed: { $sum: "$flowsFailed" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          byDomain: breakdown("domain"),
          byNpType: breakdown("npType"),
          byVersion: breakdown("version"),
        },
      },
    ]).exec();

    return shapeStats(raw);
  }

  /**
   * Distinct values for the filter dropdowns, narrowed to the current selection.
   *
   * Each dimension EXCLUDES ITS OWN FILTER when computing its own options —
   * standard faceted search. Applying `domain=X` to the `domains` facet would
   * collapse that dropdown to the single value already chosen, leaving the user
   * unable to switch domains without clearing the filter first.
   *
   * Every other dimension's filter still applies, so the options offered are
   * exactly those reachable from the rest of the selection.
   */
  async aggregateFacets(parsed: ParsedSessionQuery): Promise<SessionFacets> {
    const dimensions = [
      { key: "domains", field: "domain" },
      { key: "versions", field: "version" },
      { key: "npTypes", field: "npType" },
      { key: "sessionTypes", field: "sessionType" },
      { key: "usecaseIds", field: "usecaseId" },
    ] as const;

    const dimensionFields = dimensions.map((d) => d.field) as string[];

    // Split the filter: non-dimension criteria apply to every branch, while
    // dimension criteria are re-applied per branch minus that branch's own.
    const baseMatch: Record<string, unknown> = {};
    const dimensionMatch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.match)) {
      if (dimensionFields.includes(key)) dimensionMatch[key] = value;
      else baseMatch[key] = value;
    }

    const branchFor = (ownField: string) => {
      const others = Object.fromEntries(
        Object.entries(dimensionMatch).filter(([k]) => k !== ownField),
      );
      return [
        { $match: others },
        { $match: { [ownField]: { $nin: [null, ""] } } },
        { $group: { _id: `$${ownField}` } },
        { $sort: { _id: 1 as const } },
      ];
    };

    // Derived fields are still needed: `result` is a valid filter here and is
    // computed, not stored.
    const head = buildSessionPipeline({ ...parsed, match: baseMatch });

    const [raw] = await SessionDetails.aggregate([
      ...head,
      {
        $facet: Object.fromEntries(
          dimensions.map((d) => [d.key, branchFor(d.field)]),
        ),
      },
    ]).exec();

    const values = (rows: { _id: unknown }[] | undefined): string[] =>
      (rows ?? []).map((r) => String(r._id));

    return {
      domains: values(raw?.domains),
      versions: values(raw?.versions),
      npTypes: values(raw?.npTypes),
      sessionTypes: values(raw?.sessionTypes),
      usecaseIds: values(raw?.usecaseIds),
    };
  }

  /**
   * The shared head of both participant pipelines: one grouped document per
   * subscriber host, role and domain+version.
   *
   * Driven from sessions, not payloads. Sessions carry the identity (npId) and
   * the date filter, both indexed, and payloads are reached through the indexed
   * sessionId. Grouping payloads directly would scan a collection of full
   * request/response bodies with no index that fits.
   */
  private participantHead(parsed: ParsedNpQuery): PipelineStage[] {
    const stages: PipelineStage[] = [
      { $match: parsed.match },
      {
        $addFields: {
          host: hostExpr("$npId"),
          // Normalised in place, so the $group below cannot split one blank
          // slice into three. parsed.match has already run against the raw
          // fields, and the $lookup's `let: { nptype: "$npType" }` is
          // unaffected — "" and null both fail $eq against "BAP" either way.
          npType: blankToNull("$npType"),
          domain: blankToNull("$domain"),
          version: blankToNull("$version"),
          // flowMap is Mixed and defaults to null; $objectToArray throws on
          // anything that is not an object.
          flowMapEntries: {
            $cond: [
              { $eq: [{ $type: "$flowMap" }, "object"] },
              { $objectToArray: "$flowMap" },
              [],
            ],
          },
        },
      },
      // Sessions with an unparseable npId have no participant identity, and the
      // workbench's own host describes nobody.
      { $match: { host: { $nin: [null, ...EXCLUDED_HOSTS] } } },
    ];

    if (parsed.hostSearch) {
      stages.push({
        $match: { host: { $regex: parsed.hostSearch, $options: "i" } },
      });
    }

    stages.push(
      {
        /**
         * npType picks which side of the context identifies this participant:
         * a BAP session's own URI is bap_uri, a BPP session's is bpp_uri. The
         * few payloads matching neither fall back to the session's earliest.
         *
         * Session documents are not unique on sessionId, so a duplicated
         * session attaches the same payload rollup twice — harmless here
         * because both figures taken from it, $min and a distinct set union,
         * are idempotent under duplication.
         */
        $lookup: {
          from: "payloads",
          let: { sid: "$sessionId", nptype: "$npType", h: "$host" },
          pipeline: [
            { $match: { $expr: { $eq: ["$sessionId", "$$sid"] } } },
            {
              $project: {
                flowId: 1,
                createdAt: 1,
                uri: {
                  $cond: [
                    { $eq: ["$$nptype", "BAP"] },
                    "$jsonRequest.context.bap_uri",
                    "$jsonRequest.context.bpp_uri",
                  ],
                },
              },
            },
            {
              $project: {
                flowId: 1,
                createdAt: 1,
                uhost: hostExpr("$uri"),
              },
            },
            {
              $group: {
                _id: null,
                firstOwn: {
                  $min: {
                    $cond: [
                      { $eq: ["$uhost", "$$h"] },
                      "$createdAt",
                      null,
                    ],
                  },
                },
                firstAny: { $min: "$createdAt" },
                // A missing flowId would otherwise become a phantom entry in
                // every distinct-flow count.
                flows: {
                  $addToSet: {
                    $cond: [
                      { $in: [{ $type: "$flowId" }, ["missing", "null"]] },
                      "$$REMOVE",
                      "$flowId",
                    ],
                  },
                },
              },
            },
          ],
          as: "payloadRollup",
        },
      },
      { $unwind: { path: "$payloadRollup", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          // One NP, in one role, on one domain+version. A session document
          // carries exactly one of each, so this partitions the sessions rather
          // than fanning them out: the counts below and the flow sets stay
          // correct with no double counting, and firstPayloadAt becomes what
          // the column now claims — when this participant first sent us a
          // payload for this domain+version in this role.
          //
          // The domain and version are the session's own, not the payload
          // context's. The two can in principle disagree; reading them off the
          // payload would mean hoisting them into the $lookup above and would
          // change the row set.
          _id: {
            host: "$host",
            npType: "$npType",
            domain: "$domain",
            version: "$version",
          },
          npIds: { $addToSet: "$npId" },
          // Distinct, because sessionId is not unique across documents.
          sessionIds: { $addToSet: "$sessionId" },
          firstSessionAt: { $min: "$createdAt" },
          lastSessionAt: { $max: "$createdAt" },
          firstPayloadAt: {
            $min: {
              $ifNull: ["$payloadRollup.firstOwn", "$payloadRollup.firstAny"],
            },
          },
          attemptedSets: { $push: "$payloadRollup.flows" },
          judgedSets: {
            $push: {
              $map: { input: "$flowMapEntries", as: "e", in: "$$e.k" },
            },
          },
          passedSets: {
            $push: {
              $map: {
                input: {
                  $filter: {
                    input: "$flowMapEntries",
                    as: "e",
                    cond: { $eq: ["$$e.v", "PASS"] },
                  },
                },
                as: "e",
                in: "$$e.k",
              },
            },
          },
        },
      },
      {
        $addFields: {
          host: "$_id.host",
          npType: "$_id.npType",
          domain: "$_id.domain",
          version: "$_id.version",
          sessions: { $size: "$sessionIds" },
          flowsAttempted: { $size: distinctUnion("$attemptedSets") },
          flowsJudged: { $size: distinctUnion("$judgedSets") },
          flowsPassed: { $size: distinctUnion("$passedSets") },
        },
      },
      // A second pass, because flowsJudged and flowsPassed only exist as of the
      // $addFields above — a sibling field cannot reference them.
      {
        $addFields: {
          passRate: PARTICIPANT_PASS_RATE,
          flowsFailed: { $subtract: ["$flowsJudged", "$flowsPassed"] },
        },
      },
      {
        $project: {
          _id: 0,
          sessionIds: 0,
          attemptedSets: 0,
          judgedSets: 0,
          passedSets: 0,
        },
      },
    );

    return stages;
  }

  /**
   * The requested key, then the rest of the row's identity as a tiebreaker
   * chain so paging is stable.
   *
   * Every one of the four identity columns is the tiebreaker AND sortable in
   * its own right, and an object literal cannot hold a key twice — `{ domain:
   * -1, ..., domain: 1 }` collapses to one entry where the literal 1 wins and
   * silently discards the requested direction. So the requested key is emitted
   * once, first, and the chain skips it. The sessions list never hits this
   * because its tiebreaker, _id, cannot be sorted on.
   */
  private participantSort(parsed: ParsedNpQuery): Record<string, 1 | -1> {
    const sort: Record<string, 1 | -1> = { [parsed.sort]: parsed.order };
    for (const field of PARTICIPANT_KEY_FIELDS) {
      if (field !== parsed.sort) sort[field] = 1;
    }
    return sort;
  }

  /**
   * Filtered, sorted, paginated participants.
   *
   * $facet runs the page and its total in one round trip over the same grouped
   * documents, so the count can never disagree with the rows beneath it.
   */
  async aggregateParticipants(
    parsed: ParsedNpQuery,
  ): Promise<PaginatedParticipants> {
    const skip = (parsed.page - 1) * parsed.limit;
    const sort = this.participantSort(parsed);

    const [result] = await SessionDetails.aggregate([
      ...this.participantHead(parsed),
      {
        $facet: {
          data: [{ $sort: sort }, { $skip: skip }, { $limit: parsed.limit }],
          total: [{ $count: "count" }],
        },
      },
    ])
      // The group holds one entry per host/role/domain/version with its flow
      // sets, which the 100MB in-memory stage limit does not guarantee room for
      // — the same reason streamParticipants allows it.
      .allowDiskUse(true)
      .exec();

    const total = (result?.total?.[0]?.count as number) ?? 0;

    return {
      data: (result?.data ?? []) as ParticipantRow[],
      total,
      page: parsed.page,
      limit: parsed.limit,
      totalPages: Math.ceil(total / parsed.limit),
    };
  }

  /**
   * Cursor over every participant matching the filter, in the requested order —
   * the export deliberately ignores paging, so the file holds the whole filtered
   * set rather than whichever page happened to be on screen.
   *
   * allowDiskUse because the $group holds one entry per host with its flow sets,
   * which the 100MB in-memory stage limit does not guarantee room for.
   */
  streamParticipants(parsed: ParsedNpQuery) {
    return SessionDetails.aggregate([
      ...this.participantHead(parsed),
      { $sort: this.participantSort(parsed) },
    ])
      .allowDiskUse(true)
      .cursor();
  }

  /**
   * One participant row, plus the sessions and per-flow verdicts behind its
   * totals.
   *
   * Describes the slice the filters select, not the whole host: npType, domain
   * and version are a pre-group match, so passing them narrows this to the one
   * row the caller clicked — and scopes recentSessions and the flow verdicts
   * below to the same slice for free, since both reuse scoped.match.
   *
   * The per-flow rollup is a count of verdicts, not distinct flows: the point of
   * the drill-down is to show that a flow passed twice and failed once, which
   * the headline distinct figures deliberately flatten away.
   */
  async findParticipant(
    host: string,
    parsed: ParsedNpQuery,
  ): Promise<ParticipantDetail | null> {
    const scoped: ParsedNpQuery = { ...parsed, hostSearch: undefined };

    const [row] = await SessionDetails.aggregate([
      ...this.participantHead(scoped),
      { $match: { host } },
      // The caller normally pins the slice with npType/domain/version, which
      // are a pre-group match — so the group emits exactly one row for this
      // host and this $limit is exact. A caller that pins nothing (an old
      // bookmark, a direct API hit) now gets the first row in the table's own
      // order rather than whichever group the server happened to emit first.
      { $sort: this.participantSort(scoped) },
      { $limit: 1 },
    ]).exec();

    if (!row) return null;

    const sessions = await SessionDetails.aggregate([
      { $match: scoped.match },
      {
        $addFields: {
          host: hostExpr("$npId"),
          flowMapEntries: {
            $cond: [
              { $eq: [{ $type: "$flowMap" }, "object"] },
              { $objectToArray: "$flowMap" },
              [],
            ],
          },
        },
      },
      { $match: { host } },
      { $sort: { createdAt: -1, _id: 1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          sessionId: 1,
          npType: 1,
          domain: 1,
          version: 1,
          createdAt: 1,
          reportExists: { $ifNull: ["$reportExists", false] },
          flowsJudged: { $size: "$flowMapEntries" },
          flowsPassed: {
            $size: {
              $filter: {
                input: "$flowMapEntries",
                as: "e",
                cond: { $eq: ["$$e.v", "PASS"] },
              },
            },
          },
        },
      },
    ]).exec();

    const flows = await SessionDetails.aggregate([
      { $match: scoped.match },
      {
        $addFields: {
          host: hostExpr("$npId"),
          flowMapEntries: {
            $cond: [
              { $eq: [{ $type: "$flowMap" }, "object"] },
              { $objectToArray: "$flowMap" },
              [],
            ],
          },
        },
      },
      { $match: { host } },
      { $unwind: "$flowMapEntries" },
      {
        $group: {
          _id: "$flowMapEntries.k",
          passed: {
            $sum: { $cond: [{ $eq: ["$flowMapEntries.v", "PASS"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$flowMapEntries.v", "FAIL"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, flowId: "$_id", passed: 1, failed: 1 } },
    ]).exec();

    return { ...(row as ParticipantRow), recentSessions: sessions, flows };
  }

  /**
   * A cursor over the filtered set for streaming export.
   *
   * Deliberately a cursor and not an array: an export must not be bounded by
   * how much of the result set fits in memory.
   */
  streamFiltered(parsed: ParsedSessionQuery) {
    return SessionDetails.aggregate([
      ...buildSessionPipeline(parsed),
      { $sort: { [parsed.sort]: parsed.order, _id: 1 } },
    ]).cursor();
  }

  // Find SessionDetails by sessionId
  async findBySessionId(sessionId: string) {
    return SessionDetails.findOne({ sessionId: sessionId }).exec();
  }

  async findByUserId(userId: string) {
    return SessionDetails.find({ userId }).exec();
  }

  // Find SessionDetails by sessionId and populate related payloads
  async findWithPayloadsBySessionId(sessionId: string) {
    return SessionDetails.findOne({ sessionId: sessionId }).exec();
  }

  // Fetch all sessions
  async findAll() {
    return SessionDetails.find().exec();
  }

  // Create a new session
  async create(sessionData: Partial<ISessionDetails>) {
    const session = new SessionDetails(sessionData);
    return session.save();
  }

  async update(sessionId: string, updateData: Partial<ISessionDetails>) {
    return SessionDetails.findOneAndUpdate(
      { sessionId: sessionId },
      updateData,
      { new: true },
    ).exec();
  }

  async delete(sessionId: string) {
    return SessionDetails.findOneAndDelete({ sessionId: sessionId }).exec();
  }

  // Check if a session exists
  async checkSessionById(sessionId: string): Promise<boolean> {
    const session = await SessionDetails.exists({ sessionId: sessionId });
    return !!session;
  }

  // Find by Mongo ObjectId if needed
  async findSessionById(id: string) {
    return SessionDetails.findById(id).exec();
  }

  // -------------------------
  // 🧩 Flow Management
  // -------------------------

  // Add a new flow to a session
  async addFlowToSession(
    sessionId: string,
    flow: { id: string; status: string; payloads?: string[] },
  ) {
    // 1️⃣ Check if session exists
    const session = await SessionDetails.findOne({ sessionId }).exec();
    if (!session) {
      throw new Error(`Session with ID ${sessionId} not found`);
    }

    // 2️⃣ Check if flow already exists in that session
    const existingFlow = session.flows?.find((f: any) => f.id === flow.id);
    if (existingFlow) {
      return existingFlow;
    }

    // 3️⃣ Atomically push flow (avoids race conditions if many writes happen)
    const updated = await SessionDetails.findOneAndUpdate(
      { sessionId, "flows.id": { $ne: flow.id } }, // ensure flow.id not present
      { $push: { flows: flow } },
      { new: true },
    ).exec();

    // 4️⃣ Handle unexpected null (edge race case)
    if (!updated) {
      throw new Error(
        `Failed to add flow — it may have been added concurrently`,
      );
    }

    return updated;
  }

  // Update a flow’s status or payloads
  async updateFlowInSession(
    sessionId: string,
    flowId: string,
    updateData: Partial<{ status: string; payloads: string[] }>,
  ) {
    return SessionDetails.findOneAndUpdate(
      { sessionId, "flows.id": flowId },
      {
        $set: {
          ...(updateData.status && { "flows.$.status": updateData.status }),
          ...(updateData.payloads && {
            "flows.$.payloads": updateData.payloads,
          }),
        },
      },
      { new: true },
    ).exec();
  }

  // Remove a flow from session
  async removeFlowFromSession(sessionId: string, flowId: string) {
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      { $pull: { flows: { id: flowId } } },
      { new: true },
    ).exec();
  }

  async findByNpTypeAndNpId(npType: string, npId: string,domain:string,version:string) {
    //need to filter by domain and version also in future
    return SessionDetails.find({ npType: npType, npId: npId,domain,version }).exec();
  }

  // Get all distinct npId (subscriber URLs) for a given userId (githubId)
  async findDistinctNpIdsByUserId(userId: string): Promise<string[]> {
    // Step 1: Find the user and get their sessionIds
    // const user = await UserModel.findOne({ userId: userId }).exec();
    // if (!user || !user.sessionIds || user.sessionIds.length === 0) {
    //   return [];
    // }

    // Step 2: Get distinct npId values from those sessions
    const results = await SessionDetails.distinct("npId", {
      userId,
      npId: { $ne: null, $exists: true },
    }).exec();

    return results.filter(Boolean) as string[];
  }

  // Upsert a session — creates it if not found, updates fields if it exists
  async upsertSession(
    sessionId: string,
    data: {
      userId?: string;
      npType: string;
      npId?: string;
      domain?: string;
      version?: string;
      usecaseId?: string;
      flowMap?: any;
    },
  ) {
    const sessionDetail: any = await SessionDetails.findOne({
      sessionId: sessionId,
    }).exec();

    const updatedFlowMap = {
      ...data.flowMap, // new keys
      ...(sessionDetail?.flowMap || {}), // existing keys override
    };
    data.flowMap = updatedFlowMap;
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      {
        $setOnInsert: { sessionId, sessionType: "AUTOMATION" },
        $set: data,
      },
      { upsert: true, new: true },
    ).exec();
  }

  // Save flowSummary and flowMap (pass/fail per flow) after report generation
  async saveSessionAnalytics(
    sessionId: string,
    flowSummary: Record<string, { total: number; completed: number }>,
    flowMap: Record<string, "PASS" | "FAIL">,
  ) {
    const sessionDetail: any = await SessionDetails.findOne({
      sessionId: sessionId,
    }).exec();

    const updatedFlowMap = {
      ...(sessionDetail?.flowMap || {}),
      ...flowMap,
    };
    return SessionDetails.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          flowSummary,
          flowMap: updatedFlowMap,
          reportExists: true,
        },
      },
      { new: true },
    ).exec();
  }
}
