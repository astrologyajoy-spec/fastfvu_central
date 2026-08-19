const mysql = require('mysql2/promise');

async function test() {
  try {
    const conn = await mysql.createConnection({
      host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
      user: "2eNMjq4nRAhJLGj.root",
      password: "Q5RkID1fG3IqUlOL",
      database: "fastfvu_central",
      port: 4000,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      }
    });
    console.log("SUCCESS! Connected to TiDB.");
    await conn.end();
  } catch (err) {
    console.error("FAILED:", err.message);
  }
}
test();
