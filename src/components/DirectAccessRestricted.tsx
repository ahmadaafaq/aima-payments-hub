import React from 'react';
import { ShieldAlert, ExternalLink, Lock, CheckCircle2, ArrowRight } from 'lucide-react';
import { AimaLogo } from './AimaLogo';

interface DirectAccessRestrictedProps {
  onGoToAdmin?: () => void;
}

export const DirectAccessRestricted: React.FC<DirectAccessRestrictedProps> = ({ onGoToAdmin }) => {
  return (
    <div className="max-w-3xl mx-auto my-12 px-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden">
        {/* Institutional Blue Top Bar */}
        <div className="bg-[#002b49] text-white p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-radial from-amber-500/10 via-transparent to-transparent pointer-events-none" />
          <div className="inline-flex p-3.5 rounded-2xl bg-white/10 backdrop-blur-md mb-4 border border-white/10 shadow-inner">
            <ShieldAlert className="w-9 h-9 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Direct Gateway Access Restricted</h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto mt-2 leading-relaxed">
            All India Management Association (AIMA) Centralized Payment Processing Hub
          </p>
        </div>

        {/* Content Body */}
        <div className="p-8 sm:p-10 space-y-8">
          <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs sm:text-sm leading-relaxed flex items-start gap-3.5">
            <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold text-amber-950 mb-0.5">Active Payment Session Required</strong>
              For security and financial compliance, payment sessions cannot be initiated by visiting this address directly. Payments must originate from an authorized AIMA portal with a verified session identifier.
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3.5">
              To complete a registration or fee payment, please visit your source application:
            </h3>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <a
                href="https://research.aima.in"
                className="group p-4 rounded-xl border border-slate-200 hover:border-[#002b49] hover:bg-slate-50/80 transition-all flex items-center justify-between shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 text-sm group-hover:text-[#002b49] block">
                    Case League & Competitions
                  </span>
                  <span className="text-xs text-slate-500 font-mono">research.aima.in</span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#002b49] transition-transform group-hover:translate-x-0.5" />
              </a>

              <a
                href="https://mat.aima.in"
                className="group p-4 rounded-xl border border-slate-200 hover:border-[#002b49] hover:bg-slate-50/80 transition-all flex items-center justify-between shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 text-sm group-hover:text-[#002b49] block">
                    Management Aptitude Test (MAT)
                  </span>
                  <span className="text-xs text-slate-500 font-mono">mat.aima.in</span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#002b49] transition-transform group-hover:translate-x-0.5" />
              </a>

              <a
                href="https://cme.aima.in"
                className="group p-4 rounded-xl border border-slate-200 hover:border-[#002b49] hover:bg-slate-50/80 transition-all flex items-center justify-between shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 text-sm group-hover:text-[#002b49] block">
                    Centre for Management Education (CME)
                  </span>
                  <span className="text-xs text-slate-500 font-mono">cme.aima.in</span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#002b49] transition-transform group-hover:translate-x-0.5" />
              </a>

              <a
                href="https://www.aima.in"
                className="group p-4 rounded-xl border border-slate-200 hover:border-[#002b49] hover:bg-slate-50/80 transition-all flex items-center justify-between shadow-xs"
              >
                <div>
                  <span className="font-bold text-slate-900 text-sm group-hover:text-[#002b49] block">
                    AIMA Official Portal
                  </span>
                  <span className="text-xs text-slate-500 font-mono">www.aima.in</span>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#002b49] transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>

          {/* Compliance strip */}
          <div className="pt-6 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>PCI-DSS Level 1 · 256-bit SSL Encrypted · RBI Compliant</span>
            </div>

            {onGoToAdmin && (
              <button
                type="button"
                onClick={onGoToAdmin}
                className="text-[#002b49] hover:text-amber-600 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Authorized Staff Login</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
