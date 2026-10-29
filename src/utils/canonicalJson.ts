/**
 * The JSON Canonicalization Scheme (RFC 8785).
 *
 * The same rules as the implementation vendored in `@ondc/fd-contract`
 * (src/jcs.ts), which is checked there against the `canonicalize` package
 * 5.1.0. That package is ESM-only, so this CommonJS service cannot `require` it
 * on every Node version it runs on; this copy has no dependencies.
 *
 * - object members sorted by their names' UTF-16 code units (JavaScript's
 *   default `sort()`);
 * - strings serialised as ECMAScript `JSON.stringify` does, and a lone
 *   surrogate refused;
 * - numbers serialised as ECMAScript `Number.prototype.toString` does (via
 *   `JSON.stringify`), and NaN and ±Infinity refused;
 * - no whitespace;
 * - `toJSON` honoured (so a Date becomes its ISO string), and members whose
 *   value has no JSON form (undefined, functions, symbols) dropped from objects
 *   and written as `null` in arrays, as `JSON.stringify` does.
 */

export class CanonicalizationError extends Error {
    override name = "CanonicalizationError";
}

// With the `u` flag a surrogate pair is one code point, so this matches lone
// surrogates only.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

function serialiseString(value: string): string {
    if (LONE_SURROGATE.test(value)) {
        throw new CanonicalizationError("Lone surrogate is not allowed");
    }
    return JSON.stringify(value);
}

function hasNoJsonForm(value: unknown): boolean {
    return (
        value === undefined ||
        typeof value === "function" ||
        typeof value === "symbol"
    );
}

function serialise(value: unknown, seen: Set<object>): string | undefined {
    // Unwrap toJSON chains, as JSON.stringify does.
    const wrappers: object[] = [];
    let current: unknown = value;
    while (
        current !== null &&
        typeof current === "object" &&
        typeof (current as { toJSON?: unknown }).toJSON === "function"
    ) {
        if (seen.has(current)) {
            throw new CanonicalizationError("Circular reference detected");
        }
        seen.add(current);
        wrappers.push(current);
        current = (current as { toJSON: () => unknown }).toJSON();
    }
    try {
        if (
            current instanceof Number ||
            current instanceof String ||
            current instanceof Boolean
        ) {
            current = current.valueOf();
        }
        if (current === null) return "null";
        switch (typeof current) {
            case "string":
                return serialiseString(current);
            case "number":
                if (Number.isNaN(current)) {
                    throw new CanonicalizationError("NaN is not allowed");
                }
                if (!Number.isFinite(current)) {
                    throw new CanonicalizationError("Infinity is not allowed");
                }
                return JSON.stringify(current);
            case "boolean":
                return current ? "true" : "false";
            case "bigint":
                throw new CanonicalizationError(
                    "BigInt has no JSON representation",
                );
            case "object":
                break;
            default:
                return undefined; // undefined, function, symbol
        }
        const container = current as object;
        if (seen.has(container)) {
            throw new CanonicalizationError("Circular reference detected");
        }
        seen.add(container);
        try {
            if (Array.isArray(container)) {
                const items = container.map((item: unknown) =>
                    hasNoJsonForm(item) ? "null" : (serialise(item, seen) ?? "null"),
                );
                return `[${items.join(",")}]`;
            }
            const record = container as Record<string, unknown>;
            const members: string[] = [];
            for (const key of Object.keys(record).sort()) {
                const member = record[key];
                if (hasNoJsonForm(member)) continue;
                const text = serialise(member, seen);
                if (text === undefined) continue;
                members.push(`${serialiseString(key)}:${text}`);
            }
            return `{${members.join(",")}}`;
        } finally {
            seen.delete(container);
        }
    } finally {
        for (const wrapper of wrappers) seen.delete(wrapper);
    }
}

/**
 * The RFC 8785 canonical text of a value, or `undefined` for a value with no
 * JSON form (`undefined`, a function, a symbol). Throws `CanonicalizationError`
 * for NaN, ±Infinity, a lone surrogate, a BigInt or a cycle.
 */
export function canonicalize(value: unknown): string | undefined {
    return serialise(value, new Set());
}
