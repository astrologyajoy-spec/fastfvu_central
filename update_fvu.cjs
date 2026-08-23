const fs = require('fs');

let fvu = fs.readFileSync('src/lib/fvuEngine.ts', 'utf-8');
fvu = fvu.replace("import { execFile } from 'child_process';", "import { exec } from 'child_process';");
// TDS_STANDALONE_FVU_1.2.jar দিয়ে আপডেট করা হয়েছে
fvu = fvu.replace(/const FVU_JAR_PATH = [^\n]+;/, "const FVU_JAR_PATH = path.join(process.cwd(), 'fvu-tool', 'TDS_STANDALONE_FVU_1.2.jar');");

// Execution block
const oldExec = `    await new Promise<void>((resolve, reject) => {
      execFile('java', [
        '-jar', 
        FVU_JAR_PATH,
        inputFile,
        errorFile,
        fvuFile,
        '0', 
        '7.4'
      ], (error, stdout, stderr) => {
        if (error) {
          console.warn("FVU Engine Warn:", error.message);
          if (error.message.includes('not found') || error.code === 'ENOENT') { 
            resolve();
          } else { 
            resolve(); 
          }
        } else {
          resolve();
        }
      });
    });`;

const newExec = `    await new Promise<void>((resolve, reject) => {
      const command = \`java -cp "./fvu-tool/*" -jar "\${FVU_JAR_PATH}" "\${inputFile}" "\${errorFile}" "\${fvuFile}" "0" "1.2"\`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.warn("FVU Engine Warn:", error.message);
          resolve();
        } else {
          resolve();
        }
      });
    });`;

fvu = fvu.replace(oldExec, newExec);
fs.writeFileSync('src/lib/fvuEngine.ts', fvu);
console.log("Updated fvuEngine.ts with TDS_STANDALONE_FVU_1.2.jar");
