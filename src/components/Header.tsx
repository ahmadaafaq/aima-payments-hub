import React from 'react';
import { AimaLogo } from './AimaLogo';
import { ShieldCheck, Lock } from 'lucide-react';

export type ActiveTab = 'applications' | 'checkout' | 'admin' | 'sync' | 'guide';

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
  hideNavigation = false,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#002b49] text-white shadow-md border-b border-[#0a4b78]">
      {/* Institutional Top Accent Ribbon (Tricolor subtle bar) */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-white/80 to-emerald-600" />

      {/* Main Top Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Brand Lockup element */}
          <button
            onClick={() => {
              if (!hideNavigation) onSelectTab('applications');
            }}
            className="flex items-center text-left hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="AIMA Payment Hub Home"
          >
            <AimaLogo size="sm" variant="light" />
          </button>

          {/* If hideNavigation is TRUE (e.g. source redirect to checkout), show only secure payment badge */}
          {hideNavigation ? (
            <div className="flex items-center gap-2 text-xs text-amber-300 font-semibold bg-white/10 px-3 py-1.5 rounded-full border border-white/10">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Official Institutional Payment Gateway</span>
            </div>
          ) : (
            <>
              {/* Desktop Nav Links */}
              <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                <button
                  onClick={() => onSelectTab('applications')}
                  className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                    activeTab === 'applications'
                      ? 'border-amber-400 text-amber-300 font-semibold'
                      : 'border-transparent text-slate-200'
                  }`}
                >
                  Applications
                </button>
                <button
                  onClick={() => onSelectTab('checkout')}
                  className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'checkout'
                      ? 'border-amber-400 text-amber-300 font-semibold'
                      : 'border-transparent text-slate-200'
                  }`}
                >
                  Payment Hub
                  {hasActiveOrder && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  )}
                </button>
                <button
                  onClick={() => onSelectTab('admin')}
                  className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'admin'
                      ? 'border-amber-400 text-amber-300 font-semibold'
                      : 'border-transparent text-slate-200'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  Admin Console
                </button>
              </nav>

              {/* Right Security Badge */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold">256-bit SSL Encrypted</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile Nav strip (when navigation is visible) */}
      {!hideNavigation && (
        <div className="md:hidden flex items-center justify-around border-t border-[#0d4670] bg-[#00223b] px-2 py-2 text-xs overflow-x-auto">
          <button
            onClick={() => onSelectTab('applications')}
            className={`px-3 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'applications' ? 'text-amber-400 font-bold' : 'text-slate-300'
            }`}
          >
            Applications
          </button>
          <button
            onClick={() => onSelectTab('checkout')}
            className={`px-3 py-1 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'checkout' ? 'text-amber-400 font-bold' : 'text-slate-300'
            }`}
          >
            Payment Hub {hasActiveOrder && '•'}
          </button>
          <button
            onClick={() => onSelectTab('admin')}
            className={`px-3 py-1 whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
              activeTab === 'admin' ? 'text-amber-400 font-bold' : 'text-slate-300'
            }`}
          >
            <Lock className="w-3 h-3 text-amber-400" />
            Admin Console
          </button>
        </div>
      )}
    </header>
  );
};
