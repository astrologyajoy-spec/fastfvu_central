const mysql = require('mysql2/promise');

async function test() {
  try {
    const conn = await mysql.createConnection({
      host: "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
      user: "2eNMjq4nRAhJLGj.root",
      password: "Ajoy@2019",
      database: "fastfvu_central",
      port: 4000
    });
    console.log("SUCCESS plain password NO SSL!");
    await conn.end();
  } catch (err) {
    console.error("FAILED NO SSL:", err.message);
  }
}
test();
