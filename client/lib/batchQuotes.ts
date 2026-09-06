import type { BatchQuoteResponse } from "../../shared/api";

/**
 * Split a list of symbols into API-safe request batches.
 * The batch quote route accepts at most 50 symbols per request.
 */
export function chunkSymbols(symbols: string[], chunkSize = 50): string[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("chunkSize must be a positive integer");
  }

  const chunks: string[][] = [];
  for (let start = 0; start < symbols.length; start += chunkSize) {
    chunks.push(symbols.slice(start, start + chunkSize));
  }
  return chunks;
}

/**
 * Merge settled batch-quote responses into one `BatchQuoteResponse`.
 *
 * Contract (pinned by batchQuotes.spec.ts): partial success is a
 * success — quotes from every fulfilled batch flow through in request
 * order and failed batches are simply absent from the result. Only when
 * EVERY batch fails does this throw, re-raising the first rejection's
 * reason so React Query sees the real cause.
 */
export function mergeBatchQuoteResponses(
  responses: PromiseSettledResult<BatchQuoteResponse>[],
): BatchQuoteResponse {
  const successful = responses.filter(
    (response): response is PromiseFulfilledResult<BatchQuoteResponse> =>
      response.status === "fulfilled",
  );
  if (successful.length === 0) {
    const firstFailure = responses.find(
      (response): response is PromiseRejectedResult =>
        response.status === "rejected",
    );
    throw firstFailure?.reason ?? new Error("All quote batches failed");
  }
  return {
    quotes: successful.flatMap((response) => response.value.quotes),
  };
}
