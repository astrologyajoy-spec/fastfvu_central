import React from 'react';
import { Check, Zap, Shield, Sparkles } from 'lucide-react';

interface PricingProps {
  onOpenAuth: () => void;
}

export function Pricing({ onOpenAuth }: PricingProps) {
  const plans = [
    {
      name: "Starter Developer",
      price: "Free",
      period: "forever",
      description: "Ideal for testing, small personal projects, and sandbox exploration.",
      features: [
        "100 Free Validations / month",
        "Community Discord Support",
        "Standard Java Engine v4.2",
        "API Key & Webhook access",
        "Basic Error Diagnostics"
      ],
      cta: "Get Started Free",
      popular: false
    },
    {
      name: "Pro SaaS Platform",
      price: "$49",
      period: "per month",
      description: "Designed for tax filing portals, Chartered Accountants, and growing software platforms.",
      features: [
        "10,000 Validations / month",
        "Priority GitHub Actions Failover",
        "Dedicated Java Memory Allocation",
        "Instant .fvu generation webhook",
        "Email & Priority Support",
        "Detailed Audit Trail Reports"
      ],
      cta: "Start Pro Trial",
      popular: true
    },
    {
      name: "Enterprise Central",
      price: "$199",
      period: "per month",
      description: "For high-volume financial institutions requiring custom SLAs and dedicated nodes.",
      features: [
        "Unlimited Validations",
        "Custom Dedicated Java Node",
        "99.99% Guaranteed SLA Uptime",
        "On-premise hybrid connector",
        "24/7 Dedicated Account Manager",
        "Custom Tax Return Schema Rules"
      ],
      cta: "Contact Enterprise",
      popular: false
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-slate-950 text-slate-100 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-full text-xs font-semibold text-emerald-400">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Transparent Pricing</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Simple, Predictable Plans for Every Platform
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            Scale your tax file validation workflow without unexpected overages or crash anxiety.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`bg-slate-900 border rounded-2xl p-8 flex flex-col justify-between relative transition-all duration-300 ${
                plan.popular
                  ? 'border-blue-500 shadow-2xl shadow-blue-600/15 md:-translate-y-2'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-md uppercase tracking-wider">
                  Most Popular
                </div>
              )}

              <div>
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-slate-400 text-xs leading-relaxed">{plan.description}</p>
                </div>

                <div className="flex items-baseline space-x-2 mb-6 pb-6 border-b border-slate-800">
                  <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-slate-400 text-xs">/ {plan.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center space-x-3 text-sm text-slate-300">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={onOpenAuth}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer ${
                  plan.popular
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/25'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
