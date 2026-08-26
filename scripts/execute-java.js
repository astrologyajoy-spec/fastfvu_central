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
  const manifestMain = process.env.MANIFEST_MAIN || 'com.tin.FVU.FVU'; // Fallback

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

  console.log("\n--- 2. JAR PATH & CLASSPATH RESOLUTION ---");
  const jarDir = path.dirname(jarPath);
  
  appendLog(`[INFO] Primary JAR: ${jarPath}`);
  appendLog(`[INFO] Manifest Main-Class detected as: ${manifestMain}`);

  // Build full classpath
  let cpString = '';
  try {
    const files = fs.readdirSync(jarDir);
    const otherJars = files
      .filter(f => f.endsWith('.jar') && path.join(jarDir, f) !== jarPath)
      .map(f => path.join(jarDir, f));
    
    cpString = [jarPath, ...otherJars].join(':') + ':.';
  } catch (err) {
    cpString = jarPath;
  }

  appendLog(`[INFO] Computed Classpath: ${cpString}`);

  // Attempt to compile Desktop GUI Automator if javac is available
  const automatorDir = path.join(process.cwd(), 'scripts');
  const automatorJava = path.join(automatorDir, 'FVUGUIAutomator.java');
  let hasAutomator = false;
  try {
    if (fs.existsSync(automatorJava)) {
      appendLog(`[INFO] Compiling Desktop GUI Automator: ${automatorJava}`);
      execSync(`javac -cp "${cpString}" -d "${automatorDir}" "${automatorJava}"`, { stdio: 'pipe' });
      hasAutomator = true;
      appendLog(`[OK] FVUGUIAutomator compiled successfully to ${automatorDir}.`);
    }
  } catch (err) {
    appendLog(`[NOTE] javac compilation skipped (${err.message}), using standard entry point.`);
  }

  const automatorCp = `${automatorDir}:.:${cpString}`;

  console.log("\n--- 3. EXECUTING JAVA ENGINE ---");

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    try {
      // Clean up previous attempts to avoid false positives
      if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
      if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

      const output = execSync(cmd, { 
        stdio: 'pipe', 
        timeout: 180000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) {
        appendLog(output.toString('utf8'));
      }
    } catch (err) {
      appendLog(`Execution Output/Note: Command executed.`);
      if (err.stdout && err.stdout.length > 0) appendLog(`--- STDOUT ---\n${err.stdout.toString('utf8')}`);
      if (err.stderr && err.stderr.length > 0) appendLog(`--- STDERR ---\n${err.stderr.toString('utf8')}`);
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    appendLog(`[RESULT_CHECK] .fvu Exists: ${fvuCreated} | .err Exists: ${errCreated}`);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        if (errContent.includes("Incorrect FVU Version of JAR") || errContent.includes("Invalid Version")) {
          appendLog(`[WARN] Returned "Incorrect FVU Version of JAR" for this version string. Retrying next version string...`);
          return { success: false, isVersionErr: true };
        } else {
          appendLog(`\n=========================================================`);
          appendLog(`      TDS/TCS DATA VALIDATION ERROR REPORT (.ERR)        `);
          appendLog(`=========================================================`);
          appendLog(errContent);
          appendLog(`=========================================================\n`);
        }
      } catch (e) {}
    }

    if (fvuCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] .fvu File Generated Successfully!`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    } else if (errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] .err File Generated (Valid Validation Error Report).`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }

    return { success: false };
  };

  const className = 'com.tin.FVU.FVU';

  appendLog(`\n[INFO] Executing Desktop-Style GUI Automator Entry Point (Swing EDT + Xvfb)...`);
  let guiCmd = `java -Dfile.encoding=UTF-8 -cp "${automatorCp}" FVUGUIAutomator "${inputPath}" "${errPath}" "${csiPath !== '0' ? csiPath : '0'}"`;
  if (process.platform === 'linux') {
    guiCmd = `xvfb-run -a -e xvfb_error.log ${guiCmd}`;
  }
  const res = tryExecute(guiCmd);

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
