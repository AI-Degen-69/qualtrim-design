import Database from "better-sqlite3";
const db = new Database("./data/financedb.sqlite");

console.log("=== Distinct asset_type values ===");
console.log(
  db
    .prepare(
      "SELECT DISTINCT asset_type, count(*) as cnt FROM assets GROUP BY asset_type ORDER BY cnt DESC",
    )
    .all(),
);

console.log("\n=== Distinct sector values ===");
console.log(
  db
    .prepare(
      "SELECT DISTINCT sector, count(*) as cnt FROM assets WHERE sector IS NOT NULL GROUP BY sector ORDER BY cnt DESC",
    )
    .all(),
);

console.log("\n=== Distinct country (top 15) ===");
console.log(
  db
    .prepare(
      "SELECT DISTINCT country, count(*) as cnt FROM assets WHERE country IS NOT NULL GROUP BY country ORDER BY cnt DESC LIMIT 15",
    )
    .all(),
);
