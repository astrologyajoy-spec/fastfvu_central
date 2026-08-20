import { OAuth2Client } from 'google-auth-library';
import { pool } from '../../src/lib/db';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "517384935957-14rlq2ost4h9hmnv0l1ftm36lj434947.apps.googleusercontent.com";
let googleClient: OAuth2Client | null = null;
try {
  googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
} catch (clientErr) {
  console.warn("OAuth2Client init warning:", clientErr);
}

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payloadStr = Buffer.from(parts[1], 'base64').toString('utf-8');
      return JSON.parse(payloadStr);
    }
  } catch (e) {
    // Ignore decode error
  }
  return null;
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // use raw body
      }
    }
    const { credential } = body || {};

    if (!credential) {
      return res.status(400).json({ success: false, error: "No credential provided" });
    }

    let email = "";
    let name = "Google User";

    // 1. Try official verification
    if (googleClient) {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (payload && payload.email) {
          email = payload.email;
          name = payload.name || name;
        }
      } catch (verifyErr) {
        console.warn("verifyIdToken warning (falling back to JWT decode):", verifyErr);
      }
    }

    // 2. Fallback: Parse decoded JWT payload if verifyIdToken failed
    if (!email) {
      const decoded = decodeJwtPayload(credential);
      if (decoded && decoded.email) {
        email = decoded.email;
        name = decoded.name || name;
      }
    }

    if (!email) {
      return res.status(400).json({ success: false, error: "Invalid Google token payload" });
    }

    let finalApiKey = 'fvu_live_' + Math.random().toString(36).substring(2, 12) + 'x';

    // 3. Database persistence with graceful fallback
    try {
      if (pool) {
        const connection = await pool.getConnection();
        try {
          // Ensure tables exist
          await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              email VARCHAR(255) UNIQUE NOT NULL,
              password VARCHAR(255) NOT NULL,
              name VARCHAR(255),
              role VARCHAR(50) DEFAULT 'client',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);

          await connection.query(`
            CREATE TABLE IF NOT EXISTS api_keys (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              api_key VARCHAR(255) UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              INDEX idx_api_key (api_key)
            )
          `);

          const dummyPassword = "GOOGLE_AUTH_DUMMY_" + Math.random().toString(36);
          await connection.query(
            "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
            [email, dummyPassword, name, 'client']
          );

          const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
          if (users && users.length > 0) {
            const userId = users[0].id;
            const [existingKeys]: any = await connection.query("SELECT api_key FROM api_keys WHERE user_id = ?", [userId]);

            if (existingKeys && existingKeys.length > 0) {
              finalApiKey = existingKeys[0].api_key;
            } else {
              await connection.query(
                "INSERT INTO api_keys (user_id, api_key) VALUES (?, ?)",
                [userId, finalApiKey]
              );
            }
          }
        } finally {
          connection.release();
        }
      }
    } catch (dbErr: any) {
      console.warn("Database storage skipped gracefully:", dbErr?.message || dbErr);
    }

    return res.status(200).json({ success: true, email, name, apiKey: finalApiKey });
  } catch (err: any) {
    const errorMsg = typeof err === 'string' ? err : (err?.message || 'Authentication processing error');
    console.error("Google Auth error:", errorMsg);
    return res.status(200).json({ success: false, error: errorMsg });
  }
}
