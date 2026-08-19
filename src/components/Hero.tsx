import React from 'react';
import { ShieldCheck, Cpu, ArrowRight, Zap, Code, CheckCircle2, Server, FileCheck } from 'lucide-react';

interface HeroProps {
  onOpenAuth: () => void;
  onExplorePlayground: () => void;
}

export function Hero({ onOpenAuth, onExplorePlayground }: HeroProps) {
  return (
    <div className="relative overflow-hidden bg-slate-950 text-white pt-12 pb-24 lg:pt-20 lg:pb-32">
      {/* Background glow elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-600/15 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-indigo-600/10 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Headline & CTAs */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
            
            {/* Badge */}
            <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-400">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span>Enterprise Java FVU Service Engine v4.2</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
              The Ultimate Central <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-300 bg-clip-text text-transparent">Java FVU Service Engine</span> for Tax Platforms
            </h1>

            {/* Subheadline */}
            <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto lg:mx-0 font-normal leading-relaxed">
              Integrate lightning-fast, crash-free Tax File Validation directly into your own website or use our cloud panel. Powered by robust Hybrid Failover technology.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <button
                onClick={onOpenAuth}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold px-8 py-4 rounded-xl shadow-xl shadow-indigo-600/25 transition-all duration-200 text-base group cursor-pointer"
              >
                <span>Start for Free</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={onExplorePlayground}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold px-8 py-4 rounded-xl transition-all duration-200 text-base"
              >
                <Code className="w-5 h-5 text-blue-400" />
                <span>Read API Docs</span>
              </button>
            </div>

            {/* Key Trust Points */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800/80">
              <div className="flex items-center space-x-2 text-slate-400 text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Zero Java Stack Memory Leaks</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-400 text-xs sm:text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>GitHub Actions Cloud Failover</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-400 text-xs sm:text-sm col-span-2 sm:col-span-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Instant .fvu Generation</span>
              </div>
            </div>

          </div>

          {/* Right Column: Code & Architecture Preview Box */}
          <div className="lg:col-span-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative group">
              
              {/* Header bar of code box */}
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                  <span className="ml-2 text-xs font-mono text-slate-400">FastFVU.Engine.java</span>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                  HTTP 200 OK
                </span>
              </div>

              {/* Code content */}
              <div className="p-5 font-mono text-xs sm:text-sm overflow-x-auto text-slate-300 space-y-2 bg-slate-900/90">
                <div className="text-slate-500">// Initialize FastFVU Java Central Client</div>
                <div><span className="text-purple-400">POST</span> <span className="text-blue-300">/api/v1/fvu/validate</span> HTTP/1.1</div>
                <div><span className="text-indigo-400">Authorization:</span> Bearer fvu_live_9982x...</div>
                <div><span className="text-indigo-400">Content-Type:</span> multipart/form-data</div>
                <div className="pt-2 text-slate-500">// Response Payload</div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-slate-200">
                  <pre className="text-xs text-emerald-400 font-mono">
{`{
  "status": "SUCCESS",
  "fvuVersion": "7.4",
  "processingTimeMs": 142,
  "checksum": "sha256:8f4c9a...",
  "downloadUrl": "/api/v1/fvu/download/file_verified.fvu"
}`}
                  </pre>
                </div>
              </div>

              {/* Floating Status Card */}
              <div className="absolute -bottom-4 -left-4 bg-slate-900 border border-slate-700/80 p-3 rounded-xl shadow-xl flex items-center space-x-3 hidden sm:flex">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">Hybrid Cloud Failover</div>
                  <div className="text-[11px] text-emerald-400 font-medium">Active (Local Java + GH Actions)</div>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
