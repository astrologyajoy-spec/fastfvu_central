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
    let finalCmd = cmd;
    if (process.platform === 'linux') {
      finalCmd = `xvfb-run -a -e xvfb_error.log ${cmd}`;
    }
    
    appendLog(`\n[EXEC_CMD] ${finalCmd}`);
    try {
      // Clean up previous attempts to avoid false positives
      if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
      if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

      const output = execSync(finalCmd, { 
        stdio: 'pipe', 
        timeout: 180000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) {
        appendLog(output.toString('utf8'));
      }
    } catch (err) {
      appendLog(`Execution Output/Note: Command failed.`);
      if (err.stdout && err.stdout.length > 0) appendLog(`--- STDOUT ---\n${err.stdout.toString('utf8')}`);
      if (err.stderr && err.stderr.length > 0) appendLog(`--- STDERR ---\n${err.stderr.toString('utf8')}`);
    }

    if (fs.existsSync('xvfb_error.log')) {
      try {
        const xvfbErr = fs.readFileSync('xvfb_error.log', 'utf8');
        if (xvfbErr.trim()) {
          appendLog(`\n--- XVFB ERROR LOG ---\n${xvfbErr}`);
        }
      } catch(e) {}
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    appendLog(`[RESULT_CHECK] .fvu Exists: ${fvuCreated} | .err Exists: ${errCreated}`);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        if (errContent.includes("Incorrect FVU Version of JAR") || errContent.includes("Invalid Version")) {
          appendLog(`[WARN] Returned "Incorrect FVU Version of JAR" - Retrying with next version string...`);
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

  const className = 'com.tin.FVU.FVU';

  // Extract RPU version from input file if available (e.g., from line 1 caret field 10)
  let detectedVersion = '8.5';
  try {
    if (fs.existsSync(inputPath)) {
      const firstChunk = fs.readFileSync(inputPath, 'utf8').substring(0, 1000);
      const lines = firstChunk.split(/\r?\n/);
      if (lines.length > 0) {
        const parts = lines[0].split('^');
        if (parts.length >= 10 && parts[9]) {
          const verMatch = parts[9].match(/\d+(\.\d+)+/);
          if (verMatch) {
            detectedVersion = verMatch[0];
          }
        }
      }
    }
  } catch (e) {}

  // Desktop FVU expectations prefer 8.5 as primary default
  const versionsToTry = Array.from(new Set([detectedVersion, '8.5', '1.2']));
  let res = { success: false };

  appendLog(`\n[INFO] Executing Desktop-Style GUI Automator Entry Point...`);
  for (const ver of versionsToTry) {
    appendLog(`[INFO] Attempting execution with FVU Version argument: "${ver}"`);
    
    if (hasAutomator) {
      appendLog(`[INFO] Running Desktop GUI Window Automator (Swing Thread)...`);
      res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${automatorCp}" FVUGUIAutomator "${inputPath}" "${errPath}" "${csiPath !== '0' ? csiPath : '0'}" "${ver}"`);
      if (res.success) break;
    }

    // Direct com.tin.FVU.FVU fallback
    const args = [
      `"${inputPath}"`,
      `"${errPath}"`,
      `"${fvuPath}"`,
      '0',                                      // Parameter 4: Zero / Hash Flag
      csiPath !== '0' ? `"${csiPath}"` : '0',  // Parameter 5: CSI File Path
      '0',                                      // Parameter 6: Consolidated/Upload Flag
      `"${ver}"`                                // Parameter 7: Version String (e.g. "8.5")
    ];

    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" ${className} ${args.join(' ')}`);
    if (res.success) break;
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
