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
  
  const logFilePath = 'java_run.log';
  const statusFilePath = 'status.txt';

  const appendLog = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFilePath, msg + '\n');
  };

  fs.writeFileSync(logFilePath, ''); // Clear existing log

  // --- SMART JAR DETECTION (Bypassing YAML Errors) ---
  let jarDir = path.join(process.cwd(), 'fvu-tool');
  if (!fs.existsSync(jarDir)) {
      jarDir = path.join(process.cwd(), 'bin');
  }

  let selectedMainJar = null;
  if (fs.existsSync(jarDir)) {
     const files = fs.readdirSync(jarDir);
     const fvuJars = files.filter(f => f.includes('FVU') && f.endsWith('.jar'));
     
     // Strictly target the 1.2 standalone version first
     const exactMatch = fvuJars.find(f => f === 'TDS_STANDALONE_FVU_1.2.jar');
     if (exactMatch) {
         selectedMainJar = path.join(jarDir, exactMatch);
     } else if (fvuJars.length > 0) {
         selectedMainJar = path.join(jarDir, fvuJars[0]);
     }
  }

  if (!selectedMainJar) {
     selectedMainJar = process.env.JAR_PATH; // Fallback only if detection fails
  }

  if (!selectedMainJar || !selectedMainJar.includes('FVU')) {
    appendLog("[ERROR] Failed to detect a valid FVU JAR file. Aborting execution.");
    fs.writeFileSync(statusFilePath, "JAVA_EXEC_FAILED");
    process.exit(0);
  }

  const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, '');
  const inputPath = path.join(workDir, fileName);
  const errPath = path.join(workDir, `${safeBaseName}.err`);
  const fvuPath = path.join(workDir, `${safeBaseName}.fvu`);
  const csiPath = (csiFileName && csiFileName !== '0') ? path.join(workDir, csiFileName) : '0';

  console.log("\n--- 1. INPUT FILE VALIDATION ---");
  appendLog(`Target Output Directory: ${workDir}`);

  if (fs.existsSync(inputPath)) {
    appendLog(`[OK] Input Text File Name: ${fileName}`);
  } else {
    appendLog(`[ERROR] Input Text File does not exist at ${inputPath}`);
  }

  console.log("\n--- 2. JAR ENGINE PREPARATION ---");
  appendLog(`[INFO] Auto-Detected Primary JAR: ${selectedMainJar}`);

  const baseArgs = [
    `"${inputPath}"`,
    `"${errPath}"`,
    `"${fvuPath}"`,
    '0',
    csiPath !== '0' ? `"${csiPath}"` : '0',
    '0'
  ];

  console.log("\n--- 3. EXECUTING JAVA ENGINE ---");

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    try {
      if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
      if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

      const output = execSync(cmd, { stdio: 'pipe', timeout: 180000, maxBuffer: 1024 * 1024 * 10 });
      if (output && output.length > 0) appendLog(output.toString('utf8'));
    } catch (err) {
      appendLog(`Execution Note: Process returned with warnings/errors.`);
      if (err.stdout) appendLog(`--- STDOUT ---\n${err.stdout.toString('utf8')}`);
      if (err.stderr) appendLog(`--- STDERR ---\n${err.stderr.toString('utf8')}`);
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    appendLog(`[RESULT_CHECK] .fvu Exists: ${fvuCreated} | .err Exists: ${errCreated}`);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        if (errContent.includes("Incorrect FVU Version of JAR") || errContent.includes("Invalid Version")) {
          appendLog(`[WARN] Returned "Incorrect FVU Version of JAR".`);
          return { success: false, isVersionErr: true };
        }
      } catch (e) {}
    }

    if (fvuCreated) {
      appendLog(`[STAGE: SUCCESS] .fvu File Generated Successfully!`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    } else if (errCreated) {
      appendLog(`[STAGE: SUCCESS] .err File Generated (Valid Validation Error).`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }
    return { success: false };
  };

  const versionsToTry = ['1.2', '', '8.9', '1'];
  let res = { success: false };

  appendLog(`\n[INFO] Phase 1: Pure -jar Execution (Safe Mode)...`);
  for (const ver of versionsToTry) {
    const vArg = ver ? ` ${ver}` : '';
    res = tryExecute(`java -Dfile.encoding=UTF-8 -jar "${selectedMainJar}" ${baseArgs.join(' ')}${vArg}`);
    if (res.success) break;
  }

  if (!res.success) {
    appendLog(`\n[INFO] Phase 2: Classpath Execution...`);
    let cpString = selectedMainJar;
    try {
      const files = fs.readdirSync(path.dirname(selectedMainJar));
      const safeJars = files
        .filter(f => f.endsWith('.jar') && path.join(path.dirname(selectedMainJar), f) !== selectedMainJar && !f.includes('log4j'))
        .map(f => path.join(path.dirname(selectedMainJar), f));
      cpString = [selectedMainJar, ...safeJars].join(':') + ':.';
    } catch (e) {}

    const mainClass = 'com.tin.FVU.FVU';
    for (const ver of versionsToTry) {
      const vArg = ver ? ` ${ver}` : '';
      res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" ${mainClass} ${baseArgs.join(' ')}${vArg}`);
      if (res.success) break;
    }
  }

  if (!res.success) {
    appendLog(`\n[STAGE: FAILURE] Could not generate .fvu or valid .err file.`);
    fs.writeFileSync(statusFilePath, "JAVA_EXEC_FAILED");
  }
}

try {
  run();
} catch (e) {
  console.error("Fatal error:", e);
  fs.writeFileSync('status.txt', "JAVA_EXEC_FAILED");
  process.exit(0);
}
