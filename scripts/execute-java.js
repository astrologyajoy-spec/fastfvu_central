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
  const manifestMain = process.env.MANIFEST_MAIN;

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

  // Validation: txt file
  if (fs.existsSync(inputPath)) {
    const stat = fs.statSync(inputPath);
    appendLog(`[OK] Input Text File Name: ${fileName}`);
    appendLog(`[OK] Input Text File Size: ${stat.size} bytes`);
    if (stat.size === 0) {
      appendLog(`[ERROR] Input Text File is empty (0 bytes)!`);
    }
  } else {
    appendLog(`[ERROR] Input Text File does not exist at ${inputPath}`);
  }

  // Validation: csi file
  if (csiFileName && csiPath !== '0') {
    if (fs.existsSync(csiPath)) {
      const stat = fs.statSync(csiPath);
      appendLog(`[OK] Input CSI File Name: ${csiFileName}`);
      appendLog(`[OK] Input CSI File Size: ${stat.size} bytes`);
      if (stat.size === 0) {
        appendLog(`[ERROR] Input CSI File is empty (0 bytes)!`);
      }
    } else {
      appendLog(`[ERROR] Input CSI File does not exist at ${csiPath}`);
    }
  } else {
    appendLog(`[INFO] No CSI file provided (using '0').`);
  }

  console.log("\n--- 2. INPUT DATA INTEGRITY CHECKS ---");
  try {
    const contentBuffer = fs.readFileSync(inputPath);
    const headerSnippet = contentBuffer.toString('utf8', 0, Math.min(500, contentBuffer.length));
    
    appendLog(`[INFO] File Encoding Read as UTF-8`);
    
    if (headerSnippet.includes('FH') || headerSnippet.includes('BH') || headerSnippet.includes('^')) {
      appendLog(`[OK] Detected typical NSDL structural markers (FH/BH/Caret).`);
    } else {
      appendLog(`[WARN] The text file does not appear to contain standard NSDL headers like 'FH' or 'BH'.`);
    }
    
    const firstFewLines = headerSnippet.split('\n').slice(0, 3).map(l => l.substring(0, 60)).join('\n');
    appendLog(`[INFO] First few lines snippet:\n${firstFewLines}...\n`);
  } catch (err) {
    appendLog(`[ERROR] Failed to read input file for integrity check: ${err.message}`);
  }

  console.log("\n--- 3. JAR COMMAND & PARALLEL PATH AUDIT ---");
  
  const jarDir = path.dirname(jarPath);
  let cpString = '';
  try {
    const files = fs.readdirSync(jarDir);
    const jars = files.filter(f => f.endsWith('.jar')).map(f => path.join(jarDir, f));
    cpString = jars.join(':') + ':.';
  } catch (err) {
    appendLog(`[WARN] Could not build classpath dynamically: ${err.message}`);
    cpString = jarPath;
  }

  appendLog(`[INFO] Computed Classpath: ${cpString}`);

  // NSDL Standalone CLI Parameter Structure:
  // 1: Input Text Path
  // 2: Error Output Path
  // 3: FVU Output Path
  // 4: Zero / Flag (0)
  // 5: CSI File Path (or '0')
  // 6: Hash Option (0)
  const javaArgs = [
    `"${inputPath}"`,
    `"${errPath}"`,
    `"${fvuPath}"`,
    '0',
    csiPath !== '0' ? `"${csiPath}"` : '0',
    '0'
  ];

  let execCommand = '';
  if (manifestMain) {
    execCommand = `java -Dfile.encoding=UTF-8 -cp "${cpString}" ${manifestMain} ${javaArgs.join(' ')}`;
  } else {
    execCommand = `java -Dfile.encoding=UTF-8 -jar "${jarPath}" ${javaArgs.join(' ')}`;
  }

  appendLog(`\n[EXEC_CMD] ${execCommand}`);

  console.log("\n--- 4. ENHANCED LOGGING & FILE GENERATION VERIFICATION ---");
  
  const executeAndVerify = (cmd) => {
    try {
      const output = execSync(cmd, { 
        stdio: 'pipe', 
        timeout: 180000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      appendLog(output.toString('utf8'));
    } catch (err) {
      appendLog(`Execution Error: ${err.message}`);
      if (err.stdout) appendLog(`\n--- STDOUT ---\n${err.stdout.toString('utf8')}`);
      if (err.stderr) appendLog(`\n--- STDERR ---\n${err.stderr.toString('utf8')}`);
    }

    // Check if files were generated
    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    appendLog(`\n[RESULT_CHECK] .fvu File Exists: ${fvuCreated}`);
    appendLog(`[RESULT_CHECK] .err File Exists: ${errCreated}`);

    if (fvuCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] FVU generated successfully!`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return true;
    } else if (errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] Validation completed with errors (.err generated).`);
      
      // Read and log the .err content for debug
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        appendLog(`\n=== .ERR FILE CONTENT SUMMARY ===\n${errContent.substring(0, 1000)}`);
      } catch (e) {
        appendLog(`Could not read .err file: ${e.message}`);
      }
      
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return true;
    } else {
      appendLog(`[STAGE: JAVA_EXECUTION_FAILURE] Neither .fvu nor .err file was generated by NSDL Engine!`);
      return false;
    }
  };

  // Main Execution Attempt
  let isSuccess = executeAndVerify(execCommand);

  // Fallback Attempt if main failed and manifestMain was present
  if (!isSuccess && manifestMain) {
    appendLog(`\n[INFO] Retrying with -jar as fallback...`);
    const fallbackCommand = `java -Dfile.encoding=UTF-8 -jar "${jarPath}" ${javaArgs.join(' ')}`;
    appendLog(`[EXEC_CMD] ${fallbackCommand}`);
    
    isSuccess = executeAndVerify(fallbackCommand);
  }

  if (!isSuccess) {
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
