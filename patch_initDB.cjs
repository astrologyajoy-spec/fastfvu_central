const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/^initDB\(\);\s*$/m, '');

const startServerOld = `async function startServer() {`;
const startServerNew = `async function startServer() {
  await initDB();`;

code = code.replace(startServerOld, startServerNew);
fs.writeFileSync('server.ts', code);
console.log('initDB is now awaited in startServer');
