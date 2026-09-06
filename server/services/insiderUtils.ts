import type { InsiderTransactionCategory } from "../../shared/api";

export interface ParsedTransactionPrice {
  low: number;
  high: number;
  exact: number | null;
}

const PRICE_NUMBER = "\\$?([0-9][0-9,]*(?:\\.[0-9]+)?)";

function toFinite(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : null;
}

/** Parse Yahoo's human-readable transaction text, including price ranges. */
export function parseTransactionPrice(
  text: unknown,
): ParsedTransactionPrice | null {
  if (typeof text !== "string" || text.trim() === "") return null;
  const range = new RegExp(
    `\\bprice\\s+${PRICE_NUMBER}\\s*(?:-|–|—|to)\\s*${PRICE_NUMBER}\\s+per\\s+share`,
    "i",
  ).exec(text);
  if (range) {
    const low = toFinite(range[1]);
    const high = toFinite(range[2]);
    if (low !== null && high !== null && low > 0 && high >= low) {
      return { low, high, exact: low === high ? low : null };
    }
  }

  const exact = new RegExp(
    `\\bprice\\s+${PRICE_NUMBER}\\s+per\\s+share`,
    "i",
  ).exec(text);
  const price = exact ? toFinite(exact[1]) : null;
  return price !== null && price > 0
    ? { low: price, high: price, exact: price }
    : null;
}

/**
 * Normalize Yahoo/SEC language into a small UI taxonomy. Codes are accepted
 * when present, but Yahoo often omits them and only supplies transactionText.
 */
export function classifyTransaction(
  text: unknown,
  code?: unknown,
): { category: InsiderTransactionCategory; isAdministrative: boolean } {
  const normalizedCode =
    typeof code === "string" ? code.trim().toUpperCase() : "";
  const normalizedText = typeof text === "string" ? text.toLowerCase() : "";

  if (
    normalizedCode === "P" ||
    /\bpurchase\b|bought|buy/.test(normalizedText)
  ) {
    return { category: "purchase", isAdministrative: false };
  }
  if (normalizedCode === "S" || /\bsale\b|sold|sell/.test(normalizedText)) {
    return { category: "sale", isAdministrative: false };
  }
  if (normalizedCode === "G" || /gift/.test(normalizedText)) {
    return { category: "gift", isAdministrative: true };
  }
  if (
    normalizedCode === "A" ||
    /award|grant|restricted stock|rsu/.test(normalizedText)
  ) {
    return { category: "award", isAdministrative: true };
  }
  if (normalizedCode === "F" || /withholding|tax/.test(normalizedText)) {
    return { category: "withholding", isAdministrative: true };
  }
  if (
    normalizedCode === "M" ||
    /option exercise|exercise/.test(normalizedText)
  ) {
    return { category: "optionExercise", isAdministrative: true };
  }
  if (normalizedCode === "X" || /option grant/.test(normalizedText)) {
    return { category: "optionGrant", isAdministrative: true };
  }
  if (normalizedCode === "D" || /disposal|disposition/.test(normalizedText)) {
    return { category: "disposal", isAdministrative: true };
  }
  if (normalizedCode === "C" || /conversion|convert/.test(normalizedText)) {
    return { category: "conversion", isAdministrative: true };
  }
  return { category: "other", isAdministrative: true };
}

/** Prefer a provider-reported value; derive only for an exact reliable price. */
export function resolveTransactionValue(
  rawValue: unknown,
  shares: number,
  price: ParsedTransactionPrice | null,
): { value: number | null; source: "reported" | "derived" | null } {
  const reported = toFinite(rawValue);
  if (reported !== null) return { value: reported, source: "reported" };
  if (shares > 0 && price?.exact !== null && price?.exact !== undefined) {
    return { value: shares * price.exact, source: "derived" };
  }
  return { value: null, source: null };
}

export function transactionCategoryLabelKey(
  category: InsiderTransactionCategory,
): string {
  switch (category) {
    case "purchase":
      return "insider.type.P";
    case "sale":
      return "insider.type.S";
    case "award":
      return "insider.type.A";
    case "gift":
      return "insider.type.G";
    case "optionExercise":
      return "insider.type.M";
    case "withholding":
      return "insider.type.F";
    case "disposal":
      return "insider.type.D";
    case "optionGrant":
      return "insider.type.X";
    case "conversion":
      return "insider.type.C";
    default:
      return "insider.type.other";
  }
}
