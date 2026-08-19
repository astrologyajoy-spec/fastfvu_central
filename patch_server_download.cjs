const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const newRoute = `
// Download FVU or Error file
app.get("/api/v1/fvu/download/:filename", (req, res) => {
  const filename = req.params.filename;
  // Format: output_SESSIONID.fvu or error_SESSIONID.err
  const parts = filename.split('_');
  if (parts.length < 2) {
    return res.status(400).send("Invalid filename format");
  }
  const sessionId = parts[1].split('.')[0];
  const filePath = path.join(process.cwd(), 'temp', sessionId, filename);
  
  res.download(filePath, filename, {
    headers: {
      'Content-Type': 'application/octet-stream'
    }
  }, (err) => {
    if (err) {
      console.error("Download error:", err);
      if (!res.headersSent) {
        res.status(404).send("File not found");
      }
    }
  });
});

`;

// Insert before startServer()
code = code.replace(/async function startServer\(\) \{/, newRoute + '\nasync function startServer() {');

fs.writeFileSync('server.ts', code);
console.log('Download route added');
