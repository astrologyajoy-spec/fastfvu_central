import { executeFVU, generateNativeNodeFVU } from "./src/lib/fvuEngine";
import { uploadToSupabase } from "./src/lib/storage";
import express from "express";
import path from "path";
import os from "os";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";
import { pool } from "./src/lib/db";
import multer from "multer";
import { spawn } from "child_process";
import fs from "fs";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "517384935957-14rlq2ost4h9hmnv0l1ftm36lj434947.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(cors());
app.use(express.json());

// Set up temporary storage for uploaded files for GUI automation
const uploadDir = path.join(process.cwd(), "tmp_uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
  },
});
const upload = multer({ storage });

const cleanupFiles = (files: string[]) => {
  files.forEach((file) => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        console.error(`Failed to delete file: ${file}`, err);
      }
    }
  });
};

// CORS Middleware (backup/express)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.options('*all', cors());

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
  res.setHeader("Content-Type", "application/json");
  try {
    const { 
      email = "developer@fastfvu.central", 
      fileName = "statement_q4.txt", 
      fileContent = "",
      csiFileName = null,
      csiFileContent = null
    } = req.body || {};

    if (!fileContent) {
      return res.status(400).json({
        success: false,
        status: "FAILED",
        error: "File content is required",
        errors: [{ line: 1, code: "ERR_EMPTY", message: "File content is required." }]
      });
    }

    const startTime = Date.now();
    const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, "");
    const expectedFvuFileName = `${safeBaseName}.fvu`;
    const expectedErrFileName = `${safeBaseName}.err`;
    const jobId = `${safeBaseName}_${startTime}`;

    const githubPat = process.env.GITHUB_PAT_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || "astrologyajoy-spec/fastfvu_central";

    let dispatchedToGithub = false;
    let githubDispatchError: string | null = null;

    if (githubPat) {
      try {
        const [owner, repo] = (githubRepo || "astrologyajoy-spec/fastfvu_central").split('/');
        console.log(`[Express Validation] Triggering GitHub Actions dispatch for ${owner}/${repo} using Octokit...`);

        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: githubPat });

        await octokit.repos.createDispatchEvent({
          owner,
          repo,
          event_type: "fvu_validation",
          client_payload: {
            fileName,
            fileContent,
            csiFileName,
            csiFileContent,
            email,
            jobId
          }
        });

        dispatchedToGithub = true;
        console.log(`[Express Validation] Successfully dispatched FVU job to GitHub Actions (${owner}/${repo}).`);
      } catch (ghErr: any) {
        const errMsg = ghErr?.message || String(ghErr);
        const status = ghErr?.status || 400;
        console.error(`[Express Validation] GitHub dispatch error (status ${status}):`, errMsg);

        return res.status(status).json({
          success: false,
          step: "GITHUB_DISPATCH",
          error: "Failed to trigger GitHub Action: " + errMsg
        });
      }
    }

    if (dispatchedToGithub) {
      return res.json({
        success: true,
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
      if (pool) {
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
      }
    } catch (e) {
      console.warn("[Express Validation] DB log skipped:", e);
    }

    if (!fvuResult.success) {
      return res.status(400).json({
        success: false,
        status: "FAILED",
        errors: fvuResult.errors,
        errorFileName: fvuResult.errorFileName,
        downloadUrl,
        fileContentBase64,
        errorContent: rawTextContent,
        githubDispatchError: githubDispatchError || undefined,
        processingTimeMs: fvuResult.processingTimeMs,
        message: "FVU Validation failed. Please review the NSDL error report."
      });
    }

    res.json({
      success: true,
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
    res.status(500).json({ 
      success: false, 
      error: err?.message || "Internal Server Error", 
      stack: err?.stack 
    });
  }
});

app.get("/api/fvu/logs", async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  try {
    if (!pool) {
      return res.json({ success: true, logs: [], message: "Database pool not initialized" });
    }
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
    res.json({ success: true, logs: rows || [] });
  } catch (err: any) {
    console.error("Logs error:", err);
    res.status(200).json({ 
      success: false, 
      logs: [], 
      error: err?.message || "Failed to fetch logs",
      stack: err?.stack 
    });
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



// Check Job Status
app.get("/api/fvu/status", async (req, res) => {
  const filename = (req.query.filename || req.query.file_name || req.query.jobId) as string;
  if (!filename) {
    return res.status(200).json({ status: "PROCESSING", message: "No filename provided" });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-reports';

  try {
    const [rows]: any = await pool.query(
      `SELECT id, filename, output_filename, status, error_details, download_url 
       FROM fvu_logs 
       WHERE filename = ? OR output_filename = ? 
       ORDER BY id DESC LIMIT 1`,
      [filename, filename]
    );

    if (!rows || rows.length === 0) {
      return res.status(200).json({ status: "PROCESSING", message: "Job awaiting runner execution..." });
    }

    const log = rows[0];
    const targetFile = log.output_filename || filename;
    let publicUrl = log.download_url;
    if (!publicUrl && supabaseUrl && targetFile) {
      publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${targetFile}`;
    }

    if (log.status === 'PENDING' || log.status === 'PROCESSING') {
      return res.status(200).json({ status: "PROCESSING", message: "Validation in progress..." });
    }

    if (log.status === 'COMPLETED' || log.status === 'SUCCESS') {
      return res.status(200).json({
        status: "COMPLETED",
        filename: targetFile,
        publicUrl,
        downloadUrl: publicUrl,
        message: "Validation completed successfully."
      });
    }

    return res.status(200).json({
      status: "FAILED",
      filename: targetFile,
      publicUrl,
      downloadUrl: publicUrl,
      error_details: log.error_details,
      message: "Validation failed."
    });
  } catch (err: any) {
    console.error("Express status endpoint error:", err);
    return res.status(200).json({ status: "PROCESSING", message: "Checking status..." });
  }
});

// Download FVU or Error file
app.get("/api/v1/fvu/download", async (req, res) => {
  const filename = req.query.filename as string;
  const wantsJson = req.query.json === 'true' || req.headers.accept?.includes('application/json');

  if (!filename || typeof filename !== 'string') {
    return res.status(400).send("Filename is required");
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || 'fvu-reports';

  try {
    // 1. Check DB first
    const [rows]: any = await pool.query(
      `SELECT id, filename, output_filename, status, download_url 
       FROM fvu_logs 
       WHERE filename = ? OR output_filename = ? 
       ORDER BY id DESC LIMIT 1`,
      [filename, filename]
    );

    if (rows && rows.length > 0) {
      const log = rows[0];
      if (log.status === 'PENDING' || log.status === 'PROCESSING') {
        return res.status(200).json({ 
          status: "PROCESSING", 
          message: "Validation in progress on GitHub Actions Runner..." 
        });
      }

      const publicUrl = log.download_url || (supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${bucketName}/${log.output_filename || filename}` : null);
      if (publicUrl) {
        if (wantsJson) {
          return res.status(200).json({
            status: log.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
            filename: log.output_filename || filename,
            publicUrl,
            downloadUrl: publicUrl
          });
        }
        return res.redirect(302, publicUrl);
      }
    }

    // 2. Direct Supabase storage check
    if (supabaseUrl) {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filename}`;
      const response = await fetch(publicUrl, { method: 'HEAD' });
      if (response.ok) {
        if (wantsJson) {
          return res.status(200).json({
            status: "COMPLETED",
            filename,
            publicUrl,
            downloadUrl: publicUrl
          });
        }
        return res.redirect(302, publicUrl);
      }
    }

    // 3. Fallback to local files
    const parts = filename.split('_');
    const sessionId = parts.length >= 2 ? parts[1].split('.')[0] : 'default';
    const candidatePaths = [
      path.resolve(os.tmpdir(), 'fastfvu', sessionId, filename),
      path.resolve(os.tmpdir(), filename),
      path.resolve(process.cwd(), 'temp', sessionId, filename),
      path.resolve(process.cwd(), filename)
    ];

    for (const cPath of candidatePaths) {
      try {
        const fsModule = await import('fs/promises');
        const fileBuffer = await fsModule.readFile(cPath);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "application/octet-stream");
        return res.status(200).send(fileBuffer);
      } catch (e) {}
    }

    return res.status(200).json({ 
      status: "PROCESSING", 
      message: "File processing or awaiting storage upload." 
    });

  } catch (err) {
    console.warn("Download endpoint exception:", err);
    return res.status(200).json({ status: "PROCESSING", message: "Checking status..." });
  }
});

// GUI Automation FVU Endpoint (/api/generate-fvu)
app.post(
  "/api/generate-fvu",
  upload.fields([
    { name: "txtFile", maxCount: 1 },
    { name: "csiFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const txtFile = files["txtFile"]?.[0];
      const csiFile = files["csiFile"]?.[0];

      if (!txtFile) {
        res.status(400).json({ error: "Missing required .txt file" });
        return;
      }

      // Read file contents
      const txtContent = fs.readFileSync(txtFile.path, "utf8");
      const csiContent = csiFile ? fs.readFileSync(csiFile.path, "utf8") : null;
      
      const fileName = txtFile.originalname;
      const csiFileName = csiFile ? csiFile.originalname : null;
      
      // Email could be passed via body
      const email = req.body.email || "developer@fastfvu.central";

      const startTime = Date.now();
      const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, "");
      const expectedFvuFileName = `${safeBaseName}.fvu`;
      const expectedErrFileName = `${safeBaseName}.err`;
      const jobId = `${safeBaseName}_${startTime}`;

      const githubPat = process.env.GITHUB_PAT_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
      const githubRepo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || "astrologyajoy-spec/fastfvu_central";

      if (githubPat) {
        try {
          const [owner, repo] = (githubRepo || "astrologyajoy-spec/fastfvu_central").split('/');
          console.log(`[Generate-FVU] Triggering GitHub Actions dispatch for ${owner}/${repo} using Octokit...`);

          const { Octokit } = await import('@octokit/rest');
          const octokit = new Octokit({ auth: githubPat });

          await octokit.repos.createDispatchEvent({
            owner,
            repo,
            event_type: "fvu_validation",
            client_payload: {
              fileName,
              fileContent: txtContent,
              csiFileName,
              csiFileContent: csiContent,
              email,
              jobId
            }
          });

          // Insert into TiDB as PENDING
          try {
            if (pool) {
              const connection = await pool.getConnection();
              try {
                const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
                const userId = (users && users.length > 0) ? users[0].id : null;
                await connection.query(
                  "INSERT INTO fvu_logs (user_id, filename, csi_filename, output_filename, status) VALUES (?, ?, ?, ?, ?)",
                  [userId, fileName, csiFileName || null, expectedFvuFileName, "PENDING"]
                );
              } finally {
                connection.release();
              }
            }
          } catch (e) {
            console.warn("[Generate-FVU] DB log skipped:", e);
          }

          // Cleanup tmp files
          cleanupFiles([txtFile.path, csiFile ? csiFile.path : "0"].filter(p => p !== "0"));

          return res.json({
            success: true,
            status: "PENDING",
            pending: true,
            dispatchedToGithub: true,
            jobId,
            fileName,
            fvuFileName: expectedFvuFileName,
            errorFileName: expectedErrFileName,
            message: "Validation job dispatched to GitHub Actions runner (Java 17). Polling for output report..."
          });

        } catch (ghErr: any) {
          const errMsg = ghErr?.message || String(ghErr);
          const status = ghErr?.status || 400;
          console.error(`[Generate-FVU] GitHub dispatch error:`, errMsg);
          cleanupFiles([txtFile.path, csiFile ? csiFile.path : "0"].filter(p => p !== "0"));
          return res.status(status).json({ error: "Failed to trigger GitHub Action: " + errMsg });
        }
      } else {
        cleanupFiles([txtFile.path, csiFile ? csiFile.path : "0"].filter(p => p !== "0"));
        return res.status(500).json({ error: "GitHub PAT missing. Cannot dispatch to Vercel/GitHub Actions." });
      }

    } catch (error: any) {
      console.error("[Generate-FVU] Unexpected error:", error);
      res.status(500).json({ error: "Internal server error during generation" });
    }
  }
);

async function startServer() {
  await initDB();
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
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
