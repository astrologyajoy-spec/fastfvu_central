const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const regex = /app\.get\("\/api\/fvu\/logs", async \(req, res\) => \{[\s\S]*?res\.json\(\{ logs: \[\] \}\);\s*\}\s*\}\);/m;
const newRoute = `app.get("/api/fvu/logs", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    let rows;
    try {
      const [result]: any = await connection.query(
        "SELECT filename AS file_name, status, processed_at AS created_at FROM fvu_logs ORDER BY processed_at DESC LIMIT 20"
      );
      rows = result;
    } finally {
      connection.release();
    }
    res.json({ logs: rows });
  } catch (err) {
    console.error("Logs error:", err);
    res.json({ logs: [] });
  }
});`;

code = code.replace(regex, newRoute);
fs.writeFileSync('server.ts', code);
console.log('Fixed logs route');
