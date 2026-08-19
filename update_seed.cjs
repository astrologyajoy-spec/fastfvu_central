const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const seedScript = `
    // 4. Seed dummy data for playground
    const [dummyUser]: any = await connection.query("SELECT id FROM users WHERE email = 'developer@fastfvu.central'");
    let dummyUserId;
    if (!dummyUser || dummyUser.length === 0) {
       const [res]: any = await connection.query("INSERT INTO users (email, password, name, role) VALUES ('developer@fastfvu.central', 'dummy_pass', 'Developer', 'admin')");
       dummyUserId = res.insertId;
    } else {
       dummyUserId = dummyUser[0].id;
    }

    await connection.query("INSERT IGNORE INTO api_keys (user_id, api_key) VALUES (?, 'ffv_test_9982x')", [dummyUserId]);
    await connection.query("INSERT IGNORE INTO api_keys (user_id, api_key) VALUES (?, 'ffv_live_9982x')", [dummyUserId]);
`;

code = code.replace(/console\.log\("Database Schemas & Migrations initialized successfully for TiDB\/MySQL\."\);/, seedScript + '\n    console.log("Database Schemas & Migrations initialized successfully for TiDB/MySQL.");');
fs.writeFileSync('server.ts', code);
console.log('Seeder added');
