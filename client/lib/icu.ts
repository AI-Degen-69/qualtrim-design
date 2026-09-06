/**
 * Tiny inline ICU MessageFormat parser.
 *
 * Subset coverage (matches what the project's dictionary values need):
 *   - `{varName}`                                simple variable substitution
 *   - `{varName, plural, one {# item}
 *                other {# items}}`              plural pick with `#` counter
 *   - `{{varName}}`                              i18next-style double-brace
 *                                                  simple substitution
 *   - `{{varName, plural, ...}}`                 double-brace ICU pattern
 *                                                  (single-brace case bodies)
 *   - Multi-var: simple + ICU side-by-side
 *   - Single-level (and several levels of) nesting
 *
 * NOT implemented (out of scope for "tiny"):
 *   - `select` (gender-aware), `selectordinal` (1st / 2nd / 3rd)
 *   - `=N` exact-match categories
 *   - ICU `offset` parameter
 *   - Full MessageFormat escape sequences (apostrophe-quoted literals)
 *
 * Coexists with the suffix-based plural lookup in `@/lib/i18n.tsx`:
 *   `resolvePluralKey` picks the right dict entry (e.g. `key_one`),
 *   `solveTemplate` walks the entry's content. Both can be active on
 *   the same dict entry.
 */
export type PluralCategory = "one" | "two" | "few" | "many" | "other";

interface IcuCase {
  category: string;
  body: string;
}

interface IcuPattern {
  name: string;
  cases: IcuCase[];
}

/**
 * Walks `template` and produces the final string, substituting:
 *   - `{name, plural, one {# foo} other {...}}` → applies `pluralRule` to
 *     `vars[name]` and substitutes `#` with the numeric value.
 *   - `{name}` / `{{name}}` → `vars[name]` (raw block fallback if missing).
 *   - Anything outside `{...}` / `{{...}}` is literal text.
 *
 * `pluralRule` is the language-specific CLDR function — pass
 * `(n) => getPluralCategory(lang, n)` for production use.
 */
export function solveTemplate(
  template: string,
  vars: Record<string, string | number>,
  pluralRule: (n: number) => PluralCategory,
): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    if (template[i] === "{") {
      const isDouble = template[i + 1] === "{";
      const openLen = isDouble ? 2 : 1;
      const closeLen = isDouble ? 2 : 1;
      const closeStart = findMatchingClose(template, i, openLen, closeLen);
      if (closeStart === -1) {
        // Malformed — emit the FULL opener verbatim so the parser doesn't
        // reinterpret the residual chars as a separate `{...}` block.
        out += template.substring(i, i + openLen);
        i += openLen;
        continue;
      }
      const inner = template.substring(i + openLen, closeStart);
      out += interpretBlock(inner, vars, pluralRule, openLen);
      i = closeStart + closeLen;
      continue;
    }
    out += template[i];
    i++;
  }
  return out;
}

/**
 * Find the index of the matching close brace for the opener at `openIdx`.
 * Tracks depth using `{` = +1 and `}` = -1, so single-brace case bodies
 * nested inside a `{...}` (or `{{...}}`) outer close cleanly without
 * prematurely matching the outer.
 *
 * - `openLen` = 1 for `{...}`, 2 for `{{...}}`.
 * - `closeLen` = 1 for `{...}`, 2 for `{{...}}` — what we ACCEPT as the
 *   outer match when `depth === 0`.
 *
 * Returns -1 if no matching close is found (malformed input).
 */
function findMatchingClose(
  template: string,
  openIdx: number,
  openLen: number,
  closeLen: number,
): number {
  let depth = 0;
  let j = openIdx + openLen;
  while (j < template.length) {
    const c = template[j];
    if (c === "{") {
      depth++;
      j++;
      continue;
    }
    if (c === "}") {
      if (depth === 0) {
        if (closeLen === 2) {
          if (template[j + 1] === "}") return j;
          // Single `}` cannot close a double `{{`. Malformed.
          return -1;
        }
        // closeLen === 1: a `}` matches the outer.
        return j;
      }
      depth--;
      j++;
      continue;
    }
    j++;
  }
  return -1;
}

/**
 * Decide whether `{...}` / `{{...}}` resolves as an ICU plural pattern
 * or a simple `{varName}` substitution. The signal: at least 3 top-level
 * comma-separated segments with `segments[1].trim() === "plural"`.
 *
 * `openLen` (1 or 2) is passed in so the missing-var fallback emits the
 * original outer wrapper verbatim — preserves the upstream caller (the
 * `t()` function in i18n.tsx) ability to spot an unrendered template.
 */
function interpretBlock(
  inner: string,
  vars: Record<string, string | number>,
  pluralRule: (n: number) => PluralCategory,
  openLen: number,
): string {
  const segments = splitTopLevelCommas(inner);
  if (segments.length >= 3 && segments[1].trim() === "plural") {
    const pattern = parsePluralPattern(segments);
    if (pattern) return solvePluralPattern(pattern, vars, pluralRule);
  }
  // Simple `{varName}` interpolation.
  const varName = inner.trim();
  if (!varName) return ""; // `{}` → nothing
  if (vars[varName] === undefined) {
    return wrapLiteralForOpenLen(openLen, inner);
  }
  return String(vars[varName]);
}

