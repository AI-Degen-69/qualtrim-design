import http from "http";

function checkFilter(path: string) {
  return new Promise((resolve) => {
    http
      .get(`http://localhost:3000${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            console.log(`\n=== GET ${path} ===`);
            console.log(`Total: ${parsed.total}`);
            console.log(`Top 5 results:`);
            console.table(
              (parsed.results || []).slice(0, 5).map((r: any) => ({
                symbol: r.symbol,
                name: r.name,
                asset_type: r.asset_type,
                sector: r.sector,
                country: r.country,
              })),
            );
          } catch (e) {
            console.log(`Error parsing response:`, data);
          }
          resolve(true);
        });
      })
      .on("error", (err) => {
        console.log(`HTTP error:`, err.message);
        resolve(false);
      });
  });
}

async function run() {
  // Test default load: Stocks (Equity) + ETF in United States with primary only
  await checkFilter(
    "/api/screener/filter?country=United+States&asset_type=Equity,ETF&exclude_dots=1",
  );

  // Test sorting by name ASC
  await checkFilter(
    "/api/screener/filter?country=United+States&asset_type=Equity,ETF&exclude_dots=1&sort_by=name&sort_dir=asc",
  );
}

run();
