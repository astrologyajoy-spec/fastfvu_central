import React, { useState } from 'react';
import { Play, Copy, Check, Terminal, FileCode, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export function ApiPlayground() {
  const [activeTab, setActiveTab] = useState<'playground' | 'curl' | 'node' | 'python' | 'php' | 'js'>('playground');
  
  const [statementText, setStatementText] = useState(
    JSON.stringify({
      pan: "ABCDE1234F",
      quarter: "Q4",
      finYear: "2025-26",
      statementData: "TAN: ABCD12345E\nQUARTER: Q4\nFIN_YEAR: 2025-26\nDEDUCTEE_COUNT: 14\nTOTAL_AMOUNT: 450000.00\nHASH_CHECKSUM: SHA-256-VALID"
    }, null, 2)
  );
  
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleRunValidation = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      let payload;
      try {
        payload = JSON.parse(statementText);
      } catch (e) {
        // If not JSON, send it as raw text
        payload = { statementData: statementText };
      }

      const res = await fetch('/api/v1/fvu/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': 'ffv_test_9982x'
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ status: "ERROR", message: "Failed to reach API endpoint." });
    } finally {
      setIsRunning(false);
    }
  };

  const curlSnippet = `curl -X POST "https://api.fastfvu.central/api/v1/fvu/generate" \\
  -H "x-api-key: ffv_live_9982x" \\
  -H "Content-Type: application/json" \\
  -d '{"statementData": "TAN: ABCD12345E\\n..."}'`;

  const nodeSnippet = `const axios = require('axios');

async function generateFVU() {
  const response = await axios.post('https://api.fastfvu.central/api/v1/fvu/generate', {
    statementData: 'TAN: ABCD12345E\n...'
  }, {
    headers: { 'x-api-key': 'ffv_live_9982x' }
  });
  console.log("FVU File Status:", response.data.status);
}

generateFVU();`;

  const pythonSnippet = `import requests

url = "https://api.fastfvu.central/api/v1/fvu/generate"
headers = {
    "x-api-key": "ffv_live_9982x",
    "Content-Type": "application/json"
}
data = {
    "statementData": "TAN: ABCD12345E\n..."
}

response = requests.post(url, headers=headers, json=data)
print(response.json())`;

  const phpSnippet = `<?php
$ch = curl_init('https://api.fastfvu.central/api/v1/fvu/generate');

$data = json_encode(['statementData' => "TAN: ABCD12345E\n..."]);

curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'x-api-key: ffv_live_9982x'
]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>`;

  const jsSnippet = `// Browser JS (fetch)
fetch('https://api.fastfvu.central/api/v1/fvu/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'ffv_live_9982x'
  },
  body: JSON.stringify({
    statementData: 'TAN: ABCD12345E\n...'
  })
})
.then(res => res.json())
.then(data => console.log(data))
.catch(err => console.error(err));`;

  const getSnippet = () => {
    switch (activeTab) {
      case 'curl': return curlSnippet;
      case 'node': return nodeSnippet;
      case 'python': return pythonSnippet;
      case 'php': return phpSnippet;
      case 'js': return jsSnippet;
      default: return '';
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(getSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="playground" className="py-24 bg-slate-900 text-slate-100 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-400">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span>Interactive Developer Sandbox</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Developer API & Playground
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Integrate the Java FVU Engine into your own application in seconds. Test the API directly in the browser or copy code snippets.
          </p>
        </div>

        {/* Sandbox Container */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-w-5xl mx-auto">
          
          {/* Tab Bar */}
          <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-wrap gap-2">
              <button
                onClick={() => setActiveTab('playground')}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                  activeTab === 'playground'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>Live Test API</span>
              </button>
              <div className="w-px h-6 bg-slate-700 mx-2 self-center"></div>
              {['curl', 'node', 'python', 'php', 'js'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {tab === 'curl' ? 'cURL' : tab === 'node' ? 'Node.js' : tab === 'python' ? 'Python' : tab === 'php' ? 'PHP' : 'JS'}
                </button>
              ))}
            </div>

            {activeTab !== 'playground' && (
              <button
                onClick={handleCopyCode}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'playground' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Left: Input Payload */}
                <div className="space-y-3 flex flex-col">
                  <div className="flex justify-between items-center">
                     <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">
                       Request Payload (JSON)
                     </label>
                     <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">POST /api/v1/fvu/generate</span>
                  </div>
                  <textarea
                    value={statementText}
                    onChange={(e) => setStatementText(e.target.value)}
                    rows={12}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500 flex-1"
                  />
                  <button
                    onClick={handleRunValidation}
                    disabled={isRunning}
                    className="w-full inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium py-3 rounded-xl shadow-lg transition-all text-sm cursor-pointer disabled:opacity-50"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Send API Request</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Right: Output Response */}
                <div className="space-y-3 flex flex-col">
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-wider">
                    API Response (JSON)
                  </label>
                  <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-y-auto min-h-[220px]">
                    {isRunning ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                        <span>Executing request...</span>
                      </div>
                    ) : result ? (
                      <pre className="text-[11px] whitespace-pre-wrap font-mono text-indigo-200">
                        {JSON.stringify(result, null, 2)}
                      </pre>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                        Click "Send API Request" to see the output.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {activeTab !== 'playground' && (
              <pre className="p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-blue-300 overflow-x-auto">
                {getSnippet()}
              </pre>
            )}

          </div>
        </div>
      </div>
    </section>
  );
}
