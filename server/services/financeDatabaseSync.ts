import AdmZip from "adm-zip";
import Database from "better-sqlite3";
import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "../../data/financedb.sqlite");
const ZIP_URL =
  "https://github.com/JerBouma/FinanceDatabase/archive/refs/heads/main.zip";

// Global singleton
let db: Database.Database | null = null;

export function getScreenerDb() {
  if (!db) {
    throw new Error("Screener DB not initialized");
  }
  return db;
}

export async function initFinanceDatabase() {
  // Ensure data dir exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const dbExists = fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);

  // Check if table exists and has rows
  const tableCheck = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='assets'`,
    )
    .get();
  let needsSync = !tableCheck;
  if (tableCheck) {
    const rowCount = db.prepare(`SELECT count(*) as c FROM assets`).get() as {
      c: number;
    };
    if (rowCount.c < 1000) needsSync = true;
  }

  if (needsSync) {
    console.log(
      "[FinanceDatabase] Sync required. Downloading zip from GitHub...",
    );
    await syncDatabase();
  } else {
    console.log("[FinanceDatabase] DB already synced. Ready for queries.");
  }
}

async function syncDatabase() {
  const response = await fetch(ZIP_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download FinanceDatabase zip: ${response.statusText}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();

  // Initialize DB Schema
  db!.exec(`
    DROP TABLE IF EXISTS assets;
    CREATE TABLE assets (
      symbol TEXT PRIMARY KEY,
      name TEXT,
      asset_type TEXT,
      currency TEXT,
      sector TEXT,
      industry_group TEXT,
      industry TEXT,
      exchange TEXT,
      market TEXT,
      country TEXT,
      market_cap TEXT,
      summary TEXT
    );
    CREATE INDEX idx_asset_type ON assets(asset_type);
    CREATE INDEX idx_sector ON assets(sector);
    CREATE INDEX idx_industry ON assets(industry);
    CREATE INDEX idx_country ON assets(country);
    CREATE INDEX idx_name ON assets(name);
  `);

  const insertStmt = db!.prepare(`
    INSERT OR REPLACE INTO assets (
      symbol, name, asset_type, currency, sector, industry_group, industry, exchange, market, country, market_cap, summary
    ) VALUES (
      @symbol, @name, @asset_type, @currency, @sector, @industry_group, @industry, @exchange, @market, @country, @market_cap, @summary
    )
  `);

  db!.exec("BEGIN TRANSACTION");

  try {
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;

      const fileName = entry.entryName;
      if (!fileName.endsWith(".csv")) continue;

      // Only process files in the database/ directory
      if (!fileName.includes("/database/")) continue;

      // Determine asset type based on folder/file path
      let assetType = "Unknown";
      if (fileName.includes("/equities/")) assetType = "Equity";
      else if (fileName.includes("/etfs/")) assetType = "ETF";
      else if (fileName.includes("/funds/")) assetType = "Fund";
      else if (fileName.includes("cryptos.csv")) assetType = "Crypto";
      else if (fileName.includes("currencies.csv")) assetType = "Currency";
      else if (fileName.includes("indices.csv")) assetType = "Index";
      else if (fileName.includes("moneymarkets.csv")) assetType = "MoneyMarket";
      else continue;

      const csvData = entry.getData().toString("utf8");

      // Some CSVs might be empty or just have headers
      if (csvData.trim().split("\n").length <= 1) continue;

      try {
        const records = parse(csvData, {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: true,
        });

        for (const record of records) {
          const row = record as Record<string, string>;
          if (!row.symbol) continue;

          insertStmt.run({
            symbol: row.symbol,
            name: row.name || null,
            asset_type: assetType,
            currency: row.currency || null,
            sector: row.sector || null,
            industry_group: row.industry_group || null,
            industry: row.industry || null,
            exchange: row.exchange || null,
            market: row.market || null,
            country: row.country || null,
            market_cap: row.market_cap || null,
            summary: row.summary || null,
          });
        }
      } catch (err) {
        console.warn(
          `[FinanceDatabase] Failed to parse ${fileName}: `,
          err instanceof Error ? err.message : err,
        );
      }
    }
    db!.exec("COMMIT");
    console.log("[FinanceDatabase] Sync complete! Database is populated.");
  } catch (err) {
    db!.exec("ROLLBACK");
    throw err;
  }
}