function wrapLiteralForOpenLen(openLen: number, inner: string): string {
  // Recreate the original outer wrapper around an unrendered var so
  // dashboards / debug tools / i18n monitoring can spot missing keys.
  if (openLen === 2) return `{{${inner}}}`;
  return `{${inner}}`;
}

/**
 * Splits `inner` by top-level commas — commas not nested inside braces.
 * Returns the trimmed segments in order.
 */
function splitTopLevelCommas(inner: string): string[] {
  const segments: string[] = [];
  let segStart = 0;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === "," && depth === 0) {
      segments.push(inner.substring(segStart, i).trim());
      segStart = i + 1;
    }
  }
  segments.push(inner.substring(segStart).trim());
  return segments;
}

/**
 * Parses ICU plural segments `[name, "plural", case1, case2, ...]` into
 * a structured pattern. Crucially: cases may be space-separated within a
 * single comma-less segment (`one {body} other {body}`), so we re-tokenize
 * the post-header text by walking braces, looking back for a CLDR-style
 * category word immediately preceding a top-level `{`.
 */
function parsePluralPattern(segments: string[]): IcuPattern | null {
  const name = segments[0].trim();
  if (!name) return null;
  // Re-stitch segments[2..] back together (splitTopLevelCommas may have
  // over-split by a stray top-level comma between cases).
  const restText = segments.slice(2).join(" ");
  const cases = extractCases(restText);
  if (cases.length === 0) return null;
  return { name, cases };
}

/**
 * Extracts each CLDR case from the cases-text portion (everything after
 * `name, plural,`). Each case is rendered as `categoryName bodyText` where
 * `bodyText` lives inside a balanced `{...}` immediately following the
 * category word.
 *
 * IMPORTANT off-by-one: the body walker's `i++` happens AFTER the depth
 * check, so when `bodyDepth` reaches 0 we break WITHOUT incrementing.
 * That keeps the closing `}` out of the body substring, ensuring the
 * returned string has balanced braces (own opening `{` matched by the
 * matching `}` we just stopped at — that `}` is NOT in the body).
 *
 * Category-word look-back invariant: `catEnd` is captured AFTER the
 * whitespace-skip phase but BEFORE the second loop walks back through
 * the word. If the category word is preceded by a `}` from the prior
 * case body (no whitespace, e.g. `...}one {b}...`), the second loop
 * stops at that `}` and `cat = text.substring(j + 1, catEnd)` correctly
 * captures "one" — DO NOT merge the two loops or save catEnd later,
 * because then the walk-back would stop at the wrong boundary.
 */
function extractCases(text: string): IcuCase[] {
  const cases: IcuCase[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "{") {
      // Look back for the category word preceding this `{`. Skip
      // whitespace backward, then read non-whitespace / non-brace chars.
      let j = i - 1;
      while (j >= 0 && text[j] === " ") j--;
      const catEnd = j + 1;
      while (j >= 0 && text[j] !== " " && text[j] !== "{" && text[j] !== "}") {
        j--;
      }
      const cat = text.substring(j + 1, catEnd);
      // Walk the body to its matching `}`. bodyDepth starts at 1 (we just
      // entered this case body), and we break when bodyDepth returns to 0
      // WITHOUT consuming the closing `}` so the body substring stays
      // brace-balanced.
      let bodyDepth = 1;
      const bodyStart = i + 1;
      i++;
      while (i < text.length && bodyDepth > 0) {
        if (text[i] === "{") {
          bodyDepth++;
        } else if (text[i] === "}") {
          bodyDepth--;
          if (bodyDepth === 0) {
            // Don't increment — the `}` is the OUTER close and stays
            // outside the body string.
            break;
          }
        }
        if (bodyDepth > 0) i++;
      }
      const body = text.substring(bodyStart, i).trim();
      cases.push({ category: cat, body });
      // Skip past the outer `}`. After the break, i is still positioned
      // AT the matching `}`. If we didn't reach end of text, advance.
      if (i < text.length) i++;
      continue;
    }
    // Stray chars between cases (whitespace, accidental text) — skip.
    i++;
  }
  return cases;
}

/**
 * Resolves a plural pattern by picking the case for the matching category.
 * Falls back to `"other"` if the picked category isn't present, then to
 * the first case as a last-resort fallback. `#` placeholder is replaced
 * with the numeric value of the pluralized variable, then the body is
 * recursively solved so any nested ICU/var references resolve correctly.
 */
function solvePluralPattern(
  pattern: IcuPattern,
  vars: Record<string, string | number>,
  pluralRule: (n: number) => PluralCategory,
): string {
  const rawValue = vars[pattern.name];
  const value = Number(rawValue ?? 0);
  const category = pluralRule(value);

  let body: string | null = null;
  for (const c of pattern.cases) {
    if (c.category === category) {
      body = c.body;
      break;
    }
  }
  if (body === null) {
    for (const c of pattern.cases) {
      if (c.category === "other") {
        body = c.body;
        break;
      }
    }
  }
  if (body === null) body = pattern.cases[0]?.body ?? "";

  // `#` substitutes the numeric value per the ICU spec when present.
  // Bodies without `#` (e.g. `one {ticket}`) stay literal.
  const withCount = body.replace(/#/g, String(value));
  // Recursive solve so nested `{var, plural, ...}` or `{var}` inside the
  // resolved case body are themselves resolved. Pass the body raw —
  // any nested ICU/vars already contain their own `{...}` markers.
  return solveTemplate(withCount, vars, pluralRule);
}
