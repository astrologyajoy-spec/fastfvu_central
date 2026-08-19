import React from 'react';
import { UploadCloud, Code2, ShieldCheck, Cpu, Zap, Lock, RefreshCw, Terminal } from 'lucide-react';

export function Features() {
  const featuresList = [
    {
      icon: UploadCloud,
      title: "Direct Dashboard Upload",
      description: "Users can log in, upload text statements, and get validated .fvu files instantly through our polished web portal.",
      badge: "Cloud Panel",
      color: "from-blue-500 to-indigo-600"
    },
    {
      icon: Code2,
      title: "Developer API Integration",
      description: "Other websites can seamlessly link their platforms using our secure API Key to validate files remotely in real time.",
      badge: "REST API",
      color: "from-indigo-500 to-purple-600"
    },
    {
      icon: RefreshCw,
      title: "100% Uptime Hybrid Technology",
      description: "Powered by real-time local processing with automatic GitHub Actions cloud failover backend for uninterrupted validation.",
      badge: "Failover Guard",
      color: "from-cyan-500 to-blue-600"
    },
    {
      icon: Cpu,
      title: "Zero-Crash Architecture",
      description: "Dedicated Java environment optimized with advanced garbage collection to handle large volume files without memory limits.",
      badge: "High Performance",
      color: "from-emerald-500 to-teal-600"
    },
    {
      icon: Lock,
      title: "Enterprise Grade Security",
      description: "End-to-end TLS encryption with strict data privacy compliant with standard tax regulation frameworks.",
      badge: "Encrypted",
      color: "from-blue-600 to-cyan-500"
    },
    {
      icon: Terminal,
      title: "Instant Diagnostic Logs",
      description: "Detailed error tracing, checksum validation reports, and real-time execution metrics for every uploaded statement.",
      badge: "Diagnostics",
      color: "from-purple-600 to-indigo-600"
    }
  ];

  return (
    <section id="features" className="py-24 bg-slate-900 text-slate-100 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold text-blue-400">
            <Zap className="w-4 h-4 text-blue-400" />
            <span>Core Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Engineered for Tax Platforms & Developers
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Everything you need to automate tax file validation with bulletproof reliability and speed.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuresList.map((feat, index) => {
            const IconComponent = feat.icon;
            return (
              <div
                key={index}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-all duration-300 hover:shadow-xl hover:shadow-blue-950/20 flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Subtle top glow bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-300 from-blue-500 to-indigo-500"></div>

                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${feat.color} flex items-center justify-center text-white shadow-lg`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-mono bg-slate-900 text-slate-400 border border-slate-800 px-2.5 py-1 rounded-full">
                      {feat.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-3 group-hover:text-blue-400 transition-colors">
                    {feat.title}
                  </h3>

                  <p className="text-slate-400 text-sm leading-relaxed">
                    {feat.description}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-slate-900 flex items-center text-xs font-medium text-blue-400 group-hover:translate-x-1 transition-transform">
                  <span>Learn more &rarr;</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
