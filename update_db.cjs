const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace initDB
const initDBRegex = /async function initDB\(\) \{[\s\S]*?(?=\/\/ API Routes)/;

const newInitDB = `async function initDB() {
  try {
    const connection = await pool.getConnection();
    
    // 1. users table
    await connection.query(\`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'client',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    \`);

    // 2. api_keys table with foreign key
    await connection.query(\`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        api_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_api_key (api_key)
      )
    \`);

    // 3. fvu_logs table
    await connection.query(\`
      CREATE TABLE IF NOT EXISTS fvu_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        api_key_id INT NULL,
        filename VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        error_details TEXT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
      )
    \`);

    connection.release();
    console.log("Database Schemas & Migrations initialized successfully for TiDB/MySQL.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

initDB();

`;

code = code.replace(initDBRegex, newInitDB);
fs.writeFileSync('server.ts', code);
console.log('initDB updated');
