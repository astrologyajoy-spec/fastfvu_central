const mysql = require('mysql2/promise');

async function test() {
  try {
    const conn = await mysql.createConnection({
      host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
      user: "2eNMjq4nRAhJLGj.root",
      password: "Ajoy%402019",
      database: "fastfvu_central",
      port: 4000,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      }
    });
    console.log("SUCCESS url-encoded password!");
    await conn.end();
  } catch (err) {
    console.error("FAILED url-encoded password:", err.message);
  }
}
test();
