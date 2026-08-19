import React from 'react';
import { Key, Link2, Cpu, CheckCircle } from 'lucide-react';

export function HowItWorks() {
  const steps = [
    {
      stepNumber: "01",
      icon: Key,
      title: "Create Account & Get API Key",
      description: "Sign up in seconds and instantly generate your production-grade Bearer API key for secure server-to-server calls."
    },
    {
      stepNumber: "02",
      icon: Link2,
      title: "Connect Your Website",
      description: "Embed our simple webhook or redirect your website's file upload button directly to our Central Java FVU Engine endpoint."
    },
    {
      stepNumber: "03",
      icon: Cpu,
      title: "Automated Java Processing",
      description: "Your users upload files on your site, our background Java engine processes it with hybrid failover, and returns verified .fvu instantly."
    }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-slate-950 text-slate-100 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold text-indigo-400">
            <CheckCircle className="w-4 h-4 text-indigo-400" />
            <span>Streamlined Integration</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            How FastFVU Central Works
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Get your platform connected to our robust Java validation engine in 3 simple steps.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          
          {/* Connecting line for desktop */}
          <div className="hidden md:block absolute top-1/2 left-12 right-12 h-0.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 -translate-y-12 z-0"></div>

          {steps.map((item, index) => {
            const IconComp = item.icon;
            return (
              <div
                key={index}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-8 relative z-10 flex flex-col items-center text-center hover:border-slate-700 transition-all shadow-xl"
              >
                {/* Step number badge */}
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-lg mb-6 shadow-lg shadow-indigo-600/30">
                  <IconComp className="w-7 h-7" />
                </div>

                <div className="absolute top-6 right-6 text-xs font-mono font-bold text-slate-600">
                  {item.stepNumber}
                </div>

                <h3 className="text-xl font-bold text-white mb-3">
                  {item.title}
                </h3>

                <p className="text-slate-400 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
