import React from 'react';
import { AimaLogo } from './AimaLogo';
import { ShieldCheck, Lock, Shield } from 'lucide-react';

export type ActiveTab = 'restricted' | 'checkout' | 'admin' | 'applications' | 'sync' | 'guide';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  hasActiveOrder: boolean;
  hideNavigation?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  hasActiveOrder,
}) => {
  const isDevMode = typeof window !== 'undefined' && (
    new URLSearchParams(window.location.search).get('dev') === 'true' ||
    window.location.pathname.startsWith('/dev')
  );

  return (
    <header className="sticky top-0 z-40 bg-[#002b49] text-white shadow-md border-b border-[#0a4b78]">
      {/* Institutional Top Accent Ribbon (Tricolor subtle bar) */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-white/80 to-emerald-600" />

      {/* Main Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Brand Lockup element */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (activeTab === 'admin') return;
                onSelectTab('restricted');
              }}
              className="flex items-center text-left hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="AIMA Centralized Payment Service"
            >
              <AimaLogo size="sm" variant="light" />
            </button>

            {activeTab === 'admin' && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold uppercase tracking-wider">
                <Lock className="w-3 h-3 text-amber-400" />
                Admin Console
              </span>
            )}
          </div>

          {/* Right Status Badge */}
          {activeTab === 'admin' ? (
            <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Institutional Administration Console</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-300 font-semibold bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Official Institutional Gateway · 256-Bit SSL</span>
            </div>
          )}

          {/* Optional Dev Mode Only Tabs (Only visible if ?dev=true) */}
          {isDevMode && (
            <nav className="hidden lg:flex items-center gap-4 text-xs font-medium bg-black/30 px-3 py-1 rounded-lg border border-amber-400/30">
              <span className="text-amber-400 font-bold uppercase tracking-wider text-[10px]">Dev:</span>
              <button
                onClick={() => onSelectTab('restricted')}
                className={`cursor-pointer hover:text-white ${activeTab === 'restricted' ? 'text-amber-300 font-bold' : 'text-slate-300'}`}
              >
                Restricted Screen
              </button>
              <button
                onClick={() => onSelectTab('checkout')}
                className={`cursor-pointer hover:text-white ${activeTab === 'checkout' ? 'text-amber-300 font-bold' : 'text-slate-300'}`}
              >
                Checkout {hasActiveOrder && '•'}
              </button>
              <button
                onClick={() => onSelectTab('admin')}
                className={`cursor-pointer hover:text-white ${activeTab === 'admin' ? 'text-amber-300 font-bold' : 'text-slate-300'}`}
              >
                Admin
              </button>
              <button
                onClick={() => onSelectTab('applications')}
                className={`cursor-pointer hover:text-white ${activeTab === 'applications' ? 'text-amber-300 font-bold' : 'text-slate-300'}`}
              >
                Sim Launcher
              </button>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
};
