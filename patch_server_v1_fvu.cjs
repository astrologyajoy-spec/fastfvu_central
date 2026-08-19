const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

// Insert the new route before app.listen or at the end of routing
const newRoute = `
// External Developer API Endpoint
app.post("/api/v1/fvu/generate", async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    // Basic validation
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing x-api-key header" });
    }

    const { statementData, fileName = "api_payload.txt" } = req.body;
    
    if (!statementData) {
      return res.status(400).json({ error: "Missing 'statementData' in payload" });
    }

    // Process using existing Engine
    const fvuResult = await executeFVU(statementData, fileName);

    // Save to DB (Optional, we can log api requests in validation_logs if we want, with an 'api_user' tag)
    const connection = await pool.getConnection();
    try {
      await connection.query(
        "INSERT INTO validation_logs (user_email, file_name, status, fvu_version, processing_time) VALUES (?, ?, ?, ?, ?)",
        [\`api_user_\${apiKey.substring(0,6)}\`, fileName, fvuResult.success ? "SUCCESS" : "FAILED", "7.4", fvuResult.processingTimeMs]
      );
    } finally {
      connection.release();
    }

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

  } catch (err: any) {
    console.error("API validation error:", err);
    res.status(500).json({ error: "Internal Server Error: " + err.message });
  }
});

`;

if (!serverCode.includes('/api/v1/fvu/generate')) {
  // Find where to inject, right before the Vite middleware or app.listen
  const targetRegex = /\/\/ Vite middleware for development/g;
  serverCode = serverCode.replace(targetRegex, newRoute + '\n// Vite middleware for development');
  fs.writeFileSync('server.ts', serverCode);
  console.log('Patched server.ts with /api/v1/fvu/generate');
} else {
  console.log('Already patched.');
}
