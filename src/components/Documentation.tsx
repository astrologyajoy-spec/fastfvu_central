import React from 'react';
import { BookOpen, Terminal, Shield, Cpu, ExternalLink } from 'lucide-react';

export function Documentation() {
  return (
    <section id="docs" className="py-24 bg-slate-900 text-slate-100 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-400">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span>Developer Guides</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            FastFVU Central Documentation
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Complete reference guide for integrating our Java FVU service engine into your web application.
          </p>
        </div>

        {/* Documentation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <KeyIcon />
            </div>
            <h3 className="text-lg font-bold text-white">1. Authentication</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              All API requests must include your Bearer token in the Authorization header. Generate keys from your dashboard.
            </p>
            <div className="font-mono text-xs text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-800">
              Authorization: Bearer fvu_live_...
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">2. Validation Endpoint</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              POST multipart/form-data or JSON payload to our primary Java compiler route for instant verification.
            </p>
            <div className="font-mono text-xs text-blue-400 bg-slate-900 p-3 rounded-lg border border-slate-800">
              POST /api/v1/fvu/validate
            </div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">3. Hybrid Failover</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              In case of high traffic peaks, our proxy automatically routes requests to our secure GitHub Actions cloud fallback node.
            </p>
            <div className="font-mono text-xs text-emerald-400 bg-slate-900 p-3 rounded-lg border border-slate-800">
              Status: 100% Redundancy
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}

function KeyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}
