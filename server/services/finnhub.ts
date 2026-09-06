import NodeCache from "node-cache";

// Cache news for 15 minutes — news doesn't change that frequently
const newsCache = new NodeCache({ stdTTL: 900, checkperiod: 300 });

const FINNHUB_KEY = process.env.FINNHUB_KEY || process.env.VITE_FINNHUB_KEY;

export interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  category: string;
  datetime: number;
  related: string;
  image: string | null;
}

/**
 * Fetch company-specific news from Finnhub.
 * Free tier: 60 req/min.
 * Returns news from the last 7 days, limited to 20 items.
 */
export async function fetchCompanyNews(
  ticker: string,
  daysBack: number = 7,
): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) {
    console.error("[Finnhub] API key is missing. Set FINNHUB_KEY in .env");
    return [];
  }

  const symbol = ticker.toUpperCase();
  const cacheKey = `finnhub-news:${symbol}`;

  const cached = newsCache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const today = new Date().toISOString().split("T")[0];
    const past = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${past}&to=${today}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[Finnhub] Error ${res.status} for ${symbol} news`);
      return [];
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error(
        `[Finnhub] Unexpected response for ${symbol}:`,
        typeof data,
      );
      return [];
    }

    const news: NewsItem[] = data
      .filter((item: any) => item?.headline && item?.datetime)
      .slice(0, 20)
      .map((item: any) => ({
        id: item.id ?? 0,
        headline: item.headline ?? "",
        summary: item.summary ?? "",
        source: item.source ?? "Unknown",
        url: item.url ?? "",
        category: item.category ?? "general",
        datetime: item.datetime ?? 0,
        related: item.related ?? symbol,
        image: item.image ?? null,
      }));

    if (news.length > 0) {
      newsCache.set(cacheKey, news);
    }

    return news;
  } catch (e) {
    console.error(`[Finnhub] Fetch error for ${symbol} news:`, e);
    return [];
  }
}

/**
 * Fetch market news (general, not company-specific) from Finnhub.
 */
export async function fetchMarketNews(
  category: string = "general",
): Promise<NewsItem[]> {
  if (!FINNHUB_KEY) {
    console.error("[Finnhub] API key is missing. Set FINNHUB_KEY in .env");
    return [];
  }

  const cacheKey = `finnhub-market:${category}`;
  const cached = newsCache.get<NewsItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://finnhub.io/api/v1/news?category=${encodeURIComponent(category)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`[Finnhub] Error ${res.status} for market news`);
      return [];
    }

    const data = await res.json();

    if (!Array.isArray(data)) return [];

    const news: NewsItem[] = data
      .filter((item: any) => item?.headline && item?.datetime)
      .slice(0, 20)
      .map((item: any) => ({
        id: item.id ?? 0,
        headline: item.headline ?? "",
        summary: item.summary ?? "",
        source: item.source ?? "Unknown",
        url: item.url ?? "",
        category: item.category ?? category,
        datetime: item.datetime ?? 0,
        related: item.related ?? "",
        image: item.image ?? null,
      }));

    if (news.length > 0) {
      newsCache.set(cacheKey, news);
    }

    return news;
  } catch (e) {
    console.error("[Finnhub] Fetch error for market news:", e);
    return [];
  }
}
