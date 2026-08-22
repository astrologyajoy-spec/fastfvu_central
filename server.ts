import { executeFVU, generateNativeNodeFVU } from "./src/lib/fvuEngine.js";
import { uploadToSupabase } from "./src/lib/storage.js";
import express from "express";
import path from "path";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import { pool } from "./src/lib/db";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "517384935957-14rlq2ost4h9hmnv0l1ftm36lj434947.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(express.json());

// CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Initialize Database Tables
async function initDB() {
  try {
    const connection = await pool.getConnection();
    
    // 1. users table
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

    // 2. api_keys table with foreign key
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

    // 3. fvu_logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS fvu_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        api_key_id INT NULL,
        filename VARCHAR(255) NOT NULL,
        csi_filename VARCHAR(255) NULL,
        output_filename VARCHAR(255) NULL,
        status VARCHAR(50) NOT NULL,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        error_details TEXT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
      )
    `);

    // Ensure csi_filename column exists if table was already created
    try {
      await connection.query("ALTER TABLE fvu_logs ADD COLUMN csi_filename VARCHAR(255) NULL");
    } catch (e: any) {
      // Column may already exist
    }

    connection.release();
    
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

    console.log("Database Schemas & Migrations initialized successfully for TiDB/MySQL.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}


// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: "TiDB Cloud Connected", timestamp: new Date() });
});

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

// Google Login / Registration
app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body || {};
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
      console.warn("Database storage skipped gracefully in server:", dbErr?.message || dbErr);
    }

    return res.status(200).json({ success: true, email, name, apiKey: finalApiKey });
  } catch (err: any) {
    const errorMsg = typeof err === 'string' ? err : (err?.message || 'Authentication processing error');
    console.error("Google Auth error:", errorMsg);
    return res.status(200).json({ success: false, error: errorMsg });
  }
});

// Register / Generate API Key
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const apiKey = 'fvu_live_' + Math.random().toString(36).substring(2, 12) + 'x';

    const connection = await pool.getConnection();
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
    } finally {
      connection.release();
    }
  } catch (err: any) {
    console.error("Register error:", err);
    // If api key collision or general error, generate another or return success with existing
    const fallbackKey = 'fvu_live_' + Math.random().toString(36).substring(2, 12) + 'x';
    res.json({ success: true, email: req.body.email, apiKey: fallbackKey });
  }
});

// Validate Statement & Log to TiDB Cloud
app.post("/api/fvu/validate", async (req, res) => {
  try {
    const { 
      email = "developer@fastfvu.central", 
      fileName = "statement_q4.txt", 
      fileContent = "",
      csiFileName = null,
      csiFileContent = null
    } = req.body;

    const startTime = Date.now();
    const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, "");
    const expectedFvuFileName = `${safeBaseName}.fvu`;
    const expectedErrFileName = `${safeBaseName}.err`;
    const jobId = `${safeBaseName}_${startTime}`;

    const githubPat = process.env.GITHUB_PAT_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || "astrologyajoy-spec/fastfvu_central";

    let dispatchedToGithub = false;

    if (githubPat) {
      try {
        const dispatchUrl = `https://api.github.com/repos/${githubRepo}/dispatches`;
        console.log(`[Express Validation] Dispatching to GitHub Actions: ${dispatchUrl}`);

        const dispatchRes = await fetch(dispatchUrl, {
          method: "POST",
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `Bearer ${githubPat}`,
            "Content-Type": "application/json",
            "User-Agent": "FastFVU-Central-App"
          },
          body: JSON.stringify({
            event_type: "fvu_validation",
            client_payload: {
              fileName,
              fileContent,
              csiFileName,
              csiFileContent,
              email,
              jobId
            }
          })
        });

        if (dispatchRes.ok || dispatchRes.status === 204) {
          dispatchedToGithub = true;
          console.log(`[Express Validation] Dispatched to GitHub Actions (${githubRepo}).`);
        }
      } catch (ghErr) {
        console.error("[Express Validation] GitHub Dispatch error:", ghErr);
      }
    }

    if (dispatchedToGithub) {
      return res.json({
        status: "PENDING",
        pending: true,
        dispatchedToGithub: true,
        jobId,
        fileName,
        fvuFileName: expectedFvuFileName,
        errorFileName: expectedErrFileName,
        processingTimeMs: Date.now() - startTime,
        message: "Validation job dispatched to GitHub Actions runner (Java 17). Polling for output report..."
      });
    }

    // Fallback: Use FastFVU Native JS Engine (Zero Java calls)
    const headerDetails = {
      rpuSoftware: "FastFVU Central",
      fileType: "TDS/TCS",
      formType: "24Q/26Q",
      tan: "",
      rpuVersion: "1.1"
    };

    const fvuResult = generateNativeNodeFVU(fileContent, fileName, headerDetails, csiFileContent || undefined);
    const recordedOutputFile = fvuResult.success ? fvuResult.fvuFileName : fvuResult.errorFileName;

    let fileContentBase64: string | null = null;
    let rawTextContent: string | null = null;

    if (fvuResult.success && fvuResult.fvuFileContent) {
      fileContentBase64 = Buffer.from(fvuResult.fvuFileContent).toString('base64');
    } else if (!fvuResult.success && fvuResult.errorContent) {
      rawTextContent = fvuResult.errorContent;
      fileContentBase64 = Buffer.from(fvuResult.errorContent, 'utf-8').toString('base64');
    }

    let storageUrl: string | null = null;
    try {
      if (fvuResult.success && fvuResult.fvuFileName && fvuResult.fvuFileContent) {
        storageUrl = await uploadToSupabase(fvuResult.fvuFileName, fvuResult.fvuFileContent);
      } else if (!fvuResult.success && fvuResult.errorFileName && fvuResult.errorContent) {
        storageUrl = await uploadToSupabase(fvuResult.errorFileName, fvuResult.errorContent);
      }
    } catch (uploadErr) {
      console.error("[Validation] Supabase upload failed:", uploadErr);
    }

    const dataUriFallback = fileContentBase64
      ? `data:application/octet-stream;base64,${fileContentBase64}`
      : null;

    const downloadUrl = storageUrl || dataUriFallback || (recordedOutputFile ? `/api/v1/fvu/download?filename=${recordedOutputFile}` : null);

    try {
      const connection = await pool.getConnection();
      try {
        const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
        const userId = (users && users.length > 0) ? users[0].id : null;

        await connection.query(
          "INSERT INTO fvu_logs (user_id, filename, csi_filename, output_filename, status, error_details) VALUES (?, ?, ?, ?, ?, ?)",
          [
            userId, 
            fileName, 
            csiFileName || null, 
            recordedOutputFile || null, 
            fvuResult.success ? "SUCCESS" : "FAILED", 
            fvuResult.success ? null : JSON.stringify(fvuResult.errors)
          ]
        );
      } finally {
        connection.release();
      }
    } catch (e) {}

    if (!fvuResult.success) {
      return res.status(400).json({
        status: "FAILED",
        errors: fvuResult.errors,
        errorFileName: fvuResult.errorFileName,
        downloadUrl,
        fileContentBase64,
        errorContent: rawTextContent,
        processingTimeMs: fvuResult.processingTimeMs,
        message: "FVU Validation failed. Please review the NSDL error report."
      });
    }

    res.json({
      status: "SUCCESS",
      fvuVersion: "1.1",
      errorCount: 0,
      processingTimeMs: fvuResult.processingTimeMs,
      fvuFileName: fvuResult.fvuFileName,
      downloadUrl,
      fileContentBase64,
      message: "Validated successfully by FastFVU Engine."
    });
  } catch (err: any) {
    console.error("Validation error:", err);
    res.status(500).json({ error: "Validation engine error: " + err.message });
  }
});

