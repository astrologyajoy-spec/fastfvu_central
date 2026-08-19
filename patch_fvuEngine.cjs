const fs = require('fs');

let code = fs.readFileSync('src/lib/fvuEngine.ts', 'utf8');

const regex = /execFile\('java', \[([\s\S]*?)\]/g;
const newCall = `execFile('java', [
        '-jar', 
        FVU_JAR_PATH,
        inputFile,
        errorFile,
        fvuFile,
        '0', 
        '7.4'
      ]`;

code = code.replace(regex, newCall);

fs.writeFileSync('src/lib/fvuEngine.ts', code);
console.log("Patched fvuEngine.ts");
