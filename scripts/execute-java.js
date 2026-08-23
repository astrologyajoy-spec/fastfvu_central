import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log("=========================================================");
  console.log("         FastFVU - Deep Engine Diagnostic & Fix         ");
  console.log("=========================================================");

  const workDir = path.resolve(process.cwd(), 'tmp_job');
  const fileName = process.env.FILE_NAME || 'statement.txt';
  const csiFileName = process.env.CSI_FILE_NAME || null;

  const logFilePath = path.resolve(process.cwd(), 'java_run.log');
  const statusFilePath = path.resolve(process.cwd(), 'status.txt');

  const appendLog = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFilePath, msg + '\n');
  };

  fs.writeFileSync(logFilePath, '');

  let jarDir = path.resolve(process.cwd(), 'fvu-tool');
  if (!fs.existsSync(jarDir)) {
    jarDir = path.resolve(process.cwd(), 'bin');
  }

  let selectedMainJar = null;
  if (fs.existsSync(jarDir)) {
    const files = fs.readdirSync(jarDir);
    const target = files.find(f => f === 'TDS_STANDALONE_FVU_1.2.jar') || files.find(f => f.includes('FVU') && f.endsWith('.jar'));
    if (target) selectedMainJar = path.join(jarDir, target);
  }

  if (!selectedMainJar || !fs.existsSync(selectedMainJar)) {
    appendLog("[ERROR] Target JAR file not found. Aborting.");
    fs.writeFileSync(statusFilePath, "JAVA_EXEC_FAILED");
    process.exit(0);
  }

  appendLog(`[INFO] Primary Target JAR: ${selectedMainJar}`);
  appendLog(`[INFO] Working Directory (cwd): ${jarDir}`);

  const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, '');
  const inputPath = path.resolve(workDir, fileName);
  const errPath = path.resolve(workDir, `${safeBaseName}.err`);
  const fvuPath = path.resolve(workDir, `${safeBaseName}.fvu`);
  const csiPath = (csiFileName && csiFileName !== '0') ? path.resolve(workDir, csiFileName) : '0';

  const baseArgs = [
    `"${inputPath}"`,
    `"${errPath}"`,
    `"${fvuPath}"`,
    '0',
    csiPath !== '0' ? `"${csiPath}"` : '0',
    '0'
  ];

  // Dynamically inspect internal JAR properties to find exact hardcoded version strings
  let extractedVersions = [];
  try {
    const inspectOutput = execSync(`unzip -p "${selectedMainJar}" "*.properties" 2>/dev/null || true`).toString('utf8');
    appendLog(`[JAR_INSPECT] Properties snippet:\n${inspectOutput.slice(0, 300)}`);
    const matches = inspectOutput.match(/([0-9]+\.[0-9]+(\.[0-9]+)?)/g);
    if (matches) {
      extractedVersions = Array.from(new Set(matches));
      appendLog(`[JAR_INSPECT] Found version candidates inside JAR: ${extractedVersions.join(', ')}`);
    }
  } catch (e) {}

  const allJarsInDir = fs.readdirSync(jarDir).filter(f => f.endsWith('.jar') && !f.includes('log4j'));
  const cpString = allJarsInDir.join(':') + ':.';

  const versionsToTry = Array.from(new Set([
    ...extractedVersions,
    '1.2', '8.9', '8.8', '8.7', '8.6', '8.5', '8.4', '8.3', '8.2', '8.1', '8.0',
    '7.4', '7.3', '7.2', '7.1', '1', '0', ''
  ]));

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    try {
      if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
      if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

      const output = execSync(cmd, { 
        cwd: jarDir, // Execute directly inside fvu-tool directory
        stdio: 'pipe', 
        timeout: 180000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) appendLog(output.toString('utf8'));
    } catch (err) {
      if (err.stdout) appendLog(`--- STDOUT ---\n${err.stdout.toString('utf8')}`);
      if (err.stderr) appendLog(`--- STDERR ---\n${err.stderr.toString('utf8')}`);
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        appendLog(`[ERR_CONTENT] ${errContent.trim()}`);
        if (errContent.includes("Incorrect FVU Version of JAR")) {
          return { success: false };
        }
      } catch (e) {}
    }

    if (fvuCreated || errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] Valid validation output generated.`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }
    return { success: false };
  };

  let res = { success: false };

  // Attempt Execution via Classpath inside jarDir
  for (const ver of versionsToTry) {
    const vArg = ver ? ` ${ver}` : '';
    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')}${vArg}`);
    if (res.success) break;
  }

  if (!res.success) {
    appendLog(`\n[STAGE: JAVA_EXECUTION_FAILURE] Execution failed across all version parameters.`);
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
