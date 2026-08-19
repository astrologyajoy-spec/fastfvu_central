const fs = require('fs');
let code = fs.readFileSync('src/lib/fvuEngine.ts', 'utf8');

code = code.replace(/execFile\('java'[\s\S]*?\}\);/m, 
`const command = \`java -cp "./bin/*" -jar "\${FVU_JAR_PATH}" "\${inputFile}" "\${errorFile}" "\${fvuFile}" "0" "7.4"\`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.warn("FVU Engine Warn:", error.message);
          resolve();
        } else {
          resolve();
        }
      });`);

fs.writeFileSync('src/lib/fvuEngine.ts', code);
console.log('patched');
