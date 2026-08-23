import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log("=========================================================");
  console.log("         FastFVU - Java Execution & Diagnostics          ");
  console.log("=========================================================");

  const workDir = path.join(process.cwd(), 'tmp_job');
  const fileName = process.env.FILE_NAME || 'statement.txt';
  const csiFileName = process.env.CSI_FILE_NAME || null;
  const jarMissing = process.env.JAR_MISSING === 'true';
  const jarPath = process.env.JAR_PATH;

  const logFilePath = 'java_run.log';
  const statusFilePath = 'status.txt';

  const appendLog = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFilePath, msg + '\n');
  };

  fs.writeFileSync(logFilePath, ''); // Clear existing log

  if (jarMissing || !jarPath) {
    appendLog("Skipping Java execution because JAR file is missing.");
    fs.writeFileSync(statusFilePath, "JAVA_EXEC_FAILED");
    process.exit(0);
  }

  const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, '');
  const inputPath = path.join(workDir, fileName);
  const errPath = path.join(workDir, `${safeBaseName}.err`);
  const fvuPath = path.join(workDir, `${safeBaseName}.fvu`);
  const csiPath = (csiFileName && csiFileName !== '0') ? path.join(workDir, csiFileName) : '0';

  console.log("\n--- 1. INPUT FILE & CONTENT VALIDATION ---");
  appendLog(`Target Output Directory: ${workDir}`);

  if (fs.existsSync(inputPath)) {
    const stat = fs.statSync(inputPath);
    appendLog(`[OK] Input Text File Name: ${fileName}`);
    appendLog(`[OK] Input Text File Size: ${stat.size} bytes`);
  } else {
    appendLog(`[ERROR] Input Text File does not exist at ${inputPath}`);
  }

  if (csiFileName && csiPath !== '0') {
    if (fs.existsSync(csiPath)) {
      const stat = fs.statSync(csiPath);
      appendLog(`[OK] Input CSI File Name: ${csiFileName}`);
      appendLog(`[OK] Input CSI File Size: ${stat.size} bytes`);
    } else {
      appendLog(`[ERROR] Input CSI File does not exist at ${csiPath}`);
    }
  } else {
    appendLog(`[INFO] No CSI file provided (using '0').`);
  }

  console.log("\n--- 2. SELECTING BEST MATCHING JAR ENGINE ---");
  const jarDir = path.dirname(jarPath);
  
  // 1TDS_STANDALONE_FVU_1.1.jar সম্পূর্ণ বাদ দেওয়া হয়েছে
  const jarCandidates = [
    path.join(jarDir, 'TDS_STANDALONE_FVU_1.2.jar'),
    path.join(jarDir, 'TDS_TCS_FVU.jar'),
    jarPath
  ];

  let selectedMainJar = jarPath;
  for (const cand of jarCandidates) {
    if (fs.existsSync(cand)) {
      selectedMainJar = cand;
      break;
    }
  }

  appendLog(`[INFO] Selected primary JAR Engine: ${selectedMainJar}`);

  // Classpath তৈরি করা
  let cpString = '';
  try {
    const files = fs.readdirSync(jarDir);
    const otherJars = files
      .filter(f => f.endsWith('.jar') && path.join(jarDir, f) !== selectedMainJar)
      .map(f => path.join(jarDir, f));
    
    cpString = [selectedMainJar, ...otherJars].join(':') + ':.';
  } catch (err) {
    cpString = selectedMainJar;
  }

  appendLog(`[INFO] Computed Classpath: ${cpString}`);

  // Base Arguments: <input> <err> <fvu> <0> <csi> <0>
  const baseArgs = [
    `"${inputPath}"`,
    `"${errPath}"`,
    `"${fvuPath}"`,
    '0',
    csiPath !== '0' ? `"${csiPath}"` : '0',
    '0'
  ];

  console.log("\n--- 3. EXECUTING JAVA ENGINE WITH VERSION FALLBACKS ---");

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    try {
      const output = execSync(cmd, { 
        stdio: 'pipe', 
        timeout: 180000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) {
        appendLog(output.toString('utf8'));
      }
    } catch (err) {
      appendLog(`Execution Output/Note: ${err.message}`);
      if (err.stdout) appendLog(`--- STDOUT ---\n${err.stdout.toString('utf8')}`);
      if (err.stderr) appendLog(`--- STDERR ---\n${err.stderr.toString('utf8')}`);
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    appendLog(`[RESULT_CHECK] .fvu Exists: ${fvuCreated} | .err Exists: ${errCreated}`);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        if (errContent.includes("Incorrect FVU Version of JAR")) {
          appendLog(`[WARN] Returned "Incorrect FVU Version of JAR" - Retrying with version flag...`);
          fs.unlinkSync(errPath); // ট্রাই করার আগে ফাল্টি এরর ফাইল ডিলিট
          return { success: false, isVersionErr: true };
        }
      } catch (e) {}
    }

    if (fvuCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] .fvu File Generated Successfully!`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    } else if (errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] .err File Generated (Valid Validation Error).`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }

    return { success: false };
  };

  // Attempt 1: Protean RPU 1.2 এর জন্য ৭ম আর্গুমেন্ট '1.2' পাস করা
  let res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')} 1.2`);

  // Attempt 2: Protean RPU এর বিকল্প ভার্সন ফ্ল্যাগ '8.9' পাস করা
  if (!res.success) {
    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')} 8.9`);
  }

  // Attempt 3: কোনো ভার্সন ফ্ল্যাগ ছাড়া ডিফল্ট ট্রাই করা
  if (!res.success) {
    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')}`);
  }

  // Attempt 4: Direct -jar মোডে এক্সিকিউট করা
  if (!res.success) {
    res = tryExecute(`java -Dfile.encoding=UTF-8 -jar "${selectedMainJar}" ${baseArgs.join(' ')} 1.2`);
  }

  if (!res.success) {
    appendLog(`\n[STAGE: JAVA_EXECUTION_FAILURE] Could not generate .fvu or valid .err file.`);
    fs.writeFileSync(statusFilePath, "JAVA_EXEC_FAILED");
  }
}

try {
  run();
} catch (e) {
  console.error("Fatal error running execute-java script:", e);
  fs.writeFileSync('status.txt', "JAVA_EXEC_FAILED");
  process.exit(0);
}
