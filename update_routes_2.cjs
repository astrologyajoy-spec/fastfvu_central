const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldRegister = `    const connection = await pool.getConnection();
    try {
      // Insert user if not exists
      await connection.query(
        "INSERT INTO users (email, password) VALUES (?, ?) ON DUPLICATE KEY UPDATE email=email",
        [email, password]
      );

      // Insert api key
      await connection.query(
        "INSERT INTO api_keys (email, api_key) VALUES (?, ?)",
        [email, apiKey]
      );

      res.json({ success: true, email, apiKey });
    } finally {`;

const newRegister = `    const connection = await pool.getConnection();
    try {
      // Insert user if not exists
      await connection.query(
        "INSERT INTO users (email, password) VALUES (?, ?) ON DUPLICATE KEY UPDATE email=email",
        [email, password]
      );

      const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
      const userId = users[0].id;

      // Check if API key already exists for this user (they might have registered twice)
      const [existingKeys]: any = await connection.query("SELECT api_key FROM api_keys WHERE user_id = ?", [userId]);
      let finalApiKey = apiKey;
      if (existingKeys && existingKeys.length > 0) {
        finalApiKey = existingKeys[0].api_key;
      } else {
        await connection.query(
          "INSERT INTO api_keys (user_id, api_key) VALUES (?, ?)",
          [userId, finalApiKey]
        );
      }

      res.json({ success: true, email, apiKey: finalApiKey });
    } finally {`;

code = code.replace(oldRegister, newRegister);
fs.writeFileSync('server.ts', code);
console.log('Register auth patched');
