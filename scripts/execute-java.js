import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log("=========================================================");
  console.log("      FastFVU - Dynamic Header Version Engine            ");
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

  const fvuLogsDir = path.join(jarDir, 'logs');
  fs.mkdirSync(fvuLogsDir, { recursive: true });

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

  // -------------------------------------------------------------
  // Dynamic Version Extraction Logic from Input File (1st Line)
  // -------------------------------------------------------------
  let extractedVer = null;
  try {
    if (fs.existsSync(inputPath)) {
      const fileContent = fs.readFileSync(inputPath, 'utf8');
      const firstLine = fileContent.split('\n')[0];
      const parts = firstLine.split('^');
      
      // Index 8 is the RPU/FVU Version position (e.g., "Protean RPU 1.2")
      if (parts.length > 8 && parts[8] && parts[8].trim() !== '') {
        extractedVer = parts[8].trim();
        appendLog(`[INFO] Successfully extracted FVU version from Input File: ${extractedVer}`);
      }
    }
  } catch (err) {
    appendLog(`[WARN] Failed to read header line from input file: ${err.message}`);
  }

  // Fallback versions if extraction fails
  const versionsToTry = [];
  if (extractedVer) versionsToTry.push(extractedVer);
  versionsToTry.push('Protean RPU 1.2', '1.2', '8.9');

  // Filter unique values
  const uniqueVersions = [...new Set(versionsToTry)];

  const baseArgs = [
    `"${inputPath}"`,
    `"${errPath}"`,
    `"${fvuPath}"`,
    '0',
    csiPath !== '0' ? `"${csiPath}"` : '0',
    '0'
  ];

  const allJars = fs.readdirSync(jarDir).filter(f => f.endsWith('.jar'));
  const cpString = allJars.map(j => path.join(jarDir, j)).join(':') + ':' + jarDir;

  const javaOptions = [
    '-Dfile.encoding=UTF-8',
    '-Djava.awt.headless=true',
    '-Djsse.enableSNIExtension=false',
    '--add-modules=jdk.unsupported',
    '--add-exports=jdk.unsupported/sun.misc=ALL-UNNAMED',
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '--add-opens=java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    '--add-opens=java.base/java.text=ALL-UNNAMED',
    '--add-opens=java.base/java.io=ALL-UNNAMED'
  ].join(' ');

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    
    if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
    if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);
    const tdsLogFile = path.join(fvuLogsDir, 'TDS_LOG.txt');
    if (fs.existsSync(tdsLogFile)) fs.unlinkSync(tdsLogFile);

    try {
      const output = execSync(cmd, { 
        cwd: jarDir,
        stdio: 'pipe', 
        timeout: 60000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) appendLog(`[STDOUT]\n${output.toString('utf8')}`);
    } catch (err) {
      if (err.stdout && err.stdout.length) appendLog(`[STDOUT]\n${err.stdout.toString('utf8')}`);
      if (err.stderr && err.stderr.length) appendLog(`[STDERR]\n${err.stderr.toString('utf8')}`);
    }

    if (fs.existsSync(tdsLogFile)) {
      try {
        const internalLog = fs.readFileSync(tdsLogFile, 'utf8');
        appendLog(`[INTERNAL_TDS_LOG]\n${internalLog.trim()}`);
      } catch (e) {}
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        appendLog(`[ERR_CONTENT]\n${errContent.trim()}`);
        if (errContent.includes("Incorrect FVU Version of JAR")) {
          return { success: false };
        }
      } catch (e) {}
    }

    if (fvuCreated || errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] Output generated.`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }
    return { success: false };
  };

  let res = { success: false };

  for (const ver of uniqueVersions) {
    const vArg = ` "${ver}"`;
    const cmd = `java ${javaOptions} -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')}${vArg}`;
    res = tryExecute(cmd);
    if (res.success) break;
  }

  if (!res.success) {
    appendLog(`\n[STAGE: JAVA_EXECUTION_FAILURE] Check internal logs above.`);
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
