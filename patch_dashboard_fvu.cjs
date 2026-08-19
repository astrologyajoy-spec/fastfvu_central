const fs = require('fs');

let code = fs.readFileSync('src/components/UserDashboard.tsx', 'utf8');

const regex = /const handleRunValidation = async \(e: React\.FormEvent\) => \{[\s\S]*?(?=const themeClasses)/g;

const newHandleRunValidation = `const handleRunValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidating(true);
    
    let fileContent = "Mock Data TDS Statement Q4..."; // fallback
    if (uploadedFile) {
        try {
            fileContent = await uploadedFile.text();
        } catch(e) {
            console.error("Failed to read file", e);
        }
    }

    try {
      const res = await fetch('/api/fvu/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userSession.email,
          fileName: uploadedFile ? uploadedFile.name : 'statement_sample_q4.txt',
          fileContent: fileContent
        })
      });
      const data = await res.json();
      if (!res.ok) {
         console.warn("Validation failed:", data);
         // You could show error modal here if needed
      }
      setValidating(false);
      setUploadedFile(null);
      fetchLogs();
    } catch (err) {
      setValidating(false);
    }
  };

  `;

code = code.replace(regex, newHandleRunValidation);

fs.writeFileSync('src/components/UserDashboard.tsx', code);
console.log("Patched UserDashboard.tsx");
