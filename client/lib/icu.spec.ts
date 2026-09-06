import { describe, expect, it } from "vitest";
import { solveTemplate, type PluralCategory } from "./icu";

// A simple EN/HE bilingual plural-rule stub for tests. Mirrors the
// production rules but kept inline so the spec is self-contained.
const enRule = (n: number): PluralCategory => (n === 1 ? "one" : "other");
const heRule = (n: number): PluralCategory => {
  if (n === 1) return "one";
  if (n === 2) return "two";
  return "other";
};

describe("solveTemplate — simple {var} interpolation", () => {
  it("substitutes a single variable", () => {
    expect(solveTemplate("Hello, {name}!", { name: "Alice" }, enRule)).toBe(
      "Hello, Alice!",
    );
  });

  it("substitutes multiple occurrences of the same variable", () => {
    expect(solveTemplate("{x} + {x} = {x}{x}", { x: "a" }, enRule)).toBe(
      "a + a = aa",
    );
  });

  it("renders the raw block when the variable isn't in vars", () => {
    // Preserves the missing-key signalization for the dev-mode warn to
    // detect upstream callers passing wrong var names.
    expect(solveTemplate("Hello, {name}!", {}, enRule)).toBe("Hello, {name}!");
  });

  it("returns the empty string for an empty {var} block", () => {
    expect(solveTemplate("a{}b", {}, enRule)).toBe("ab");
  });
});

describe("solveTemplate — ICU plural with # counter", () => {
  it("English: count=1 → 'one' branch", () => {
    expect(
      solveTemplate(
        "{count, plural, one {# item} other {# items}}",
        { count: 1 },
        enRule,
      ),
    ).toBe("1 item");
  });

  it("English: count=5 → 'other' branch", () => {
    expect(
      solveTemplate(
        "{count, plural, one {# item} other {# items}}",
        { count: 5 },
        enRule,
      ),
    ).toBe("5 items");
  });

  it("English: count=0 falls through to 'other'", () => {
    // CLDR rule: n===1 → one, else → other. So 0 → "other".
    expect(
      solveTemplate(
        "{count, plural, one {# item} other {# items}}",
        { count: 0 },
        enRule,
      ),
    ).toBe("0 items");
  });

  it("English: fractional count (1.5) goes to 'other'", () => {
    expect(
      solveTemplate(
        "{count, plural, one {# item} other {# items}}",
        { count: 1.5 },
        enRule,
      ),
    ).toBe("1.5 items");
  });

  it("Hebrew: count=2 fires the 'two' branch", () => {
    expect(
      solveTemplate(
        "{count, plural, one {פריט} two {שני פריטים} other {# פריטים}}",
        { count: 2 },
        heRule,
      ),
    ).toBe("שני פריטים");
  });

  it("Hebrew: count=5 fires the 'other' branch", () => {
    expect(
      solveTemplate(
        "{count, plural, one {פריט} two {שני פריטים} other {# פריטים}}",
        { count: 5 },
        heRule,
      ),
    ).toBe("5 פריטים");
  });

  it("falls back to 'other' when the picked category is missing from cases", () => {
    expect(
      solveTemplate("{count, plural, one {# item}}", { count: 5 }, enRule),
    ).toBe("5 item");
  });

  it("substitutes '#' with the numeric value, not a localized word", () => {
    // `1.5` keeps its fractional form via String(n).
    expect(
      solveTemplate("{count, plural, other {# units}}", { count: 1.5 }, enRule),
    ).toBe("1.5 units");
  });
});

describe("solveTemplate — multi-var combination", () => {
  it("simple + ICU side-by-side renders both correctly", () => {
    // The exact user-supplied use case.
    expect(
      solveTemplate(
        "{count} agents handled {tickets, plural, one {# ticket} other {# tickets}}",
        { count: 3, tickets: 1 },
        enRule,
      ),
    ).toBe("3 agents handled 1 ticket");
  });

  it("count=1 + tickets=42 yields English 'ticket' singular + 'tickets' plural together", () => {
    expect(
      solveTemplate(
        "{count} agents handled {tickets, plural, one {# ticket} other {# tickets}}",
        { count: 1, tickets: 42 },
        enRule,
      ),
    ).toBe("1 agents handled 42 tickets");
  });

  it("dot-notation var names interpolate via vars lookup", () => {
    expect(
      solveTemplate(
        "{user.name} bought {qty, plural, one {# item} other {# items}}",
        { "user.name": "Alice", qty: 5 },
        enRule,
      ),
    ).toBe("Alice bought 5 items");
  });
});

describe("solveTemplate — nested ICU", () => {
  it("a case body that contains another ICU resolves recursively", () => {
    expect(
      solveTemplate(
        "{count, plural, one {one {tickets, plural, one {ticket} other {tickets}}} other {many}}",
        { count: 1, tickets: 1 },
        enRule,
      ),
    ).toBe("one ticket");
  });

  it("nested 'other' inside outer 'one' falls through correctly", () => {
    expect(
      solveTemplate(
        "{count, plural, one {one {tickets, plural, one {ticket} other {tickets}}} other {many}}",
        { count: 1, tickets: 7 },
        enRule,
      ),
    ).toBe("one tickets");
  });

  it("stack is safe for at least 3 nested levels", () => {
    const tmpl =
      "{a, plural, one {a {b, plural, one {b {c, plural, one {c inner} other {c outer}}}}} other {a-outer}}";
    expect(solveTemplate(tmpl, { a: 5, b: 5, c: 5 }, enRule)).toBe("a-outer");
    expect(solveTemplate(tmpl, { a: 1, b: 1, c: 1 }, enRule)).toBe(
      "a b c inner",
    );
  });
});

describe("solveTemplate — malformed templates", () => {
  it("renders missing close brace as literal text (doesn't throw)", () => {
    // The parser hits `{count, plural, ...` with no closing `}}` — the
    // whole block is output verbatim rather than crashing.
    expect(solveTemplate("Hello, {{count}!", { count: 5 }, enRule)).toBe(
      "Hello, {{count}!",
    );
  });

  it("double-braced opening without close emits literal then advances", () => {
    // Forward progress is preserved — the `a` text is emitted correctly.
    expect(solveTemplate("a{{b, plural", { b: 5 }, enRule)).toBe(
      "a{{b, plural",
    );
  });

  it("treatment of nested `}` inside an outer `{{...}}` mid-template", () => {
    // Verifies the depth-tracker correctly distinguishes case-body `}` from
    // the outer `{{...}}`. The `"x}}}` cluster (case body close + outer
    // double close) is all matched by the depth counter — no space inserted,
    // no characters dropped. Output is "ayc" (no space between y and c
    // because the template doesn't have one).
    expect(
      solveTemplate("a{{b, plural, one {x} other {y}}}c", { b: 5 }, enRule),
    ).toBe("ayc");
  });
});

describe("solveTemplate — coexistence with simple {var} in same template", () => {
  it("simple `{x}` and ICU `{x, plural, ...}` don't conflict for the same variable", () => {
    const tmpl =
      "Total: {count}. Report: {count, plural, one {# page} other {# pages}}.";
    expect(solveTemplate(tmpl, { count: 3 }, enRule)).toBe(
      "Total: 3. Report: 3 pages.",
    );
  });
});
