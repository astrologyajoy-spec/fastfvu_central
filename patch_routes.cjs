const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Replace /api/fvu/validate with new fvu_logs table structure
const oldValidate = `app.post("/api/fvu/validate", async (req, res) => {
  try {
    const { email = "developer@fastfvu.central", fileName = "statement_q4.txt", fileContent = "" } = req.body;
    
    // Call the Java execution engine
    const fvuResult = await executeFVU(fileContent, fileName);

    const connection = await pool.getConnection();
    try {
      await connection.query(
        "INSERT INTO validation_logs (user_email, file_name, status, fvu_version, processing_time) VALUES (?, ?, ?, ?, ?)",
        [email, fileName, fvuResult.success ? "SUCCESS" : "FAILED", "7.4", fvuResult.processingTimeMs]
      );
    } finally {
      connection.release();
    }`;

const newValidate = `app.post("/api/fvu/validate", async (req, res) => {
  try {
    const { email = "developer@fastfvu.central", fileName = "statement_q4.txt", fileContent = "" } = req.body;
    
    // Call the Java execution engine
    const fvuResult = await executeFVU(fileContent, fileName);

    const connection = await pool.getConnection();
    try {
      // Find user id
      const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
      const userId = (users && users.length > 0) ? users[0].id : null;

      await connection.query(
        "INSERT INTO fvu_logs (user_id, filename, status, error_details) VALUES (?, ?, ?, ?)",
        [userId, fileName, fvuResult.success ? "SUCCESS" : "FAILED", fvuResult.success ? null : JSON.stringify(fvuResult.errors)]
      );
    } finally {
      connection.release();
    }`;

code = code.replace(oldValidate, newValidate);

// 2. Replace /api/fvu/logs with new fvu_logs table structure
const oldLogs = `app.get("/api/fvu/logs", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    let rows;
    try {
      const [result]: any = await connection.query(
        "SELECT * FROM validation_logs ORDER BY created_at DESC LIMIT 20"
      );
      rows = result;
    } finally {`;

const newLogs = `app.get("/api/fvu/logs", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    let rows;
    try {
      const [result]: any = await connection.query(
        "SELECT filename AS file_name, status, processed_at AS created_at FROM fvu_logs ORDER BY processed_at DESC LIMIT 20"
      );
      rows = result;
    } finally {`;

code = code.replace(oldLogs, newLogs);

// 3. Inject /api/v1/fvu/generate before async function startServer()
const newRoute = `
// External Developer API Endpoint
app.post("/api/v1/fvu/generate", async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing x-api-key header" });
    }

    const { statementData, fileName = "api_payload.txt" } = req.body;
    
    if (!statementData) {
      return res.status(400).json({ error: "Missing 'statementData' in payload" });
    }

    const connection = await pool.getConnection();
    let apiKeyId = null;
    let userId = null;

    try {
      const [keys]: any = await connection.query("SELECT id, user_id FROM api_keys WHERE api_key = ?", [apiKey]);
      if (!keys || keys.length === 0) {
        return res.status(401).json({ error: "Unauthorized: Invalid x-api-key" });
      }
      apiKeyId = keys[0].id;
      userId = keys[0].user_id;

      // Process using existing Engine
      const fvuResult = await executeFVU(statementData, fileName);

      await connection.query(
        "INSERT INTO fvu_logs (user_id, api_key_id, filename, status, error_details) VALUES (?, ?, ?, ?, ?)",
        [userId, apiKeyId, fileName, fvuResult.success ? "SUCCESS" : "FAILED", fvuResult.success ? null : JSON.stringify(fvuResult.errors)]
      );

      if (!fvuResult.success) {
        return res.status(400).json({
          status: "FAILED",
          errors: fvuResult.errors,
          processingTimeMs: fvuResult.processingTimeMs
        });
      }

      res.json({
        status: "SUCCESS",
        fvuVersion: "7.4",
        errorCount: 0,
        processingTimeMs: fvuResult.processingTimeMs,
        fvuFileName: fvuResult.fvuFileName,
        fvuContent: fvuResult.fvuContent,
        message: "Validated successfully via Developer API."
      });

    } finally {
      connection.release();
    }

  } catch (err: any) {
    console.error("API validation error:", err);
    res.status(500).json({ error: "Internal Server Error: " + err.message });
  }
});

`;

if (!code.includes('/api/v1/fvu/generate')) {
  code = code.replace(/async function startServer\(\) \{/, newRoute + '\nasync function startServer() {');
}

fs.writeFileSync('server.ts', code);
console.log('API routes patched successfully.');
