import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
  console.warn("Could not require @supabase/supabase-js directly, will fallback to HTTP REST where needed:", e.message);
}

async function run() {
  console.log("=========================================================");
  console.log("     FastFVU Central - GitHub Runner Output Sync         ");
  console.log("=========================================================");

  const fileName = process.env.FILE_NAME || "statement.txt";
  const email = process.env.EMAIL || "developer@fastfvu.central";
  const jobId = process.env.JOB_ID || "job_" + Date.now();
  const csiFileName = process.env.CSI_FILE_NAME || null;

  const javaVersionLog = process.env.JAVA_VERSION_LOG || "Not recorded";
  const jarCheckLog = process.env.JAR_CHECK_LOG || "Not recorded";
  const inputWriteLog = process.env.INPUT_WRITE_LOG || "Not recorded";
  const javaRunLog = process.env.JAVA_RUN_LOG || "No run log captured";
  const jarMissing = process.env.JAR_MISSING === "true";

  const workDir = path.join(process.cwd(), "tmp_job");
  const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^/.]+$/, "");
  const fvuFileName = safeBaseName + ".fvu";
  const errFileName = safeBaseName + ".err";

  const fvuPath = path.join(workDir, fvuFileName);
  const errPath = path.join(workDir, errFileName);

  let isSuccess = false;
  let targetPath = null;
  let outputFileName = null;

  if (!jarMissing && fs.existsSync(fvuPath) && fs.statSync(fvuPath).size > 0) {
    isSuccess = true;
    targetPath = fvuPath;
    outputFileName = fvuFileName;
  } else if (fs.existsSync(errPath)) {
    isSuccess = false;
    targetPath = errPath;
    outputFileName = errFileName;
  } else {
    // Check if any .fvu or .err or .txt exists in workDir
    if (fs.existsSync(workDir)) {
      const files = fs.readdirSync(workDir);
      const foundFvu = files.find(f => f.endsWith('.fvu'));
      const foundErr = files.find(f => f.endsWith('.err'));
      const foundTxt = files.find(f => f.endsWith('.txt') && f !== fileName);
      
      if (foundFvu && fs.statSync(path.join(workDir, foundFvu)).size > 0) {
        isSuccess = true;
        targetPath = path.join(workDir, foundFvu);
        outputFileName = foundFvu;
      } else if (foundErr) {
        isSuccess = false;
        targetPath = path.join(workDir, foundErr);
        outputFileName = foundErr;
      } else if (foundTxt) {
        isSuccess = false;
        targetPath = path.join(workDir, foundTxt);
        outputFileName = foundTxt;
      }
    }
  }

  let logMessage = "";
  if (isSuccess) {
    logMessage = "JAR executed successfully. FVU generated.\n\n[Java Run Output]:\n" + javaRunLog;
  } else if (jarMissing) {
    logMessage = "ERROR: Java JAR file not found at path";
  } else {
    logMessage = [
      "=========================================================",
      "              FVU RUNNER DIAGNOSTIC LOG (FAILED)         ",
      "=========================================================",
      `File Name: ${fileName}`,
      `Job ID   : ${jobId}`,
      `Time     : ${new Date().toISOString()}`,
      "---------------------------------------------------------",
      "[1] Java Installation Output:",
      javaVersionLog,
      "---------------------------------------------------------",
      "[2] JAR File Existence Check:",
      jarCheckLog,
      "---------------------------------------------------------",
      "[3] Input File Creation Confirmation:",
      inputWriteLog,
      "---------------------------------------------------------",
      "[4] Java Execution Log (java_run.log):",
      javaRunLog,
      "========================================================="
    ].join("\n");
  }

  console.log(`Execution Outcome : ${isSuccess ? "SUCCESS" : "FAILED"}`);
  console.log(`Output File       : ${outputFileName || "None"}`);
  console.log(`Diagnostic Log:\n${logMessage}`);

  // 1. Upload to Supabase Storage 'fvu-reports' bucket using @supabase/supabase-js
  let publicUrl = null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || "fvu-reports";

  if (supabaseUrl && supabaseKey) {
    console.log(`Initializing Supabase client for bucket '${bucketName}'...`);
    let supabase = null;
    if (createClient) {
      supabase = createClient(supabaseUrl, supabaseKey);
    }

    // Upload all generated files in output folder (.fvu, .err, .txt)
    if (fs.existsSync(workDir)) {
      const filesInWorkDir = fs.readdirSync(workDir);
      for (const file of filesInWorkDir) {
        if (file.endsWith('.fvu') || file.endsWith('.err') || file.endsWith('.txt')) {
          const filePath = path.join(workDir, file);
          if (fs.statSync(filePath).isFile()) {
            try {
              const fileBuffer = fs.readFileSync(filePath);
              console.log(`Uploading ${file} to Supabase bucket '${bucketName}'...`);
              
              if (supabase) {
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from(bucketName)
                  .upload(file, fileBuffer, {
                    contentType: "application/octet-stream",
                    upsert: true
                  });

                if (uploadError) {
                  console.warn(`Supabase JS client upload warning for ${file}:`, uploadError.message);
                } else {
                  console.log(`Successfully uploaded ${file} via Supabase JS client.`);
                }
              } else {
                // Fallback to HTTP API
                const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${file}`;
                const res = await fetch(uploadUrl, {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${supabaseKey}`,
                    "Content-Type": "application/octet-stream",
                    "x-upsert": "true"
                  },
                  body: fileBuffer
                });
                if (res.ok) {
                  console.log(`Successfully uploaded ${file} via Supabase REST API.`);
                }
              }
            } catch (upErr) {
              console.error(`Failed uploading ${file} to Supabase:`, upErr);
            }
          }
        }
      }
    }

    // Obtain Public URL using supabase.storage.from('fvu-reports').getPublicUrl(outputFileName || filename)
    const targetFileForUrl = outputFileName || fvuFileName;
    if (supabase) {
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(targetFileForUrl);

      if (urlData && urlData.publicUrl) {
        publicUrl = urlData.publicUrl;
      }
    }
    
    if (!publicUrl) {
      publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${targetFileForUrl}`;
    }

    console.log(`Public URL obtained: ${publicUrl}`);
  } else {
    console.warn("Supabase credentials not set in environment. Skipping Supabase Storage upload.");
  }

  // 2. Sync to TiDB / MySQL Database
  const host = process.env.DB_HOST || process.env.TIDB_HOST || "gateway01.ap-southeast-1.prod.aws.tidbcloud.com";
  const user = process.env.DB_USER || process.env.TIDB_USER || "2eNMjq4nRAhJLGj.root";
  const password = process.env.DB_PASSWORD || process.env.TIDB_PASSWORD || "Q5RkIDlfG3lqUlOL";
  const database = process.env.DB_NAME || process.env.TIDB_DATABASE || "fastfvu_central";
  const port = Number(process.env.DB_PORT || process.env.TIDB_PORT || 4000);

  try {
    console.log(`Connecting to TiDB database (${host}:${port})...`);
    const connection = await mysql.createConnection({
      host, user, password, database, port,
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectTimeout: 10000
    });

    const statusVal = isSuccess ? "COMPLETED" : "FAILED";

    // Ensure download_url column exists
    try {
      await connection.query("ALTER TABLE fvu_logs ADD COLUMN download_url VARCHAR(512) NULL");
    } catch (e) {}

    // Find user ID by email
    const [users] = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
    const userId = (users && users.length > 0) ? users[0].id : null;

    // Check if there is a recent PENDING/PROCESSING job for this file or job
    const [pendingRows] = await connection.query(
      "SELECT id FROM fvu_logs WHERE filename = ? AND status IN ('PENDING', 'PROCESSING') ORDER BY id DESC LIMIT 1",
      [fileName]
    );

    if (pendingRows && pendingRows.length > 0) {
      await connection.query(
        `UPDATE fvu_logs 
         SET output_filename = ?, status = ?, error_details = ?, download_url = ? 
         WHERE id = ?`,
        [outputFileName || fvuFileName, statusVal, logMessage, publicUrl, pendingRows[0].id]
      );
      console.log(`Updated existing log record #${pendingRows[0].id} with status '${statusVal}'.`);
    } else {
      await connection.query(
        `INSERT INTO fvu_logs (user_id, filename, csi_filename, output_filename, status, error_details, download_url) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, fileName, csiFileName, outputFileName || fvuFileName, statusVal, logMessage, publicUrl]
      );
      console.log(`Inserted new log record with status '${statusVal}'.`);
    }

    await connection.end();
  } catch (dbErr) {
    console.error("TiDB database update error:", dbErr);
  }

  if (!isSuccess) {
    console.error("Workflow completed with status FAILED.");
    process.exit(1);
  }
}

run().catch(err => {
  console.error("Fatal error in upload-result script:", err);
  process.exit(1);
});