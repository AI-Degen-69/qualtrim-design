import http from "http";

function checkPort(port: number, path: string) {
  return new Promise((resolve) => {
    http
      .get(`http://localhost:${port}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`Port ${port} status: ${res.statusCode}`);
          console.log(`Port ${port} response:`, data.slice(0, 300));
          resolve(true);
        });
      })
      .on("error", (err) => {
        console.log(`Port ${port} error:`, err.message);
        resolve(false);
      });
  });
}

async function run() {
  for (const port of [8080, 5000, 3000, 5173]) {
    await checkPort(port, "/api/screener/search?q=nvda");
  }
}

run();
