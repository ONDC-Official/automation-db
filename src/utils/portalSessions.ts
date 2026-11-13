import { IFlowRun } from "../entity/SessionDetails";
/** Sessions expire this long after their last activity. */
export const SESSION_ACTIVE_MS = 4 * 24 * 60 * 60 * 1000;

/** Most sessions one NP Portal list returns. */
export const PORTAL_SESSION_LIMIT = 100;

/** A query parameter as a list: `?a=1&a=2` and `?a=1` both work. */
export const asList = (value: unknown): string[] | undefined => {
    const list = (Array.isArray(value) ? value : [value]).filter(
        (item): item is string => typeof item === "string" && item !== "",
    );
    return list.length ? list : undefined;
};

const asText = (value: unknown): string | undefined =>
    typeof value === "string" && value !== "" ? value : undefined;

export interface PortalSessionQuery {
    q?: string;
    status?: string;
    reportExists?: boolean;
    userIds?: string[];
    domains?: string[];
    versions?: string[];
    usecaseIds?: string[];
    npType?: string;
    sessionType?: string;
    npIds?: string[];
    flowIds?: string[];
    createdFrom?: string;
    createdTo?: string;
    lastActivityFrom?: string;
    lastActivityTo?: string;
}

export const parsePortalSessionQuery = (
    query: Record<string, unknown>,
): PortalSessionQuery => ({
    q: asText(query.q),
    status: asText(query.status),
    reportExists:
        query.reportExists === "true" ? true : query.reportExists === "false" ? false : undefined,
    userIds: asList(query.userId),
    domains: asList(query.domain),
    versions: asList(query.version),
    usecaseIds: asList(query.usecaseId),
    npType: asText(query.npType),
    sessionType: asText(query.sessionType),
    npIds: asList(query.npId),
    flowIds: asList(query.flowId),
    createdFrom: asText(query.createdFrom),
    createdTo: asText(query.createdTo),
    lastActivityFrom: asText(query.lastActivityFrom),
    lastActivityTo: asText(query.lastActivityTo),
});

export interface PortalSessionRow {
    sessionId: string;
    userId?: string | null;
    npType: string;
    sessionType: string;
    npId?: string | null;
    domain?: string | null;
    version?: string | null;
    usecaseId?: string | null;
    reportExists?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    lastActivityAt?: Date | null;
}

export interface PortalSessionDetailRow extends PortalSessionRow {
    orgId: string;
    flowRuns?: IFlowRun[];
    settings?: Record<string, boolean> | null;
    settingsHistory?: unknown[];
}

/** Sessions made before the Portal API have no lastActivityAt, so updatedAt stands in. */
export function toPortalSession(row: PortalSessionRow, now = Date.now()) {
    const { updatedAt, ...session } = row;
    const lastActivityAt = row.lastActivityAt ?? updatedAt;
    return {
        ...session,
        lastActivityAt,
        reportExists: row.reportExists === true,
        status:
            lastActivityAt && now - lastActivityAt.getTime() <= SESSION_ACTIVE_MS
                ? "active"
                : "expired",
    };
}

export function toPortalSessionDetail(
    row: PortalSessionDetailRow,
    flowSummary: unknown[],
    now = Date.now(),
) {
    // The raw runs only feed flowSummary; they are not part of the reply.
    const { flowRuns: _runs, ...rest } = row;
    const session = toPortalSession(rest, now);
    return {
        ...session,
        expiresAt:
            session.status === "active" && session.lastActivityAt
                ? new Date(session.lastActivityAt.getTime() + SESSION_ACTIVE_MS)
                : null,
        flowSummary,
        settings: row.settings ?? null,
        settingsHistory: row.settingsHistory ?? [],
    };
}
