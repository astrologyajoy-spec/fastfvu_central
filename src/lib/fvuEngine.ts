import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface HeaderDetails {
  recordType?: string; // FH
  fileType?: string;   // NS1 / SL1 etc.
  tan?: string;        // e.g. CALB09143B
  rpuSoftware?: string; // e.g. Protean RPU 1.1 / Central Govt RPU / e-TDS RPU
  rpuVersion?: string;  // e.g. 1.1, 7.4, 8.9, 9.0
  formType?: string;   // 140 (Form 24Q), 141 (26Q), 142 (27Q), 143 (27EQ)
  financialYear?: string;
  quarter?: string;
  rawHeaderLine?: string;
  rawBatchLine?: string;
}

export interface JarRouteConfig {
  jarName: string;
  jarPath: string;
  fvuVersionArg: string;
  htmlFlag: string;
  consolidatedFlag: string;
  cliCommandSample: string;
}

export interface FVUResult {
  success: boolean;
  fvuFilePath?: string;
  fvuFileName?: string;
  fvuFileContent?: string;
  errorFilePath?: string;
  errorFileName?: string;
  errorContent?: string;
  errors?: Array<{ line?: number; code: string; message: string }>;
  headerDetails?: HeaderDetails;
  selectedJar?: string;
  fvuVersionUsed?: string;
  stdout?: string;
  stderr?: string;
  processingTimeMs: number;
}

/**
 * Parses Field #10 of Line 1 (File Header - FH) and Field #3 / #5 of Line 2 (Batch Header - BH)
 *
 * Example Line 1:
 * 1^FH^NS1^R^06082026^1^D^CALB09143B^1^Protean RPU 1.1...
 * Index 0: 1 (Line number)
 * Index 1: FH (Record Type)
 * Index 2: NS1 / SL1 (File Type)
 * Index 3: R (Upload Type)
 * Index 4: Date
 * Index 5: Batch Number
 * Index 6: Deductor Category (D/G/etc.)
 * Index 7: TAN (CALB09143B)
 * Index 8: Total Challan Count
 * Index 9: RPU Software & Version ("Protean RPU 1.1" -> 10th caret element)
 *
 * Example Line 2:
 * 2^BH^1^1^140^^^^...^202728^202627^Q1...
 * Index 1: BH
 * Index 4: Form Type Code (140 = 24Q, 141 = 26Q, 142 = 27Q, 143 = 27EQ)
 */
export function parseTdsHeader(fileContent: string): HeaderDetails {
  const lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const details: HeaderDetails = {};

  if (lines.length > 0) {
    const line1 = lines[0];
    details.rawHeaderLine = line1;
    const fhParts = line1.split('^').map(p => p.trim());
    if (fhParts.length >= 2) {
      details.recordType = fhParts[1];
    }
    if (fhParts.length >= 3) {
      details.fileType = fhParts[2];
    }
    if (fhParts.length >= 8) {
      details.tan = fhParts[7];
    }
    if (fhParts.length >= 10) {
      details.rpuSoftware = fhParts[9];
      // Extract version number if embedded (e.g. "Protean RPU 1.1" -> "1.1")
      const verMatch = fhParts[9].match(/\d+(\.\d+)+/);
      if (verMatch) {
        details.rpuVersion = verMatch[0];
      }
    }
  }

  if (lines.length > 1) {
    const line2 = lines[1];
    details.rawBatchLine = line2;
    const bhParts = line2.split('^').map(p => p.trim());
    if (bhParts.length >= 5) {
      // Field #5 (index 4) contains 140/141/142/143 or form code
      details.formType = bhParts[4] || bhParts[3] || bhParts[2];
    }
    // Search for quarter and financial year indicators
    for (const part of bhParts) {
      if (/^Q[1-4]$/i.test(part)) details.quarter = part.toUpperCase();
      if (/^\d{6}$/.test(part)) details.financialYear = part;
    }
  }

  return details;
}

/**
 * Dynamically selects the appropriate NSDL FVU JAR and CLI version parameters
 * based on the parsed Header Details.
 */
