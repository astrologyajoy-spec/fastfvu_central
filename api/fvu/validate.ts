import { pool } from '../_lib/db';
import { generateNativeNodeFVU } from '../../src/lib/fvuEngine';
import { uploadToSupabase } from '../../src/lib/storage';

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
    const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, "");
    const expectedFvuFileName = `${safeBaseName}.fvu`;
    const expectedErrFileName = `${safeBaseName}.err`;
    const jobId = `${safeBaseName}_${startTime}`;

    // GitHub PAT Tokens (Supports GITHUB_PAT_TOKEN, GITHUB_PAT, or GITHUB_TOKEN)
    const githubPat = process.env.GITHUB_PAT_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    const githubRepo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY || "astrologyajoy-spec/fastfvu_central";

    let dispatchedToGithub = false;

    // Trigger GitHub Repository Dispatch Event (Bypassing Local Java on Vercel)
    if (githubPat) {
      try {
        const dispatchUrl = `https://api.github.com/repos/${githubRepo}/dispatches`;
        console.log(`[Validation API] Triggering GitHub Actions dispatch: ${dispatchUrl}`);

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
          console.log(`[Validation API] Successfully dispatched FVU job to GitHub Actions (${githubRepo}).`);
        } else {
          const errText = await dispatchRes.text();
          console.warn(`[Validation API] GitHub Dispatch returned status ${dispatchRes.status}:`, errText);
        }
      } catch (ghErr: any) {
        console.error("[Validation API] GitHub dispatch error:", ghErr?.message || ghErr);
      }
    }

    if (dispatchedToGithub) {
      const responseData = {
        status: "PENDING",
        pending: true,
        dispatchedToGithub: true,
        jobId,
        fileName,
        fvuFileName: expectedFvuFileName,
        errorFileName: expectedErrFileName,
        processingTimeMs: Date.now() - startTime,
        message: "Validation job dispatched to GitHub Actions runner (Java 17). Polling for output report..."
      };

      // Record to DB
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
              [userId, fileName, csiFileName || null, expectedFvuFileName, "PENDING", "Dispatched to GitHub Actions Runner"]
            );
          } finally {
            connection.release();
          }
        }
      } catch (dbErr: any) {
        console.warn("DB log skipped:", dbErr?.message || dbErr);
      }

      return res.status(200).json(responseData);
    }

    // Fallback if GITHUB_PAT_TOKEN is not set: Run FastFVU Native JS Engine (Zero Java runtime dependency)
    console.log("[Validation API] GITHUB_PAT_TOKEN not detected. Executing FastFVU Native Node Engine...");
    const headerDetails = {
      rpuSoftware: "FastFVU Central",
      fileType: "TDS/TCS",
      formType: "24Q/26Q",
      tan: "",
      rpuVersion: "1.1"
    };

    const result = generateNativeNodeFVU(fileContent, fileName, headerDetails, csiFileContent || undefined);
    const recordedOutputFile = result.success ? result.fvuFileName : result.errorFileName;
    const isSuccess = result.success;

    let fileContentBase64: string | null = null;
    let rawTextContent: string | null = null;

    if (isSuccess && result.fvuFileContent) {
      fileContentBase64 = Buffer.from(result.fvuFileContent).toString('base64');
    } else if (!isSuccess && result.errorContent) {
      rawTextContent = result.errorContent;
      fileContentBase64 = Buffer.from(result.errorContent, 'utf-8').toString('base64');
    }

    let storageUrl: string | null = null;
    try {
      if (isSuccess && result.fvuFileContent && result.fvuFileName) {
        storageUrl = await uploadToSupabase(result.fvuFileName, result.fvuFileContent);
      } else if (!isSuccess && result.errorContent && result.errorFileName) {
        storageUrl = await uploadToSupabase(result.errorFileName, result.errorContent);
      }
    } catch (uploadErr) {
      console.warn("Supabase upload skipped:", uploadErr);
    }

    const dataUriFallback = fileContentBase64 ? `data:application/octet-stream;base64,${fileContentBase64}` : null;

    return res.status(isSuccess ? 200 : 400).json({
      status: isSuccess ? "SUCCESS" : "FAILED",
      fvuVersion: "1.1",
      errorCount: result.errors?.length || 0,
      errors: result.errors || [],
      fvuFileName: isSuccess ? result.fvuFileName : null,
      errorFileName: !isSuccess ? result.errorFileName : null,
      downloadUrl: storageUrl || dataUriFallback || `/api/v1/fvu/download?filename=${recordedOutputFile}`,
      fileContentBase64,
      errorContent: !isSuccess ? rawTextContent : null,
      dispatchedToGithub: false,
      processingTimeMs: Date.now() - startTime,
      message: isSuccess 
        ? "Validated successfully by FastFVU NSDL Compliant Engine." 
        : "Validation failed. Please review NSDL error report."
    });

  } catch (err: any) {
    const errorMsg = typeof err === 'string' ? err : (err?.message || 'Validation processing error');
    console.error("Validation error:", errorMsg);
    return res.status(200).json({ status: "FAILED", errors: [{ line: 1, code: "ERR_EXEC", message: errorMsg }] });
  }
}
