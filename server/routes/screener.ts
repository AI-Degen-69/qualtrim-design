import type { Request, Response } from "express";
import { getScreenerDb } from "../services/financeDatabaseSync";

export function handleScreenerSearch(req: Request, res: Response) {
  const query = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 20;

  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const db = getScreenerDb();
    const results = db
      .prepare(
        `
      SELECT symbol, name, asset_type, exchange, country, sector
      FROM assets 
      WHERE symbol LIKE ? OR name LIKE ? 
      ORDER BY 
        CASE 
          WHEN UPPER(symbol) = UPPER(?) THEN 1
          WHEN UPPER(symbol) LIKE UPPER(? || '%') AND symbol NOT LIKE '%.%' THEN 2
          WHEN UPPER(symbol) LIKE UPPER(? || '%') THEN 3
          WHEN UPPER(name) LIKE UPPER(? || '%') THEN 4
          ELSE 5
        END,
        CASE WHEN country = 'United States' THEN 1 ELSE 2 END,
        LENGTH(symbol) ASC,
        symbol ASC
      LIMIT ?
    `,
      )
      .all(`%${query}%`, `%${query}%`, query, query, query, query, limit);

    res.json({ results });
  } catch (error) {
    console.error("[ScreenerSearch]", error);
    res.status(500).json({ error: "Failed to search screener database" });
  }
}

export function handleScreenerFilter(req: Request, res: Response) {
  const {
    q,
    sector,
    industry,
    country,
    asset_type,
    exclude_dots,
    sort_by,
    sort_dir = "asc",
    limit = "50",
    offset = "0",
  } = req.query;

  try {
    const db = getScreenerDb();

    const conditions: string[] = [];
    const params: any[] = [];

    if (q && typeof q === "string" && q.trim().length > 0) {
      const searchStr = `%${q.trim()}%`;
      conditions.push("(symbol LIKE ? OR name LIKE ?)");
      params.push(searchStr, searchStr);
    }

    // Helper: split comma-separated values into an IN (?,?,...) clause
    const addMulti = (col: string, raw: string | undefined) => {
      if (!raw) return;
      const vals = (raw as string)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (vals.length === 0) return;
      const placeholders = vals.map(() => "?").join(",");
      conditions.push(`${col} IN (${placeholders})`);
      params.push(...vals);
    };

    addMulti("sector", sector as string | undefined);
    addMulti("industry", industry as string | undefined);

    // For countries, include assets with NULL country (ETFs, Crypto, Indices)
    // so they aren't completely filtered out when a country is selected.
    if (country) {
      const vals = (country as string)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (vals.length > 0) {
        const placeholders = vals.map(() => "?").join(",");
        conditions.push(`(country IN (${placeholders}) OR country IS NULL)`);
        params.push(...vals);
      }
    }

    addMulti("asset_type", asset_type as string | undefined);

    // Optionally exclude symbols with dots (foreign exchange duplicates like AAPL.BA)
    if (exclude_dots === "1" || exclude_dots === "true") {
      conditions.push("symbol NOT LIKE '%.%'");
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countParams = [...params];
    const countQuery = `SELECT count(*) as total FROM assets ${whereClause}`;
    const totalRow = db.prepare(countQuery).get(...countParams) as {
      total: number;
    };

    // Determine sort clause
    const validSortColumns: Record<string, string> = {
      symbol: "symbol",
      name: "name",
      asset_type: "asset_type",
      sector: "sector",
      industry: "industry",
      country: "country",
      market_cap: "market_cap",
    };

    const requestedCol =
      typeof sort_by === "string"
        ? validSortColumns[sort_by.toLowerCase()]
        : undefined;
    const direction =
      typeof sort_dir === "string" && sort_dir.toLowerCase() === "desc"
        ? "DESC"
        : "ASC";

    let orderClause = `
      ORDER BY
        CASE WHEN country = 'United States' THEN 1 ELSE 2 END,
        CASE WHEN symbol NOT LIKE '%.%' THEN 1 ELSE 2 END,
        LENGTH(symbol) ASC,
        symbol ASC
    `;

    if (requestedCol) {
      orderClause = `ORDER BY ${requestedCol} ${direction} NULLS LAST`;
    }

    // Get paginated results
    const resultsQuery = `
      SELECT symbol, name, asset_type, exchange, country, sector, industry, market_cap, summary
      FROM assets
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit as string), parseInt(offset as string));
    const results = db.prepare(resultsQuery).all(...params);

    res.json({
      total: totalRow.total,
      results,
    });
  } catch (error) {
    console.error("[ScreenerFilter]", error);
    res.status(500).json({ error: "Failed to filter screener database" });
  }
}

export function handleScreenerAsset(req: Request, res: Response) {
  const { symbol } = req.params;

  try {
    const db = getScreenerDb();
    const asset = db
      .prepare(
        `
      SELECT * FROM assets WHERE symbol = ?
    `,
      )
      .get(symbol);

    if (!asset) {
      return res.status(404).json({ error: "Asset not found in database" });
    }

    res.json(asset);
  } catch (error) {
    console.error("[ScreenerAsset]", error);
    res.status(500).json({ error: "Failed to fetch asset metadata" });
  }
}

export function handleScreenerFacets(_req: Request, res: Response) {
  try {
    const db = getScreenerDb();
    const asset_types = (
      db
        .prepare(
          `SELECT DISTINCT asset_type FROM assets WHERE asset_type IS NOT NULL ORDER BY asset_type`,
        )
        .all() as { asset_type: string }[]
    ).map((r) => r.asset_type);

    const sectors = (
      db
        .prepare(
          `SELECT DISTINCT sector FROM assets WHERE sector IS NOT NULL ORDER BY sector`,
        )
        .all() as { sector: string }[]
    ).map((r) => r.sector);

    const countries = (
      db
        .prepare(
          `SELECT DISTINCT country, count(*) as cnt FROM assets WHERE country IS NOT NULL GROUP BY country ORDER BY cnt DESC LIMIT 30`,
        )
        .all() as { country: string; cnt: number }[]
    ).map((r) => r.country);

    res.json({ asset_types, sectors, countries });
  } catch (error) {
    console.error("[ScreenerFacets]", error);
    res.status(500).json({ error: "Failed to fetch screener facets" });
  }
}