export function resolveJarRoute(header: HeaderDetails, availableJars: string[] = []): JarRouteConfig {
  const rpu = (header.rpuSoftware || '').toLowerCase();
  const fileType = (header.fileType || '').toLowerCase();
  
  let targetJar = 'TDS_TCS_FVU.jar';
  let fvuVersionArg = '8.9';
  let htmlFlag = '0';
  let consolidatedFlag = '0';

  if (header.rpuVersion) {
    fvuVersionArg = header.rpuVersion;
  }

  const jarPath = path.resolve(process.cwd(), 'fvu-tool', targetJar);
  
  // CLI Command Generator: java -Dfile.encoding=UTF-8 -jar <JAR> <TXT> <ERR> <FVU> <CONSOLIDATED> <CSI> <HTML> <VERSION>
  const cliCommandSample = `java -Dfile.encoding=UTF-8 -jar "${jarPath}" "<INPUT_TXT_PATH>" "<OUTPUT_ERR_PATH>" "<OUTPUT_FVU_PATH>" ${consolidatedFlag} "<CSI_FILE_PATH_OR_0>" ${htmlFlag} "${fvuVersionArg}"`;

  return {
    jarName: targetJar,
    jarPath,
    fvuVersionArg,
    htmlFlag,
    consolidatedFlag,
    cliCommandSample
  };
}

/**
 * Parses raw NSDL error log content (caret-separated '^' or line-by-line format)
 */
export function parseNsdlErrorLog(rawContent: string): Array<{ line?: number; code: string; message: string }> {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsedErrors: Array<{ line?: number; code: string; message: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('^')) {
      const parts = line.split('^').map(p => p.trim());
      if (parts.length >= 3) {
        const lineNum = parseInt(parts[0], 10);
        parsedErrors.push({
          line: isNaN(lineNum) ? i + 1 : lineNum,
          code: parts[1] || 'ERR_NSDL',
          message: parts.slice(2).join(' - ')
        });
      } else if (parts.length === 2) {
        parsedErrors.push({
          line: i + 1,
          code: parts[0] || 'ERR_NSDL',
          message: parts[1]
        });
      }
    } else if (line.startsWith('T-FVU-') || line.startsWith('ERR_') || line.includes(':')) {
      parsedErrors.push({
        line: i + 1,
        code: line.split(/[:\s]/)[0] || 'ERR_NSDL',
        message: line
      });
    } else if (!line.startsWith('---') && !line.startsWith('===')) {
      parsedErrors.push({
        line: i + 1,
        code: 'ERR_NSDL',
        message: line
      });
    }
  }

  return parsedErrors.length > 0 ? parsedErrors : [{ line: 1, code: 'ERR_NSDL', message: rawContent.substring(0, 300) }];
}

/**
 * Executes NSDL FVU validation with dynamic header inspection and exact NSDL CLI mapping
 */
