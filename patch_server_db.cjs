const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. SELECT query
code = code.replace(
  "SELECT filename AS file_name, status, processed_at AS created_at FROM fvu_logs ORDER BY processed_at DESC LIMIT 20",
  "SELECT filename AS file_name, output_filename, status, processed_at AS created_at FROM fvu_logs ORDER BY processed_at DESC LIMIT 20"
);

// 2. INSERT in /api/fvu/validate
code = code.replace(
  /"INSERT INTO fvu_logs \(user_id, filename, status, error_details\) VALUES \(\?, \?, \?, \?\)",\s*\[userId, fileName, fvuResult\.success \? "SUCCESS" : "FAILED", fvuResult\.success \? null : JSON\.stringify\(fvuResult\.errors\)\]/,
  `"INSERT INTO fvu_logs (user_id, filename, output_filename, status, error_details) VALUES (?, ?, ?, ?, ?)",
        [userId, fileName, fvuResult.fvuFileName, fvuResult.success ? "SUCCESS" : "FAILED", fvuResult.success ? null : JSON.stringify(fvuResult.errors)]`
);

// 3. INSERT in /api/v1/fvu/generate
code = code.replace(
  /"INSERT INTO fvu_logs \(user_id, api_key_id, filename, status, error_details\) VALUES \(\?, \?, \?, \?, \?\)",\s*\[userId, apiKeyId, fileName, fvuResult\.success \? "SUCCESS" : "FAILED", fvuResult\.success \? null : JSON\.stringify\(fvuResult\.errors\)\]/,
  `"INSERT INTO fvu_logs (user_id, api_key_id, filename, output_filename, status, error_details) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, apiKeyId, fileName, fvuResult.fvuFileName, fvuResult.success ? "SUCCESS" : "FAILED", fvuResult.success ? null : JSON.stringify(fvuResult.errors)]`
);

// Also need to update the initDB for auto-migration logic:
code = code.replace(
  /CREATE TABLE IF NOT EXISTS fvu_logs \([\s\S]*?processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,/m,
  `CREATE TABLE IF NOT EXISTS fvu_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        api_key_id INT NULL,
        filename VARCHAR(255) NOT NULL,
        output_filename VARCHAR(255) NULL,
        status VARCHAR(50) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,`
);

fs.writeFileSync('server.ts', code);
console.log('patched server db insert/select');
