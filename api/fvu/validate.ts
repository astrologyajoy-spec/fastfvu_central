import { pool } from '../_lib/db.js';
import { executeFVU } from '../../src/lib/fvuEngine.js';
import { uploadToSupabase } from '../../src/lib/storage.js';

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ status: "FAILED", error: "Method not allowed. Use POST." });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const {
      email = "developer@fastfvu.central",
      fileName = "statement_q4.txt",
      fileContent = "",
      csiFileName = null,
      csiFileContent = null
    } = body || {};

    if (!fileContent) {
      return res.status(400).json({ status: "FAILED", errors: [{ line: 1, code: "ERR_EMPTY", message: "File content is required." }] });
    }

    const startTime = Date.now();

    // Attempt local Java execution first
    const result = await executeFVU(fileContent, fileName, csiFileContent, csiFileName);

    // If local execution failed due to missing JRE or if GITHUB_PAT is set, trigger GitHub Actions workflow
    const githubPat = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY; // e.g. "owner/repo"

    let dispatchedToGithub = false;
    if ((!result.success && result.errors?.some(e => e.code === 'JRE_NOT_FOUND')) || (githubPat && githubRepo)) {
      if (githubPat && githubRepo) {
        try {
          const dispatchRes = await fetch(`https://api.github.com/repos/${githubRepo}/dispatches`, {
            method: "POST",
            headers: {
              "Accept": "application/vnd.github.v3+json",
              "Authorization": `Bearer ${githubPat}`,
              "Content-Type": "application/json",
              "User-Agent": "FastFVU-Central-App"
            },
            body: JSON.stringify({
              event_type: "fvu_validate",
              client_payload: {
                fileName,
                fileContent,
                csiFileName,
                csiFileContent,
                email,
                jobId: startTime.toString()
              }
            })
          });

          if (dispatchRes.ok || dispatchRes.status === 204) {
            dispatchedToGithub = true;
            console.log(`[Validation] Successfully dispatched FVU validation to GitHub Actions (${githubRepo}).`);
          } else {
            const errText = await dispatchRes.text();
            console.warn(`[Validation] GitHub Dispatch returned status ${dispatchRes.status}:`, errText);
          }
        } catch (ghErr) {
          console.error("[Validation] Failed dispatching to GitHub Actions:", ghErr);
        }
      }
    }

    let recordedOutputFile = result.success ? result.fvuFileName : result.errorFileName;
    const isSuccess = result.success;

    // Prepare base64 / text content payload for fallback download
    let fileContentBase64: string | null = null;
    let rawTextContent: string | null = null;

    if (isSuccess && result.fvuFileContent) {
      if (Buffer.isBuffer(result.fvuFileContent)) {
        fileContentBase64 = result.fvuFileContent.toString('base64');
      } else if (typeof result.fvuFileContent === 'string') {
        fileContentBase64 = Buffer.from(result.fvuFileContent, 'utf-8').toString('base64');
        rawTextContent = result.fvuFileContent;
      }
    } else if (!isSuccess && result.errorContent) {
      rawTextContent = result.errorContent;
      fileContentBase64 = Buffer.from(result.errorContent, 'utf-8').toString('base64');
    }

    // Upload true file contents to Supabase Storage
    let storageUrl: string | null = null;
    try {
      if (isSuccess && result.fvuFileContent && result.fvuFileName) {
        storageUrl = await uploadToSupabase(result.fvuFileName, result.fvuFileContent);
        console.log(`[Validation] Uploaded successful FVU file ${result.fvuFileName} to Supabase: ${storageUrl || 'Skipped'}`);
      } else if (!isSuccess && result.errorContent && result.errorFileName) {
        storageUrl = await uploadToSupabase(result.errorFileName, result.errorContent);
        console.log(`[Validation] Uploaded error log ${result.errorFileName} to Supabase: ${storageUrl || 'Skipped'}`);
      }
    } catch (uploadErr) {
      console.error("[Validation] Supabase upload failed:", uploadErr);
    }

    const processingTimeMs = Date.now() - startTime;

    // Construct data URI fallback if Supabase is unconfigured or failed
    const dataUriFallback = fileContentBase64
      ? `data:application/octet-stream;base64,${fileContentBase64}`
      : null;

    const validationResult = {
      status: isSuccess ? "SUCCESS" : "FAILED",
      fvuVersion: result.fvuVersionUsed || "1.1",
      errorCount: result.errors?.length || 0,
      errors: result.errors || [],
      fvuFileName: isSuccess ? result.fvuFileName : null,
      errorFileName: !isSuccess ? result.errorFileName : null,
      downloadUrl: storageUrl || dataUriFallback || (recordedOutputFile ? `/api/v1/fvu/download?filename=${recordedOutputFile}` : null),
      fileContentBase64,
      errorContent: !isSuccess ? rawTextContent : null,
      dispatchedToGithub,
      processingTimeMs,
      message: isSuccess 
        ? "Validated successfully by Local Java Engine." 
        : (dispatchedToGithub 
            ? "FVU validation job triggered on GitHub Actions runner. Result will be uploaded to Supabase Storage."
            : "FVU Validation failed. Please review the NSDL error report.")
    };

    // Database persistence
    try {
      if (pool) {
        const connection = await pool.getConnection();
        try {
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
              error_details TEXT NULL
            )
          `);
          const [users]: any = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
          const userId = (users && users.length > 0) ? users[0].id : null;
          await connection.query(
            "INSERT INTO fvu_logs (user_id, filename, csi_filename, output_filename, status, error_details) VALUES (?, ?, ?, ?, ?, ?)",
            [
              userId,
              fileName,
              csiFileName || null,
              recordedOutputFile || null,
              isSuccess ? "SUCCESS" : "FAILED",
              isSuccess ? null : JSON.stringify(validationResult.errors || [])
            ]
          );
        } finally {
          connection.release();
        }
      }
    } catch (dbErr: any) {
      console.warn("Logging to database skipped gracefully:", dbErr?.message || dbErr);
    }

    if (!isSuccess) {
      return res.status(400).json(validationResult);
    }

    return res.status(200).json(validationResult);

  } catch (err: any) {
    const errorMsg = typeof err === 'string' ? err : (err?.message || 'Validation engine processing error');
    console.error("Validation handler error:", errorMsg);
    return res.status(200).json({ status: "FAILED", errors: [{ line: 1, code: "ERR_EXEC", message: errorMsg }] });
  }
}
