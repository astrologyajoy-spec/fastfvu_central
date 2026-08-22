const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

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
    // Check if any .fvu or .err exists in workDir
    if (fs.existsSync(workDir)) {
      const files = fs.readdirSync(workDir);
      const foundFvu = files.find(f => f.endsWith('.fvu'));
      const foundErr = files.find(f => f.endsWith('.err'));
      if (foundFvu && fs.statSync(path.join(workDir, foundFvu)).size > 0) {
        isSuccess = true;
        targetPath = path.join(workDir, foundFvu);
        outputFileName = foundFvu;
      } else if (foundErr) {
        isSuccess = false;
        targetPath = path.join(workDir, foundErr);
        outputFileName = foundErr;
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

  // 1. Upload to Supabase Storage if configured
  let downloadUrl = null;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const bucketName = process.env.SUPABASE_BUCKET_NAME || "fvu-logs";

  if (targetPath && fs.existsSync(targetPath) && supabaseUrl && supabaseKey) {
    try {
      const fileBuffer = fs.readFileSync(targetPath);
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucketName}/${outputFileName}`;
      console.log(`Uploading ${outputFileName} to Supabase: ${uploadUrl}`);
      
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
        downloadUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${outputFileName}`;
        console.log(`Uploaded to Supabase successfully. URL: ${downloadUrl}`);
      } else {
        const errTxt = await res.text();
        console.warn(`Supabase upload returned status ${res.status}: ${errTxt}`);
      }
    } catch (supErr) {
      console.error("Supabase upload exception:", supErr);
    }
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

    // Find user ID by email
    const [users] = await connection.query("SELECT id FROM users WHERE email = ?", [email]);
    const userId = (users && users.length > 0) ? users[0].id : null;

    // Check if a log entry already exists for this filename or if we should insert
    await connection.query(
      `INSERT INTO fvu_logs (user_id, filename, csi_filename, output_filename, status, error_details) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        fileName,
        csiFileName,
        outputFileName,
        statusVal,
        logMessage
      ]
    );

    console.log(`Successfully recorded log entry in TiDB database with status '${statusVal}'.`);
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
