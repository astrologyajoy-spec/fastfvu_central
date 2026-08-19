const fs = require('fs');

let serverCode = fs.readFileSync('server.ts', 'utf8');

const importStatement = `import { executeFVU } from "./src/lib/fvuEngine";\n`;

if (!serverCode.includes('fvuEngine')) {
  serverCode = importStatement + serverCode;
}

const targetRouteRegex = /app\.post\("\/api\/fvu\/validate", async \(req, res\) => \{[\s\S]*?(?=app\.get\("\/api\/fvu\/logs")/g;

const newRoute = `app.post("/api/fvu/validate", async (req, res) => {
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
      message: "Validated successfully by Central Java Engine and saved to TiDB Cloud."
    });
  } catch (err: any) {
    console.error("Validation error:", err);
    res.status(500).json({ error: "Validation engine error: " + err.message });
  }
});

`;

serverCode = serverCode.replace(targetRouteRegex, newRoute);

fs.writeFileSync('server.ts', serverCode);
console.log("Patched server.ts");
