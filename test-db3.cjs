const mysql = require('mysql2/promise');

async function test() {
  try {
    const conn = await mysql.createConnection('mysql://2eNMjq4nRAhJLGj.root:Ajoy%402019@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/fastfvu_central?ssl={"minVersion":"TLSv1.2","rejectUnauthorized":true}');
    console.log("SUCCESS URI!");
    await conn.end();
  } catch (err) {
    console.error("FAILED URI:", err.message);
  }
}
test();
