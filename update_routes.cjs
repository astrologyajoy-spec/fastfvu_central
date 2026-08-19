const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Function to replace blocks using regex
function replaceBlock(regex, replacement) {
  code = code.replace(regex, replacement);
}

// Update Google Auth
replaceBlock(/try \{\s*\/\/ Insert user if not exists[\s\S]*?res\.json\(\{ success: true, email, name, apiKey: finalApiKey \}\);\s*\} finally/m,
`try {
      // Insert user if not exists
      await connection.query(
        "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
        [email, dummyPassword, name, 'client']
      );

      const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
      const userId = users[0].id;

      // Check if API key exists for this user, if not, create one
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

      res.json({ success: true, email, name, apiKey: finalApiKey });
    } finally`);

// Update Register
replaceBlock(/const connection = await pool\.getConnection\(\);\s*try \{\s*\/\/ Insert user\s*await connection\.query\([\s\S]*?res\.json\(\{ success: true, email, apiKey \}\);\s*\} finally/m,
`const connection = await pool.getConnection();
    try {
      // Insert user
      const [result]: any = await connection.query(
        "INSERT INTO users (email, password) VALUES (?, ?)",
        [email, password]
      );
      const userId = result.insertId;

      // Insert api key
      await connection.query(
        "INSERT INTO api_keys (user_id, api_key) VALUES (?, ?)",
        [userId, apiKey]
      );

      res.json({ success: true, email, apiKey });
    } finally`);

fs.writeFileSync('server.ts', code);
console.log('Routes auth patched');
