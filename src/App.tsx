import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { ApiPlayground } from './components/ApiPlayground';
import { Pricing } from './components/Pricing';
import { Documentation } from './components/Documentation';
import { AuthModal } from './components/AuthModal';
import { Footer } from './components/Footer';
import { UserDashboard } from './components/UserDashboard';
import { FileUp, FileCheck, Loader2, AlertCircle, Download, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [userSession, setUserSession] = useState<{ email: string; apiKey: string } | null>(null);

  // GUI Automation tool state
  const [txtFile, setTxtFile] = useState<File | null>(null);
  const [csiFile, setCsiFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const txtInputRef = React.useRef<HTMLInputElement>(null);
  const csiInputRef = React.useRef<HTMLInputElement>(null);

  const handleLoginSuccess = (email: string, apiKey: string) => {
    setUserSession({ email, apiKey });
  };

  const handleGuiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txtFile) {
      setError("Please select a valid TDS .txt file to proceed.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append("txtFile", txtFile);
    if (csiFile) {
      formData.append("csiFile", csiFile);
    }
    formData.append("email", userSession?.email || "developer@fastfvu.central");

    try {
      const response = await fetch("/api/fvu", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to process files.");
      }

      setSuccess(data.message || "Job dispatched successfully! Please check your Dashboard Logs above to download the output.");
      setTxtFile(null);
      setCsiFile(null);
      
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during processing.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (userSession) {
    return (
      <div className="bg-slate-950 min-h-screen">
        <UserDashboard userSession={userSession} onSignOut={() => setUserSession(null)} />
        
        {/* GUI Automation Section - Only visible to authenticated users */}
        <section id="gui-generator" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50 border-t border-slate-800">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 text-blue-400 rounded-full mb-4">
                <FileText className="w-6 h-6" />
              </div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight mb-2">
                GUI Automation & Python FVU Bridge
              </h2>
              <p className="text-slate-400">
                Upload your TDS .txt and optional .csi challan files to execute the background Java RPU via Python automation.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-800 p-6 sm:p-8">
              <form onSubmit={handleGuiSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    TDS Statement (.txt) <span className="text-red-400">*</span>
                  </label>
                  <div 
                    onClick={() => txtInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                      ${txtFile ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 hover:border-blue-400 hover:bg-slate-800/50'}`}
                  >
                    <input 
                      type="file" 
                      ref={txtInputRef}
                      onChange={(e) => e.target.files && setTxtFile(e.target.files[0])}
                      accept=".txt" 
                      className="hidden" 
                    />
                    {txtFile ? (
                      <div className="flex flex-col items-center text-blue-400">
                        <FileCheck className="w-8 h-8 mb-2" />
                        <span className="font-medium">{txtFile.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <FileUp className="w-8 h-8 mb-2" />
                        <span>Click to upload TDS statement (.txt)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Challan Status Inquiry (.csi) <span className="text-slate-500">(Optional)</span>
                  </label>
                  <div 
                    onClick={() => csiInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                      ${csiFile ? 'border-teal-500 bg-teal-500/10' : 'border-slate-700 hover:border-teal-400 hover:bg-slate-800/50'}`}
                  >
                    <input 
                      type="file" 
                      ref={csiInputRef}
                      onChange={(e) => e.target.files && setCsiFile(e.target.files[0])}
                      accept=".csi" 
                      className="hidden" 
                    />
                    {csiFile ? (
                      <div className="flex flex-col items-center text-teal-400">
                        <FileCheck className="w-8 h-8 mb-2" />
                        <span className="font-medium">{csiFile.name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <span>Click to upload CSI challan file (.csi)</span>
                      </div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <div className="bg-red-950/50 border border-red-800 text-red-300 p-4 rounded-xl flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                      <span className="text-sm">{error}</span>
                    </div>
                  )}
                  {success && (
                    <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 p-4 rounded-xl flex items-center gap-3">
                      <Download className="w-5 h-5 shrink-0 text-emerald-400" />
                      <span className="text-sm">{success}</span>
                    </div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={!txtFile || isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 transition-all shadow-lg shadow-blue-500/20"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Executing Automation Bridge...</span>
                    </>
                  ) : (
                    <span>Run Python Automation & Generate FVU</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      <Navbar
        onOpenAuth={() => setAuthModalOpen(true)}
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />
      <Hero
        onOpenAuth={() => setAuthModalOpen(true)}
        onExplorePlayground={() => {
          const el = document.getElementById('playground');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <Features />
      <HowItWorks />
      <ApiPlayground />
      <Pricing onOpenAuth={() => setAuthModalOpen(true)} />
      <Documentation />
      <Footer />
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />
    </div>
  );
}
