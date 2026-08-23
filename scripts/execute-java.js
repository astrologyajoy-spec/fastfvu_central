import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log("=========================================================");
  console.log("      FastFVU - Enterprise Engine & Java 17 Fix          ");
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

  appendLog(`[INFO] Primary Target JAR: ${mainJarPath}`);
  appendLog(`[INFO] Working Directory: ${jarDir}`);

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

  // Classpath build
  const allJars = fs.readdirSync(jarDir).filter(f => f.endsWith('.jar'));
  const cpString = allJars.join(':') + ':.';

  // Extract Manifest version safely
  let manifestVersion = null;
  try {
    const manifest = execSync(`unzip -p "${mainJarPath}" META-INF/MANIFEST.MF 2>/dev/null || true`).toString('utf8');
    const match = manifest.match(/Implementation-Version:\s*([^\r\n]+)/i) || manifest.match(/Specification-Version:\s*([^\r\n]+)/i);
    if (match && match[1]) {
      manifestVersion = match[1].trim();
      appendLog(`[MANIFEST_CHECK] Internal manifest version: ${manifestVersion}`);
    }
  } catch (e) {}

  const versionsToTry = Array.from(new Set([
    manifestVersion,
    '1.2', '8.9', '8.8', '1.2.0', '1', '0', ''
  ])).filter(Boolean);

  // Java 17 Compatibility Flags for Legacy NSDL JARS
  const javaOptions = [
    '-Dfile.encoding=UTF-8',
    '--add-opens=java.base/java.lang=ALL-UNNAMED',
    '--add-opens=java.base/java.util=ALL-UNNAMED',
    '--add-exports=java.base/sun.misc=ALL-UNNAMED'
  ].join(' ');

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    try {
      if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
      if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

      const output = execSync(cmd, { 
        cwd: jarDir,
        stdio: 'pipe', 
        timeout: 45000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) appendLog(`[STDOUT]\n${output.toString('utf8')}`);
    } catch (err) {
      if (err.stdout && err.stdout.length) appendLog(`[STDOUT]\n${err.stdout.toString('utf8')}`);
      if (err.stderr && err.stderr.length) appendLog(`[STDERR]\n${err.stderr.toString('utf8')}`);
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

    // If .fvu created or .err created with actual validation issues, success!
    if (fvuCreated || errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] Output files generated successfully.`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }
    return { success: false };
  };

  let res = { success: false };

  for (const ver of versionsToTry) {
    const vArg = ver ? ` ${ver}` : '';
    const cmd = `java ${javaOptions} -cp "${cpString}" com.tin.FVU.FVU ${baseArgs.join(' ')}${vArg}`;
    res = tryExecute(cmd);
    if (res.success) break;
  }

  if (!res.success) {
    appendLog(`\n[STAGE: JAVA_EXECUTION_FAILURE] Could not complete FVU validation.`);
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
