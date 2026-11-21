import { describe, expect, it } from "vitest";
import {
    canonicalize,
    CanonicalizationError,
} from "../../utils/canonicalJson";

/**
 * RFC 8785 (JSON Canonicalization Scheme) test vectors. Certificate
 * signatures are over this text, so a drift here breaks every stored
 * signature: these vectors come from the RFC itself.
 */

/** A double from its IEEE-754 bit pattern, as RFC 8785 Appendix B lists them. */
const fromHex = (hex: string): number => {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${hex}`));
    return view.getFloat64(0);
};

describe("canonicalize (RFC 8785)", () => {
    it("matches the RFC's section 3.2.2 example", () => {
        // The RFC's input and output texts, escaped for a JS string literal
        // (String.raw does not survive the test transform intact).
        const input = JSON.parse(
            [
                "{",
                '  "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],',
                '  "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",',
                '  "literals": [null, true, false]',
                "}",
            ].join("\n"),
        );

        expect(canonicalize(input)).toBe(
            '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
        );
    });

    it("sorts members by UTF-16 code units (section 3.2.3)", () => {
        const input = {
            "€": "Euro Sign",
            "\r": "Carriage Return",
            "דּ": "Hebrew Letter Dalet With Dagesh",
            "1": "One",
            "😀": "Emoji: Grinning Face",
            "\u0080": "Control",
            "ö": "Latin Small Letter O With Diaeresis",
        };
        const expectedOrder = [
            "\r",
            "1",
            "\u0080",
            "ö",
            "€",
            "😀",
            "דּ",
        ];
        const expected = `{${expectedOrder
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${JSON.stringify(input[key as keyof typeof input])}`,
            )
            .join(",")}}`;

        expect(canonicalize(input)).toBe(expected);
    });

    it.each([
        ["0000000000000000", "0"],
        ["8000000000000000", "0"],
        ["0000000000000001", "5e-324"],
        ["8000000000000001", "-5e-324"],
        ["7fefffffffffffff", "1.7976931348623157e+308"],
        ["ffefffffffffffff", "-1.7976931348623157e+308"],
        ["4340000000000000", "9007199254740992"],
        ["c340000000000000", "-9007199254740992"],
        ["4430000000000000", "295147905179352830000"],
        ["44b52d02c7e14af5", "9.999999999999997e+22"],
        ["44b52d02c7e14af6", "1e+23"],
        ["44b52d02c7e14af7", "1.0000000000000001e+23"],
        ["444b1ae4d6e2ef4e", "999999999999999700000"],
        ["444b1ae4d6e2ef50", "1e+21"],
        ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
        ["3eb0c6f7a0b5ed8d", "0.000001"],
        ["41b3de4355555553", "333333333.3333332"],
        ["41b3de4355555554", "333333333.33333325"],
        ["41b3de4355555555", "333333333.3333333"],
        ["becbf647612f3696", "-0.0000033333333333333333"],
        ["43143ff3c1cb0959", "1424953923781206.2"],
    ])("serialises the double 0x%s as %s (Appendix B)", (hex, expected) => {
        expect(canonicalize(fromHex(hex))).toBe(expected);
    });

    it("refuses NaN and Infinity (Appendix B)", () => {
        expect(() => canonicalize(fromHex("7fffffffffffffff"))).toThrow(
            CanonicalizationError,
        );
        expect(() => canonicalize({ a: fromHex("7ff0000000000000") })).toThrow(
            /Infinity/,
        );
    });

    it("refuses lone surrogates, BigInt and cycles", () => {
        expect(() => canonicalize("\ud800")).toThrow(/surrogate/);
        expect(() => canonicalize({ "\udc00": 1 })).toThrow(/surrogate/);
        expect(() => canonicalize(1n)).toThrow(/BigInt/);
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(() => canonicalize(cyclic)).toThrow(/Circular/);
    });

    it("drops undefined members and writes a Date as its ISO string", () => {
        expect(
            canonicalize({
                when: new Date(Date.UTC(2026, 9, 29, 10, 0, 0, 5)),
                skip: undefined,
                b: [undefined, 1],
            }),
        ).toBe('{"b":[null,1],"when":"2026-10-29T10:00:00.005Z"}');
    });

    it("emits no whitespace and keeps array order", () => {
        expect(canonicalize({ z: [3, 1, 2], a: { y: 1, x: 2 } })).toBe(
            '{"a":{"x":2,"y":1},"z":[3,1,2]}',
        );
    });
});
