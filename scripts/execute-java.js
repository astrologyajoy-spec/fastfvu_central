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
  
  // TDS_TCS_FVU.jar এবং 1TDS_STANDALONE_FVU_1.1.jar বাদ দিয়ে কেবল ১.২ jar নির্বাচন
  const selectedMainJar = path.join(jarDir, 'TDS_STANDALONE_FVU_1.2.jar');

  appendLog(`[INFO] Selected primary JAR Engine: ${selectedMainJar}`);

  // Classpath তৈরি করা
  let cpString = '';
  try {
    const files = fs.readdirSync(jarDir);
    const otherJars = files
      .filter(f => f.endsWith('.jar') && !f.includes('TDS_TCS_FVU.jar') && !f.includes('1TDS_STANDALONE_FVU_1.1.jar') && path.join(jarDir, f) !== selectedMainJar)
      .map(f => path.join(jarDir, f));
    
    cpString = [selectedMainJar, ...otherJars].join(':') + ':.';
  } catch (err) {
    cpString = selectedMainJar;
  }

  appendLog(`[INFO] Computed Classpath: ${cpString}`);

  // Base Arguments format: <inputPath> <errPath> <fvuPath> <0> <csiPath>
  const formattedCsiPath = csiPath !== '0' ? `"${csiPath}"` : '0';

  console.log("\n--- 3. EXECUTING JAVA ENGINE WITH VERSION FALLBACKS ---");

  const tryExecute = (cmd) => {
    appendLog(`\n[EXEC_CMD] ${cmd}`);
    
    // পুরানো টেস্ট ট্রেইল ফাইল থাকলে মুছে ফেলা
    if (fs.existsSync(fvuPath)) fs.unlinkSync(fvuPath);
    if (fs.existsSync(errPath)) fs.unlinkSync(errPath);

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
        // যদি "Incorrect FVU Version of JAR" আসে, তার মানে আর্গুমেন্ট ফরম্যাটে ভুল আছে
        if (errContent.includes("Incorrect FVU Version of JAR")) {
          appendLog(`[WARN] Returned "Incorrect FVU Version of JAR" - Retrying next signature...`);
          fs.unlinkSync(errPath); // ফলস এরর ফাইল মুছে ফেলা হলো
          return { success: false, isVersionErr: true };
        }
      } catch (e) {}
    }

    if (fvuCreated) {
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] .fvu File Generated Successfully!`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    } else if (errCreated) {
      // যদি ফাইলের ডাটাবেজ/ফরম্যাটে সত্যি কোনো এরর থাকে (যেমন Line 1 error)
      appendLog(`[STAGE: JAVA_EXECUTION_SUCCESS] .err File Generated (Valid Validation Error).`);
      fs.writeFileSync(statusFilePath, "JAVA_EXEC_SUCCESS");
      return { success: true };
    }

    return { success: false };
  };

  // Attempt 1: Standalone FVU 1.2 এর জন্য স্ট্যান্ডার্ড আর্গুমেন্ট সাইকেল (6 parameters)
  let res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU "${inputPath}" "${errPath}" "${fvuPath}" 0 ${formattedCsiPath} 0`);

  // Attempt 2: 7টি আর্গুমেন্ট ফরম্যাট (7th arg = "1")
  if (!res.success) {
    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVU "${inputPath}" "${errPath}" "${fvuPath}" 0 ${formattedCsiPath} 0 1`);
  }

  // Attempt 3: RPU Core Main-Class কল করা (com.tin.FVU.FVUMain)
  if (!res.success) {
    res = tryExecute(`java -Dfile.encoding=UTF-8 -cp "${cpString}" com.tin.FVU.FVUMain "${inputPath}" "${errPath}" "${fvuPath}" 0 ${formattedCsiPath} 0`);
  }

  // Attempt 4: Direct JAR Execution
  if (!res.success) {
    res = tryExecute(`java -Dfile.encoding=UTF-8 -jar "${selectedMainJar}" "${inputPath}" "${errPath}" "${fvuPath}" 0 ${formattedCsiPath} 0`);
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