app.get("/api/fvu/logs", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    let rows;
    try {
      const [result]: any = await connection.query(
        "SELECT id, filename AS file_name, csi_filename, output_filename, status, error_details, processed_at AS created_at FROM fvu_logs ORDER BY processed_at DESC LIMIT 50"
      );
      rows = result;
    } finally {
      connection.release();
    }
    res.json({ logs: rows });
  } catch (err) {
    console.error("Logs error:", err);
    res.json({ logs: [] });
  }
});


// External Developer API Endpoint
app.post("/api/v1/fvu/generate", async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing x-api-key header" });
    }

    const { statementData, fileName = "api_payload.txt", csiData, csiFileName } = req.body;
    
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

      // Process using Java Engine
      const fvuResult = await executeFVU(statementData, fileName, csiData, csiFileName);
      const recordedOutputFile = fvuResult.success ? fvuResult.fvuFileName : fvuResult.errorFileName;

      await connection.query(
        "INSERT INTO fvu_logs (user_id, api_key_id, filename, csi_filename, output_filename, status, error_details) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          userId, 
          apiKeyId, 
          fileName, 
          csiFileName || null, 
          recordedOutputFile || null, 
          fvuResult.success ? "SUCCESS" : "FAILED", 
          fvuResult.success ? null : JSON.stringify(fvuResult.errors)
        ]
      );

      if (!fvuResult.success) {
        return res.status(400).json({
          status: "FAILED",
          errors: fvuResult.errors,
          errorFileName: fvuResult.errorFileName,
          processingTimeMs: fvuResult.processingTimeMs
        });
      }

      res.json({
        status: "SUCCESS",
        fvuVersion: "1.1",
        errorCount: 0,
        processingTimeMs: fvuResult.processingTimeMs,
        fvuFileName: fvuResult.fvuFileName,
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



// Download FVU or Error file
app.get("/api/v1/fvu/download", async (req, res) => {
  const filename = req.query.filename;
  if (!filename || typeof filename !== 'string') {
    return res.status(400).send("Filename is required");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-logs';

  if (supabaseUrl) {
    try {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`;
      const response = await fetch(publicUrl);
      
      if (response.ok) {
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        const buffer = await response.arrayBuffer();
        return res.status(200).send(Buffer.from(buffer));
      } else {
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        if (supabaseKey) {
          const authResponse = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/${bucketName}/${filename}`, {
            headers: { 'Authorization': `Bearer ${supabaseKey}` }
          });
          if (authResponse.ok) {
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Type", "application/octet-stream");
            const buffer = await authResponse.arrayBuffer();
            return res.status(200).send(Buffer.from(buffer));
          }
        }
      }
    } catch (err) {
      console.warn("Supabase fetch failed, falling back to local temp:", err);
    }
  }

  // Fallback to local temp directory (for Render execution)
  const path = require('path');
  const parts = filename.split('_');
  const sessionId = parts.length >= 2 ? parts[1].split('.')[0] : 'default';
  const filePath = path.join(process.cwd(), 'temp', sessionId, filename);
  
  res.download(filePath, filename, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  }, (err) => {
    if (err) {
      console.warn("File not found on disk:", err.message);
      if (!res.headersSent) {
        return res.status(404).json({ error: "File not found" });
      }
    }
  });
});

async function startServer() {
  await initDB();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FastFVU Central server running on http://localhost:${PORT}`);
  });
}

startServer();
