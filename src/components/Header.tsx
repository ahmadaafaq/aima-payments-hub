import React from 'react';
import { AimaLogo } from './AimaLogo';
import { RotateCcw } from 'lucide-react';

export type ActiveTab = 'applications' | 'checkout' | 'admin' | 'sync' | 'guide' | 'registry';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onResetData: () => void;
  hasActiveOrder: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onResetData,
  hasActiveOrder,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#002b49] text-white shadow-md border-b border-[#0a4b78]">
      {/* Institutional Top Accent Ribbon (Tricolor subtle bar) */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-white/80 to-emerald-600" />

      {/* Main Top Bar adhering to 3-zone contract */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Single Brand Lockup element */}
          <button
            onClick={() => onSelectTab('applications')}
            className="flex items-center text-left hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
            aria-label="AIMA Payment Hub Home"
          >
            <AimaLogo size="sm" variant="light" />
          </button>

          {/* Zone 2: 4-5 single-line navigation links */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium">
            <button
              onClick={() => onSelectTab('applications')}
              className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'applications'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-slate-200'
              }`}
            >
              Applications
            </button>
            <button
              onClick={() => onSelectTab('checkout')}
              className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 ${
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
              className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'admin'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-slate-200'
              }`}
            >
              Admin MIS
            </button>
            <button
              onClick={() => onSelectTab('sync')}
              className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'sync'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-slate-200'
              }`}
            >
              Return Sync
            </button>
            <button
              onClick={() => onSelectTab('guide')}
              className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === 'guide'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-slate-200'
              }`}
            >
              Demo Guide
            </button>
            <button
              onClick={() => onSelectTab('registry')}
              className={`hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 flex items-center gap-1.5 ${
                activeTab === 'registry'
                  ? 'border-amber-400 text-amber-300 font-semibold'
                  : 'border-transparent text-slate-200'
              }`}
            >
              App Registry
              <span className="text-[10px] bg-amber-400 text-[#00223b] px-1 rounded font-bold">P3</span>
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onResetData}
              title="Reset all demo data to default test dataset"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-[#063a61] hover:bg-[#0b4d7f] hover:text-white rounded border border-[#1b5e94] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Reset Demo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav strip */}
      <div className="lg:hidden flex items-center justify-around border-t border-[#0d4670] bg-[#00223b] px-2 py-2 text-xs overflow-x-auto">
        <button
          onClick={() => onSelectTab('applications')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeTab === 'applications' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}
        >
          Applications
        </button>
        <button
          onClick={() => onSelectTab('checkout')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeTab === 'checkout' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}
        >
          Payment Hub {hasActiveOrder && '•'}
        </button>
        <button
          onClick={() => onSelectTab('admin')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeTab === 'admin' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}
        >
          Admin MIS
        </button>
        <button
          onClick={() => onSelectTab('sync')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeTab === 'sync' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}
        >
          Return Sync
        </button>
        <button
          onClick={() => onSelectTab('guide')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeTab === 'guide' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}
        >
          Demo Guide
        </button>
        <button
          onClick={() => onSelectTab('registry')}
          className={`px-2 py-1 whitespace-nowrap shrink-0 ${activeTab === 'registry' ? 'text-amber-400 font-bold' : 'text-slate-300'}`}
        >
          Registry
        </button>
      </div>

      {/* Subtle Demo Banner explaining prototype scope */}
      <div className="bg-[#052137] border-t border-b border-[#0d3b61] text-[11px] text-slate-300 px-4 py-1.5 text-center">
        <span className="font-semibold text-amber-400 tracking-wide uppercase mr-1.5">Stakeholder Prototype</span>
        <span>· Simulating Unified Payment Architecture for HDFC/CCAvenue (TID 76098022) & Worldline/Paynimo</span>
      </div>
    </header>
  );
};
