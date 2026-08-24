import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function run() {
  console.log("=========================================================");
  console.log("      FastFVU - Fixed Standalone Execution Engine        ");
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
  const rawInputPath = path.resolve(workDir, fileName);
  const errPath = path.resolve(workDir, `${safeBaseName}.err`);
  const fvuPath = path.resolve(workDir, `${safeBaseName}.fvu`);

  // Resolve CSI Path accurately & set correct flag (1 if exists, 0 if not)
  let csiPath = '0';
  let hasCsiFlag = '0';
  if (csiFileName && csiFileName !== '0') {
    const candidateCsi = path.resolve(workDir, csiFileName);
    if (fs.existsSync(candidateCsi)) {
      csiPath = candidateCsi;
      hasCsiFlag = '1';
    } else {
      appendLog(`[WARN] Specified CSI file not found on disk: ${candidateCsi}`);
    }
  }

  // File Preparation & Dynamic Temporary Patching if Header Needs Alignment
  let inputPath = rawInputPath;
  let extractedVer = null;

  try {
    if (fs.existsSync(rawInputPath)) {
      let fileContent = fs.readFileSync(rawInputPath, 'utf8');
      const lines = fileContent.split(/\r?\n/);
      const firstLine = lines[0];
      const parts = firstLine.split('^');

      if (parts.length > 9 && parts[9] && parts[9].trim() !== '') {
        extractedVer = parts[9].trim();
      }

      if (!extractedVer) {
        for (const part of parts) {
          const trimmed = part.trim();
          if (trimmed.includes('RPU') || trimmed.includes('FVU')) {
            extractedVer = trimmed;
            break;
          }
        }
      }

      appendLog(`[INFO] Original RPU Header Version: "${extractedVer}"`);

      // If the header contains version incompatible with standalone jar execution, 
      // create a normalized temporary working file without modifying original file.
      if (extractedVer && (extractedVer.includes('Protean RPU 1.2') || extractedVer === '1.2')) {
        parts[9] = '8.5';
        lines[0] = parts.join('^');
        
        const patchedFileName = `tmp_${safeBaseName}.txt`;
        const patchedInputPath = path.resolve(workDir, patchedFileName);
        fs.writeFileSync(patchedInputPath, lines.join('\n'));
        
        inputPath = patchedInputPath;
        extractedVer = '8.5';
        appendLog(`[INFO] Created localized runtime input buffer with updated header version: "${extractedVer}"`);
      }
    }
  } catch (err) {
    appendLog(`[WARN] Header analysis failed: ${err.message}`);
  }

  // Version Arguments Sequence To Try
  const versionsToTry = [];
  if (extractedVer) versionsToTry.push(extractedVer);
  versionsToTry.push('8.5', 'Protean RPU 8.5', '8.6', 'Protean RPU 1.2', '1.2');

  const uniqueVersions = [...new Set(versionsToTry)];

  // Exclude VersionValidator.jar
  const jarFiles = fs.readdirSync(jarDir).filter(f => 
    f.endsWith('.jar') && 
    f !== 'TDS_STANDALONE_FVU_1.2.jar' && 
    !f.toLowerCase().includes('versionvalidator')
  );
  
  const cpArray = [mainJarPath, ...jarFiles.map(j => path.join(jarDir, j)), jarDir];
  const cpString = cpArray.join(':');

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

  const tryExecute = (versionStr) => {
    const cleanVer = versionStr.replace(/"/g, '');
    
    const cmdArgs = [
      `"${inputPath}"`,
      `"${errPath}"`,
      `"${fvuPath}"`,
      hasCsiFlag,
      csiPath === '0' ? '0' : `"${csiPath}"`,
      '0',
      `"${cleanVer}"`
    ];

    const cmd = `java ${javaOptions} -cp "${cpString}" com.tin.FVU.FVU ${cmdArgs.join(' ')}`;
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    
    if (fs.existsSync(errPath)) fs.unlinkSync(errPath);
    if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);

    try {
      const output = execSync(cmd, { 
        cwd: process.cwd(),
        stdio: 'pipe', 
        timeout: 90000, 
        maxBuffer: 1024 * 1024 * 10 
      });
      if (output && output.length > 0) appendLog(`[STDOUT]\n${output.toString('utf8')}`);
    } catch (err) {
      if (err.stdout && err.stdout.length) appendLog(`[STDOUT]\n${err.stdout.toString('utf8')}`);
      if (err.stderr && err.stderr.length) appendLog(`[STDERR]\n${err.stderr.toString('utf8')}`);
    }

    const possibleLogPaths = [
      path.resolve(process.cwd(), 'TDS_LOG.txt'),
      path.resolve(jarDir, 'TDS_LOG.txt'),
      path.resolve(jarDir, 'logs', 'TDS_LOG.txt')
    ];

    for (const logP of possibleLogPaths) {
      if (fs.existsSync(logP)) {
        try {
          const lContent = fs.readFileSync(logP, 'utf8');
          appendLog(`[INTERNAL_LOG: ${path.basename(logP)}]\n${lContent.trim()}`);
        } catch (e) {}
      }
    }

    const fvuCreated = fs.existsSync(fvuPath);
    const errCreated = fs.existsSync(errPath);

    if (errCreated) {
      try {
        const errContent = fs.readFileSync(errPath, 'utf8');
        appendLog(`[ERR_FILE_CONTENT]\n${errContent.trim()}`);
        if (errContent.includes("Incorrect FVU Version of JAR")) {
          return { success: false };
        }
      } catch (e) {}
    }

    if (fvuCreated || errCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] Process output generated (FVU: ${fvuCreated}, ERR: ${errCreated}).`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }

    return { success: false };
  };

  let res = { success: false };

  for (const ver of uniqueVersions) {
    res = tryExecute(ver);
    if (res.success) break;
  }

  // Cleanup temporary working file if generated
  if (inputPath !== rawInputPath && fs.existsSync(inputPath)) {
    try {
      fs.unlinkSync(inputPath);
    } catch (e) {}
  }

  if (!res.success) {
    appendLog(`\n[STAGE: JAVA_EXECUTION_FAILURE] Execution complete without output files.`);
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
