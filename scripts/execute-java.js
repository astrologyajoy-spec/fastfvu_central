import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log("=========================================================");
  console.log("      FastFVU - High-Speed Execution Engine              ");
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

  const mainJarPath = path.join(jarDir, 'TDS_STANDALONE_FVU_1.2.jar');
  if (!fs.existsSync(mainJarPath)) {
    appendLog(`[ERROR] Primary JAR not found at ${mainJarPath}`);
    fs.writeFileSync(statusFilePath, "JAVA_EXEC_FAILED");
    process.exit(0);
  }

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

  // Fast Classpath Assembly
  const allJars = fs.readdirSync(jarDir).filter(f => f.endsWith('.jar'));
  const cpString = allJars.join(':') + ':.';

  // Only test essential version flags for top speed
  const versionsToTry = ['1.2', '8.9', '1', ''];

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    try {
      if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
      if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

      // Timeout reduced to 30 seconds per attempt for quick execution
      const output = execSync(cmd, { 
        cwd: jarDir,
        stdio: 'pipe', 
        timeout: 30000, 
        maxBuffer: 1024 * 1024 * 5 
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
        
        // If it's a version mismatch, fail fast and try next
        if (errContent.includes("Incorrect FVU Version of JAR")) {
          return { success: false };
        }
      } catch (e) {}
    }

    if (fvuCreated || errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] Generated result quickly!`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }
    return { success: false };
  };

  let res = { success: false };

  // Fast execution loop
  for (const ver of versionsToTry) {
    const vArg = ver ? ` "${ver}"` : '';
    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')}${vArg}`);
    if (res.success) break;
  }

  if (!res.success) {
    appendLog(`\n[STAGE: JAVA_EXECUTION_FAILURE] Could not complete validation.`);
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
