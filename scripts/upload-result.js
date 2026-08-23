import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { createClient } from '@supabase/supabase-js';

async function run() {
  console.log("=========================================================");
  console.log("     FastFVU Central - GitHub Runner Output Sync         ");
  console.log("=========================================================");

  // --- STAGE: ENVIRONMENT VALIDATION ---
  let supabaseUrl, supabaseKey, bucketName, dbHost, dbUser, dbPassword, dbName, dbPort;
  let fileName, email, jobId, csiFileName, javaVersionLog, jarCheckLog, inputWriteLog, javaRunLog, jarMissing;

  try {
    fileName = process.env.FILE_NAME || "statement.txt";
    email = process.env.EMAIL || "developer@fastfvu.central";
    jobId = process.env.JOB_ID || "job_" + Date.now();
    csiFileName = process.env.CSI_FILE_NAME || null;

    javaVersionLog = process.env.JAVA_VERSION_LOG || "Not recorded";
    jarCheckLog = process.env.JAR_CHECK_LOG || "Not recorded";
    inputWriteLog = process.env.INPUT_WRITE_LOG || "Not recorded";
    javaRunLog = process.env.JAVA_RUN_LOG || "No run log captured";
    jarMissing = process.env.JAR_MISSING === "true";

    supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    bucketName = process.env.SUPABASE_BUCKET_NAME || "fvu-reports";

    dbHost = process.env.DB_HOST || process.env.TIDB_HOST;
    dbUser = process.env.DB_USER || process.env.TIDB_USER;
    dbPassword = process.env.DB_PASSWORD || process.env.TIDB_PASSWORD;
    dbName = process.env.DB_NAME || process.env.TIDB_DATABASE || "fastfvu_central";
    dbPort = Number(process.env.DB_PORT || process.env.TIDB_PORT || 4000);

    if (!dbHost || !dbUser || !dbPassword) {
      throw new Error("Missing critical TiDB Cloud environment variables (DB_HOST, DB_USER, DB_PASSWORD).");
    }
  } catch (envErr) {
    console.error("[ERROR_STAGE: ENV_VALIDATION] Failed to bind environment variables.");
    console.error(envErr.stack || envErr.message);
    process.exit(1);
  }

  // --- STAGE: FILE DETECTION ---
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

  // --- STAGE: SUPABASE STORAGE ---
  let publicUrl = null;
  if (!supabaseUrl || !supabaseKey) {
    console.warn("[WARN_STAGE: SUPABASE_ENV] Supabase credentials missing. Skipping Supabase upload.");
  } else {
    try {
      console.log(`Initializing Supabase client for bucket '${bucketName}'...`);
      const supabase = createClient(supabaseUrl, supabaseKey);

      if (fs.existsSync(workDir)) {
        const filesInWorkDir = fs.readdirSync(workDir);
        for (const file of filesInWorkDir) {
          if (file.endsWith('.fvu') || file.endsWith('.err') || file.endsWith('.txt')) {
            const filePath = path.join(workDir, file);
            if (fs.statSync(filePath).isFile()) {
              const fileBuffer = fs.readFileSync(filePath);
              console.log(`Uploading ${file} to Supabase bucket '${bucketName}'...`);
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(file, fileBuffer, {
                  contentType: "application/octet-stream",
                  upsert: true
                });

              if (uploadError) {
                console.error(`[ERROR_STAGE: SUPABASE_STORAGE_FAIL] Failed uploading ${file}`);
                console.error(JSON.stringify(uploadError, null, 2));
                throw new Error(`Supabase API Error: ${uploadError.message}`);
              }
              console.log(`Successfully uploaded ${file} via Supabase JS client.`);
            }
          }
        }
      }

      const targetFileForUrl = outputFileName || fvuFileName;
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(targetFileForUrl);

      if (urlData && urlData.publicUrl) {
        publicUrl = urlData.publicUrl;
      } else {
        publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${targetFileForUrl}`;
      }
      console.log(`Public URL obtained: ${publicUrl}`);

    } catch (supaErr) {
      console.error("[ERROR_STAGE: SUPABASE_STORAGE_FAIL] Supabase operation aborted.");
      console.error(supaErr.stack || supaErr.message);
      process.exit(1);
    }
  }

  // --- STAGE: TIDB DATABASE SYNC ---
  try {
    console.log(`Connecting to TiDB database (${dbHost}:${dbPort})...`);
    const connection = await mysql.createConnection({
      host: dbHost, 
      user: dbUser, 
      password: dbPassword, 
      database: dbName, 
      port: dbPort,
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectTimeout: 15000
    });

    const statusVal = isSuccess ? "COMPLETED" : "FAILED";

    try {
      await connection.query("ALTER TABLE fvu_logs ADD COLUMN download_url VARCHAR(512) NULL");
    } catch (e) {
      // Ignore if column exists
    }

    const [users] = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
    const userId = (users && users.length > 0) ? users[0].id : null;

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
    console.error("[ERROR_STAGE: TIDB_QUERY_FAIL] TiDB database update failed.");
    console.error(dbErr.stack || dbErr.message);
    if (dbErr.code) console.error(`Error Code: ${dbErr.code}`);
    if (dbErr.sqlMessage) console.error(`SQL Message: ${dbErr.sqlMessage}`);
    process.exit(1);
  }

  // --- FINAL CHECK ---
  // Previously, we exited with 1 if `isSuccess` was false (FVU validation failure).
  // However, an FVU validation failure is NOT an infrastructure failure.
  // The sync to DB/Supabase was successful, so the GitHub Action step should pass.
  if (!isSuccess) {
    console.log("[INFO] FVU validation completed with errors. Results synced successfully.");
  } else {
    console.log("[INFO] FVU validation and database sync completed successfully.");
  }
}

run().catch(err => {
  console.error("[ERROR_STAGE: UNHANDLED_EXCEPTION] Fatal error in upload-result script:");
  console.error(err.stack || err.message);
  process.exit(1);
});

