import { pool } from '../_lib/db';

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {}
    }
    const { email, password } = body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const apiKey = 'fvu_live_' + Math.random().toString(36).substring(2, 12) + 'x';
    let finalApiKey = apiKey;
    try {
      if (pool) {
        const connection = await pool.getConnection();
        try {
          await connection.query(
            "INSERT INTO users (email, password, role) VALUES (?, ?, 'client') ON DUPLICATE KEY UPDATE password=VALUES(password)",
            [email, password]
          );

          const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
          if (users && users.length > 0) {
            const userId = users[0].id;
            const [existingKeys]: any = await connection.query("SELECT api_key FROM api_keys WHERE user_id = ?", [userId]);
            if (existingKeys && existingKeys.length > 0) {
              finalApiKey = existingKeys[0].api_key;
            } else {
              await connection.query("INSERT INTO api_keys (user_id, api_key) VALUES (?, ?)", [userId, finalApiKey]);
            }
          }
        } finally {
          connection.release();
        }
      }
    } catch (dbErr: any) {
      console.warn("Database storage skipped gracefully in register:", dbErr?.message || dbErr);
    }

    return res.status(200).json({ success: true, email, apiKey: finalApiKey });
  } catch (err: any) {
    const errorMsg = typeof err === 'string' ? err : (err?.message || 'Registration processing error');
    console.error("Register Error:", errorMsg);
    return res.status(200).json({ success: false, error: errorMsg });
  }
}