export async function executeFVU(
  fileContent: string, 
  originalFileName: string,
  csiContent?: string,
  csiFileName?: string
): Promise<FVUResult> {
  const startTime = Date.now();
  const sessionId = crypto.randomBytes(8).toString('hex');
  const tempDir = path.resolve(process.cwd(), 'temp', sessionId);
  
  await fs.mkdir(tempDir, { recursive: true });

  // 1. Inspect and Parse Header Details from TXT File
  const headerDetails = parseTdsHeader(fileContent);

  // Discover available JARs in fvu-tool/
  let availableJars: string[] = [];
  try {
    const binFiles = await fs.readdir(path.resolve(process.cwd(), 'fvu-tool'));
    availableJars = binFiles.filter(f => f.endsWith('.jar'));
  } catch (e) {
    availableJars = ['TDS_TCS_FVU.jar'];
  }

  // 2. Resolve Dynamic JAR Route & CLI Arguments
  const route = resolveJarRoute(headerDetails, availableJars);

  // Sanitize paths
  const safeBaseName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, "");
  const inputFileName = `${safeBaseName}_${sessionId}.txt`;
  const inputFilePath = path.resolve(tempDir, inputFileName);
  const errorFilePath = path.resolve(tempDir, `error_${sessionId}.err`);
  const fvuFilePath = path.resolve(tempDir, `output_${sessionId}.fvu`);

  let csiFilePath = "0";
  if (csiContent && csiContent.trim()) {
    const safeCsiName = csiFileName 
      ? csiFileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[^/.]+$/, "") 
      : 'challan';
    const csiName = `${safeCsiName}_${sessionId}.csi`;
    csiFilePath = path.resolve(tempDir, csiName);
    await fs.writeFile(csiFilePath, csiContent, { encoding: 'utf-8' });
  }

  // Write the input text file with UTF-8 encoding
  await fs.writeFile(inputFilePath, fileContent, { encoding: 'utf-8' });

  // CLI Arguments for NSDL Standalone JAR:
  // <TXT_PATH> <ERR_PATH> <FVU_PATH> <CONSOLIDATED_FLAG> <CSI_PATH_OR_0> <HTML_FLAG> <VERSION>
  const jvmArgs = [
    '-Dfile.encoding=UTF-8',
    '-jar',
    route.jarPath,
    inputFilePath,
    errorFilePath,
    fvuFilePath,
    route.consolidatedFlag,
    csiFilePath,
    route.htmlFlag,
    route.fvuVersionArg
  ];

  let stdoutOutput = '';
  let stderrOutput = '';
  let javaExecError: Error | null = null;

  const fvuToolDir = path.resolve(process.cwd(), 'fvu-tool');

  await new Promise<void>((resolve) => {
    execFile('java', jvmArgs, { cwd: fvuToolDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        javaExecError = err;
        console.warn("NSDL Java process warning/exit:", err.message);
      }
      stdoutOutput = stdout || '';
      stderrOutput = stderr || '';
      resolve();
    });
  });

  // Check if output FVU exists
  let fvuExists = false;
  let fvuFileContent = '';
  try {
    const stat = await fs.stat(fvuFilePath);
    if (stat.size > 0) {
      fvuExists = true;
      fvuFileContent = await fs.readFile(fvuFilePath, 'utf-8');
    }
  } catch {
    fvuExists = false;
  }

  // Read error report
  let errContent = '';
  let errorFileFound = false;

  try {
    errContent = await fs.readFile(errorFilePath, 'utf-8');
    if (errContent.trim().length > 0) {
      errorFileFound = true;
    }
  } catch {
    try {
      const files = await fs.readdir(tempDir);
      for (const f of files) {
        if (f.endsWith('.err') || f.endsWith('.html') || f.includes('error')) {
          const content = await fs.readFile(path.join(tempDir, f), 'utf-8');
          if (content.trim().length > 0) {
            errContent = content;
            errorFileFound = true;
            break;
          }
        }
      }
    } catch {}
  }

  const processingTimeMs = Date.now() - startTime;

  if (!fvuExists) {
    let parsedErrors: Array<{ line?: number; code: string; message: string }> = [];

    if (errorFileFound && errContent.trim()) {
      parsedErrors = parseNsdlErrorLog(errContent);
    } else if (stderrOutput.trim()) {
      parsedErrors = [{ line: 1, code: 'JVM_STDERR', message: stderrOutput.trim() }];
      errContent = `JVM Standard Error:\n${stderrOutput.trim()}`;
    } else if (javaExecError) {
      const isJavaMissing = (javaExecError as any).code === 'ENOENT' || javaExecError.message.includes('not found');
      if (isJavaMissing) {
        const msg = "Java Runtime Environment (JRE) is not available in current container PATH. Ensure Java 8/11/17 is installed to execute NSDL Standalone JAR.";
        parsedErrors = [{ line: 1, code: 'JRE_NOT_FOUND', message: msg }];
        errContent = `NSDL Standalone Engine Error:\n------------------------------------\n${msg}\nCommand: java ${jvmArgs.join(' ')}`;
      } else {
        parsedErrors = [{ line: 1, code: 'JAVA_EXEC_ERR', message: javaExecError.message }];
        errContent = `Java Execution Error:\n${javaExecError.message}\n${stdoutOutput}\n${stderrOutput}`;
      }
    } else {
      parsedErrors = [{ line: 1, code: 'T-FVU-FAIL', message: 'Java FVU Validation Failed: .fvu file was not generated.' }];
      errContent = `NSDL Standalone FVU Engine Report\n----------------------------------------------------\nOriginal File: ${originalFileName}\nRPU Software: ${headerDetails.rpuSoftware || 'Unknown'}\nForm Type: ${headerDetails.formType || 'Unknown'}\nTAN: ${headerDetails.tan || 'Unknown'}\nStatus: VALIDATION FAILED\n\nDetails: Output .fvu file was not generated by Java Engine.`;
    }

    try {
      await fs.writeFile(errorFilePath, errContent, { encoding: 'utf-8' });
    } catch {}

    return {
      success: false,
      errorFilePath,
      errorFileName: path.basename(errorFilePath),
      errorContent: errContent,
      errors: parsedErrors,
      headerDetails,
      selectedJar: route.jarName,
      fvuVersionUsed: route.fvuVersionArg,
      stdout: stdoutOutput,
      stderr: stderrOutput,
      processingTimeMs
    };
  }

  return {
    success: true,
    fvuFilePath,
    fvuFileName: path.basename(fvuFilePath),
    fvuFileContent,
    headerDetails,
    selectedJar: route.jarName,
    fvuVersionUsed: route.fvuVersionArg,
    stdout: stdoutOutput,
    stderr: stderrOutput,
    processingTimeMs
  };
}
