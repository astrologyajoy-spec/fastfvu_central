import React, { useState, useEffect } from 'react';
import { 
  LogOut, Sun, Moon, LayoutDashboard, Key, Clock, Download, 
  AlertCircle, CheckCircle2, Copy, Check, UploadCloud, RefreshCw, Eye, EyeOff, Plus, FileText, Activity, X, FileCheck, ShieldAlert
} from 'lucide-react';
import { BACKEND_URL, FVU_VALIDATE_URL, FVU_LOGS_URL } from '../config';

interface UserDashboardProps {
  userSession: { email: string; apiKey: string };
  onSignOut: () => void;
}

export function UserDashboard({ userSession, onSignOut }: UserDashboardProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [activeTab, setActiveTab] = useState<'overview' | 'api-keys' | 'history'>('overview');
  
  const [apiKeys] = useState([
    { id: 1, key: userSession.apiKey, name: 'Production Key', createdAt: new Date().toLocaleDateString(), lastUsed: 'Just now', status: 'Active' },
    { id: 2, key: 'fvu_live_8x92ndb21x', name: 'Staging Environment', createdAt: '10/12/2023', lastUsed: '2 days ago', status: 'Active' }
  ]);
  const [showKey, setShowKey] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [logs, setLogs] = useState<any[]>([]);
  const [validating, setValidating] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedCsiFile, setUploadedCsiFile] = useState<File | null>(null);
  const [validationResult, setValidationResult] = useState<{ 
    status: 'SUCCESS' | 'FAILED' | 'PENDING'; 
    message: string; 
    fvuFileName?: string; 
    errorFileName?: string; 
    errors?: any[];
    downloadUrl?: string;
    fileContentBase64?: string;
    errorContent?: string;
  } | null>(null);
  const [selectedErrorModal, setSelectedErrorModal] = useState<{ fileName: string; outputFileName?: string; errors: any[] } | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(FVU_LOGS_URL);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (data && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      } catch (jsonErr) {
        console.warn('Non-JSON logs response:', text.slice(0, 100));
      }
    } catch (err) {
      console.warn('Failed to fetch logs', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownload = async (filename: string, directUrlOrContent?: string) => {
    try {
      let targetUrl = directUrlOrContent;

      // Check if current validation result matches filename and has downloadUrl or in-memory content
      if (!targetUrl && validationResult) {
        if ((filename === validationResult.fvuFileName || filename === validationResult.errorFileName) && validationResult.downloadUrl) {
          targetUrl = validationResult.downloadUrl;
        } else if (filename === validationResult.errorFileName && validationResult.errorContent) {
          const blob = new Blob([validationResult.errorContent], { type: 'text/plain;charset=utf-8' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          return;
        }
      }

      // Handle Data URI or Blob URL
      if (targetUrl && (targetUrl.startsWith('data:') || targetUrl.startsWith('blob:'))) {
        const a = document.createElement('a');
        a.href = targetUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // Handle Direct HTTP/HTTPS Supabase or Storage URL
      if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
        try {
          const response = await fetch(targetUrl);
          if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return;
          }
        } catch (e) {
          console.warn("Direct download fetch failed, falling back to download API:", e);
        }
      }

      // Fallback: Fetch via Backend Download Endpoint
      const response = await fetch(`${BACKEND_URL}/api/v1/fvu/download?filename=${encodeURIComponent(filename)}`);
      if (!response.ok) {
        // Fallback to in-memory base64 if present
        if (validationResult && validationResult.fileContentBase64) {
          try {
            const byteCharacters = atob(validationResult.fileContentBase64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/octet-stream' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return;
          } catch (b64Err) {
            console.error("Failed decoding in-memory base64 fallback:", b64Err);
          }
        }

        alert("File could not be downloaded from server storage. Please re-run validation.");
        return;
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const json = await response.json();
        if (json.publicUrl || json.downloadUrl) {
          const directUrl = json.publicUrl || json.downloadUrl;
          const a = document.createElement('a');
          a.href = directUrl;
          a.download = filename;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        } else if (json.status === 'PROCESSING') {
          alert("File validation is still in progress. Please wait a moment.");
          return;
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download error:", err);
      alert("An error occurred while downloading the file.");
    }
  };

  const pollForFileCompletion = async (fvuFileName: string, errorFileName: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 3s = 90s max polling duration
    
    const interval = setInterval(async () => {
      attempts++;
      
      try {
        const response = await fetch(`${BACKEND_URL}/api/fvu/status?filename=${encodeURIComponent(fvuFileName)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'COMPLETED' || data.status === 'SUCCESS') {
            clearInterval(interval);
            setValidationResult({
              status: 'SUCCESS',
              message: `Validated successfully by GitHub Actions Runner (Java 17)! File ready: ${data.filename || fvuFileName}`,
              fvuFileName: data.filename || fvuFileName,
              downloadUrl: data.publicUrl || `${BACKEND_URL}/api/v1/fvu/download?filename=${encodeURIComponent(data.filename || fvuFileName)}`
            });
            setValidating(false);
            fetchLogs();
            return;
          } else if (data.status === 'FAILED') {
            clearInterval(interval);
            setValidationResult({
              status: 'FAILED',
              message: `Validation complete with errors on GitHub Actions Runner. Error report ready: ${data.filename || errorFileName}`,
              errorFileName: data.filename || errorFileName,
              downloadUrl: data.publicUrl || `${BACKEND_URL}/api/v1/fvu/download?filename=${encodeURIComponent(data.filename || errorFileName)}`
            });
            setValidating(false);
            fetchLogs();
            return;
          }
          // If status is 'PROCESSING', continue polling
        }
      } catch (e) {}

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setValidationResult({
          status: 'FAILED',
          message: 'GitHub Actions validation runner is taking longer than expected. Please check your Recent Validations list below in a moment.',
          fvuFileName,
          errorFileName
        });
        setValidating(false);
        fetchLogs();
      }
    }, 3000);
  };

  const handleRunValidation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile) return;

    setValidating(true);
    setValidationResult(null);
    
    let fileContent = "";
    let csiFileContent: string | null = null;

    try {
      fileContent = await uploadedFile.text();
    } catch(err) {
      console.error("Failed to read text file", err);
    }

    if (uploadedCsiFile) {
      try {
        csiFileContent = await uploadedCsiFile.text();
      } catch(err) {
        console.error("Failed to read CSI file", err);
      }
    }

    try {
      const res = await fetch(FVU_VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userSession.email,
          fileName: uploadedFile.name,
          fileContent: fileContent,
          csiFileName: uploadedCsiFile ? uploadedCsiFile.name : null,
          csiFileContent: csiFileContent
        })
      });
      
      let data: any = {};
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch (parseErr) {
        data = { status: 'FAILED', errors: [{ line: 1, code: 'ERR_SRV', message: 'Unexpected server response' }] };
      }

      // Check if job was dispatched to GitHub Actions workflow
      if (data.status === 'PENDING' || data.dispatchedToGithub || data.pending) {
        const fvuFileName = data.fvuFileName || uploadedFile.name.replace(/\.[^/.]+$/, "") + ".fvu";
        const errorFileName = data.errorFileName || uploadedFile.name.replace(/\.[^/.]+$/, "") + ".err";

        setValidationResult({
          status: 'PENDING',
          message: data.message || 'Job dispatched to GitHub Actions Java 17 Runner. Polling Supabase for generated report...',
          fvuFileName,
          errorFileName
        });

        pollForFileCompletion(fvuFileName, errorFileName);
        return;
      }
      
      if (!res.ok || data.status === 'FAILED') {
        setValidationResult({
          status: 'FAILED',
          message: data.message || data.error || 'NSDL FVU Validation failed. Please review error report.',
          errorFileName: data.errorFileName,
          errors: data.errors || [],
          downloadUrl: data.downloadUrl,
          fileContentBase64: data.fileContentBase64,
          errorContent: data.errorContent
        });
      } else {
        setValidationResult({
          status: 'SUCCESS',
          message: data.message || 'Validated successfully by FastFVU Engine.',
          fvuFileName: data.fvuFileName,
          downloadUrl: data.downloadUrl,
          fileContentBase64: data.fileContentBase64
        });
      }

      setValidating(false);
      fetchLogs();
    } catch (err: any) {
      setValidating(false);
      setValidationResult({
        status: 'FAILED',
        message: 'Network or server error occurred: ' + err.message,
        errors: [{ line: 1, code: 'NET_ERR', message: err.message }]
      });
    }
  };

  const cardClasses = theme === 'dark'
    ? 'bg-slate-900 border-slate-800'
    : 'bg-white border-slate-200 shadow-sm';

  const textMuted = theme === 'dark' ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`min-h-screen transition-colors duration-200 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Topbar */}
      <header className={`sticky top-0 z-40 border-b px-4 sm:px-6 h-16 flex items-center justify-between ${theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-white/80 border-slate-200'} backdrop-blur-md`}>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
            FV
          </div>
          <span className="font-bold text-lg hidden sm:block">FastFVU Central</span>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={toggleTheme} className={`p-2 rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className={`h-8 w-px ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}></div>
          <div className="flex items-center space-x-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
              {userSession.email.charAt(0).toUpperCase()}
            </div>
            <span className={`text-sm font-medium hidden sm:block ${textMuted}`}>{userSession.email}</span>
          </div>
          <button onClick={onSignOut} className={`p-2 rounded-lg ${theme === 'dark' ? 'hover:bg-slate-800 text-red-400' : 'hover:bg-red-50 text-red-600'}`}>
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-8">
        
        {/* Sidebar */}
        <nav className="w-full md:w-64 shrink-0 space-y-2">
          {[
            { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'api-keys', icon: Key, label: 'API Keys' },
            { id: 'history', icon: Clock, label: 'FVU History' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : theme === 'dark'
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-white' : ''}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Main Content */}
        <main className="flex-1 space-y-6">
          
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              <h1 className="text-2xl font-bold">Dashboard Overview</h1>
              
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total FVU Generated', value: '1,284', icon: FileText, color: 'text-blue-500' },
                  { label: 'API Requests (30d)', value: '14,092', icon: Activity, color: 'text-emerald-500' },
                  { label: 'Remaining Quota', value: '85.9K', icon: AlertCircle, color: 'text-indigo-500' }
                ].map((stat, i) => (
                  <div key={i} className={`p-6 rounded-2xl border ${cardClasses} flex items-center justify-between`}>
                    <div>
                      <div className={`text-xs font-medium mb-1 ${textMuted}`}>{stat.label}</div>
                      <div className="text-3xl font-bold">{stat.value}</div>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-opacity-10 ${stat.color.replace('text-', 'bg-')}`}>
                      <stat.icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload Validator Widget */}
              <div className={`p-6 rounded-2xl border ${cardClasses}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg">NSDL e-TDS / TCS File Validator</h3>
                    <p className={`text-xs ${textMuted}`}>Select TDS text statement and optional Challan Status (.csi) file for validation.</p>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 font-semibold">
                    FVU Engine 1.1
                  </span>
                </div>

                <form onSubmit={handleRunValidation} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* TDS / TCS File Input */}
                    <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col justify-between transition-colors ${theme === 'dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-300 bg-slate-50/50'}`}>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-blue-500 flex items-center space-x-1.5">
                            <FileText className="w-3.5 h-3.5" />
                            <span>TDS / TCS Text File (.txt) *</span>
                          </label>
                          {uploadedFile && (
                            <button
                              type="button"
                              onClick={() => setUploadedFile(null)}
                              className="text-xs text-red-400 hover:text-red-500"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <p className={`text-[11px] mb-3 ${textMuted}`}>e.g. Form 24Q, 26Q, 27Q, 27EQ statement</p>
                      </div>
                      <input
                        type="file"
                        accept=".txt"
                        required
                        onChange={(e) => e.target.files && setUploadedFile(e.target.files[0])}
                        className={`text-xs w-full cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 ${textMuted}`}
                      />
                    </div>

                    {/* CSI Challan File Input */}
                    <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col justify-between transition-colors ${theme === 'dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-300 bg-slate-50/50'}`}>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-emerald-500 flex items-center space-x-1.5">
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Challan File (.csi)</span>
                          </label>
                          {uploadedCsiFile && (
                            <button
                              type="button"
                              onClick={() => setUploadedCsiFile(null)}
                              className="text-xs text-red-400 hover:text-red-500"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <p className={`text-[11px] mb-3 ${textMuted}`}>OLTAS / e-Filing Challan Status Inquiry (Optional)</p>
                      </div>
                      <input
                        type="file"
                        accept=".csi"
                        onChange={(e) => e.target.files && setUploadedCsiFile(e.target.files[0])}
                        className={`text-xs w-full cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 ${textMuted}`}
                      />
                    </div>

                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className={`text-xs ${textMuted}`}>
                      {uploadedFile ? (
                        <span>Ready: <strong className="text-blue-500">{uploadedFile.name}</strong> {uploadedCsiFile && <>+ <strong className="text-emerald-500">{uploadedCsiFile.name}</strong></>}</span>
                      ) : (
                        <span>Please select a .txt statement file to begin validation.</span>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={validating || !uploadedFile}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2 text-sm cursor-pointer"
                    >
                      {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                      <span>{validating ? 'Running Java NSDL FVU Engine...' : 'Validate & Generate FVU'}</span>
                    </button>
                  </div>
                </form>

                {/* Validation Feedback Box */}
                {validationResult && (
                  <div className={`mt-4 p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn ${
                    validationResult.status === 'SUCCESS' 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                      : validationResult.status === 'PENDING'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400'
                  }`}>
                    <div className="flex items-start space-x-3">
                      {validationResult.status === 'SUCCESS' ? (
                        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                      ) : validationResult.status === 'PENDING' ? (
                        <RefreshCw className="w-5 h-5 shrink-0 mt-0.5 animate-spin" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">
                          {validationResult.status === 'SUCCESS' ? 'Validation Successful!' : validationResult.status === 'PENDING' ? 'Processing on GitHub Actions Java 17 Runner...' : 'Validation Failed'}
                        </div>
                        <div className="text-xs opacity-90">{validationResult.message}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {validationResult.status === 'SUCCESS' && validationResult.fvuFileName && (
                        <button
                          type="button"
                          onClick={() => handleDownload(validationResult.fvuFileName!)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download .FVU</span>
                        </button>
                      )}
                      {validationResult.status === 'FAILED' && validationResult.errorFileName && (
                        <button
                          type="button"
                          onClick={() => handleDownload(validationResult.errorFileName!)}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Error Log (.err)</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className={`rounded-2xl border ${cardClasses} overflow-hidden`}>
                <div className={`px-6 py-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-slate-800' : 'border-slate-200'}`}>
                  <h3 className="font-bold">Recent Validations</h3>
                  <button onClick={fetchLogs} className="text-blue-500 hover:underline text-xs font-medium">Refresh</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className={`${theme === 'dark' ? 'bg-slate-950/50 text-slate-400' : 'bg-slate-50 text-slate-500'} font-medium`}>
                      <tr>
                        <th className="px-6 py-3">Original File</th>
                        <th className="px-6 py-3">Challan (.csi)</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Output File</th>
                        <th className="px-6 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/10">
                      {logs.slice(0, 5).map((log, i) => (
                        <tr key={i} className={theme === 'dark' ? 'divide-slate-800' : 'divide-slate-200'}>
                          <td className="px-6 py-4 font-mono text-xs">{log.file_name}</td>
                          <td className={`px-6 py-4 font-mono text-xs ${log.csi_filename ? 'text-emerald-500' : textMuted}`}>
                            {log.csi_filename || '—'}
                          </td>
                          <td className="px-6 py-4">
                            {log.status === 'SUCCESS' ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md text-xs font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>SUCCESS</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-md text-xs font-medium">
                                <AlertCircle className="w-3 h-3" />
                                <span>FAILED</span>
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-blue-500">
                            {log.output_filename || '—'}
                          </td>
                          <td className="px-6 py-4">
                            {log.output_filename ? (
                              <div className="flex items-center space-x-2">
                                <button 
                                  type="button"
                                  onClick={() => handleDownload(log.output_filename)}
                                  className={`inline-flex items-center space-x-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                                    log.status === 'SUCCESS'
                                      ? 'text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
                                      : 'text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20'
                                  }`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>{log.status === 'SUCCESS' ? 'Download .FVU' : 'Download .ERR'}</span>
                                </button>
                                {log.status === 'FAILED' && log.error_details && (
                                  <button
                                    onClick={() => {
                                      let parsed = [];
                                      try { parsed = JSON.parse(log.error_details); } catch(e) { parsed = [{ line: 1, message: log.error_details }]; }
                                      setSelectedErrorModal({ fileName: log.file_name, outputFileName: log.output_filename, errors: parsed });
                                    }}
                                    className="inline-flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Errors</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className={`text-xs ${textMuted}`}>No file</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={5} className={`px-6 py-8 text-center ${textMuted}`}>No recent activity.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api-keys' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">API Keys</h1>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Create New Key</span>
                </button>
              </div>

              <div className="space-y-4">
                {apiKeys.map(key => (
                  <div key={key.id} className={`p-6 rounded-2xl border ${cardClasses} flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between`}>
                    <div className="space-y-1">
                      <div className="flex items-center space-x-3">
                        <span className="font-bold">{key.name}</span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${key.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
                          {key.status}
                        </span>
                      </div>
                      <div className={`text-xs ${textMuted}`}>
                        Created on {key.createdAt} • Last used {key.lastUsed}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 w-full sm:w-auto">
                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg font-mono text-sm border flex-1 sm:w-64 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                        <span>{showKey[key.id] ? key.key : '••••••••••••••••••••'}</span>
                        <button onClick={() => setShowKey(prev => ({ ...prev, [key.id]: !prev[key.id] }))} className="text-slate-400 hover:text-blue-500 ml-2">
                          {showKey[key.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        onClick={() => handleCopy(key.key)}
                        className={`p-2 rounded-lg border transition-colors ${theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-300 hover:bg-slate-100 text-slate-600'}`}
                        title="Copy API Key"
                      >
                        {copiedKey === key.key ? <Check className="w-5 h-5 text-emerald-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">FVU History & Validation Logs</h1>
                <button onClick={fetchLogs} className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Logs</span>
                </button>
              </div>

              <div className={`rounded-2xl border ${cardClasses} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className={`${theme === 'dark' ? 'bg-slate-950/50 text-slate-400' : 'bg-slate-50 text-slate-500'} font-medium`}>
                      <tr>
                        <th className="px-6 py-3">Timestamp</th>
                        <th className="px-6 py-3">Input File (.txt)</th>
                        <th className="px-6 py-3">Challan (.csi)</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Generated File</th>
                        <th className="px-6 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/10">
                      {logs.map((log: any, i) => (
                        <tr key={i} className={theme === 'dark' ? 'divide-slate-800' : 'divide-slate-200'}>
                          <td className={`px-6 py-4 text-xs ${textMuted}`}>{new Date(log.created_at || Date.now()).toLocaleString()}</td>
                          <td className="px-6 py-4 font-mono text-xs">{log.file_name}</td>
                          <td className={`px-6 py-4 font-mono text-xs ${log.csi_filename ? 'text-emerald-500' : textMuted}`}>
                            {log.csi_filename || '—'}
                          </td>
                          <td className="px-6 py-4">
                            {log.status === 'SUCCESS' ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md text-xs font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>SUCCESS</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-md text-xs font-medium">
                                <AlertCircle className="w-3 h-3" />
                                <span>FAILED</span>
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-blue-500">{log.output_filename || '—'}</td>
                          <td className="px-6 py-4">
                            {log.output_filename ? (
                              <div className="flex items-center space-x-2">
                                <button 
                                  type="button"
                                  onClick={() => handleDownload(log.output_filename)}
                                  className={`inline-flex items-center space-x-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                    log.status === 'SUCCESS'
                                      ? 'text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20'
                                      : 'text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20'
                                  }`}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>{log.status === 'SUCCESS' ? 'Download .FVU' : 'Download .ERR'}</span>
                                </button>
                                {log.status === 'FAILED' && log.error_details && (
                                  <button
                                    onClick={() => {
                                      let parsed = [];
                                      try { parsed = JSON.parse(log.error_details); } catch(e) { parsed = [{ line: 1, message: log.error_details }]; }
                                      setSelectedErrorModal({ fileName: log.file_name, outputFileName: log.output_filename, errors: parsed });
                                    }}
                                    className="inline-flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>View Errors</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className={`text-xs ${textMuted}`}>No file</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr>
                          <td colSpan={6} className={`px-6 py-12 text-center ${textMuted}`}>
                            <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No history found.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Error Report Inspection Modal */}
      {selectedErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className={`w-full max-w-2xl rounded-2xl border ${cardClasses} p-6 space-y-4 shadow-2xl relative max-h-[85vh] flex flex-col`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center space-x-2 text-red-500">
                <AlertCircle className="w-5 h-5" />
                <h3 className="font-bold text-base">NSDL FVU Error Report</h3>
              </div>
              <button
                onClick={() => setSelectedErrorModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`text-xs ${textMuted}`}>
              File: <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{selectedErrorModal.fileName}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedErrorModal.errors && selectedErrorModal.errors.length > 0 ? (
                selectedErrorModal.errors.map((err: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono font-semibold text-red-600 dark:text-red-400">
                      <span>Line {err.line || idx + 1}</span>
                      <span>{err.code || 'ERR_NSDL'}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-sans">{typeof err.message === 'string' ? err.message : (typeof err === 'string' ? err : JSON.stringify(err))}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">No structured error codes found.</p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
              {selectedErrorModal.outputFileName ? (
                <button
                  type="button"
                  onClick={() => handleDownload(selectedErrorModal.outputFileName!)}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Raw Error Log (.err)</span>
                </button>
              ) : <div />}
              <button
                onClick={() => setSelectedErrorModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
