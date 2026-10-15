import React from 'react';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Layers, 
  ShieldCheck, 
  FileText, 
  ArrowRight,
  ExternalLink,
  Building,
  HelpCircle,
  Sparkles,
  KeyRound,
  AlertTriangle
} from 'lucide-react';

interface StakeholderDemoGuideProps {
  onLaunchScenario: (scenario: 'worldline_sandbox' | 'ccavenue_audit' | 'simulator_success' | 'simulator_failed' | 'simulator_pending') => void;
  onOpenAdmin: () => void;
  onOpenApps: () => void;
}

export const StakeholderDemoGuide: React.FC<StakeholderDemoGuideProps> = ({
  onLaunchScenario,
  onOpenAdmin,
  onOpenApps,
}) => {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Executive Overview Header */}
      <div className="bg-gradient-to-r from-[#002b49] via-[#003860] to-[#044e82] text-white rounded-2xl p-6 sm:p-8 shadow-md border border-[#0d5284]">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
              Phase 2 Upgrade
            </span>
            <span className="text-white/40">·</span>
            <span className="text-emerald-300 font-mono text-xs font-semibold">
              Genuine Sandbox Gateway Integration & Phase 1 Preservation
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-2">
            AIMA Payment Gateway Architecture & Sandbox Guide
          </h2>
          <p className="text-sm text-slate-200 leading-relaxed">
            This upgraded release introduces <strong>genuine sandbox transaction processing</strong> with server-side 
            SHA-256 tokenization for <strong>Worldline / Paynimo</strong>, security audit guardrails for <strong>CCAvenue</strong>, 
            and preserves the full <strong>Phase 1 Presentation Simulator</strong> for executive demos.
          </p>
        </div>
      </div>

      {/* Primary Demonstration Scenarios */}
      <div>
        <h3 className="text-base font-bold text-slate-900 tracking-tight mb-3 flex items-center gap-2">
          <span>Demonstration & Testing Scenarios</span>
          <span className="text-xs font-normal text-slate-500 font-mono">(1-Click Preset Launchers)</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Scenario 1: Worldline Genuine Sandbox */}
          <div className="bg-white rounded-xl border-2 border-emerald-300 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-bl">
              Genuine Sandbox
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-extrabold uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  Scenario 1
                </span>
                <KeyRound className="w-4 h-4 text-emerald-600" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Worldline / Paynimo Sandbox Payment
              </h4>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Processes a real sandbox transaction using AIMA test credentials (<strong>Merchant: T945221</strong>, <strong>Scheme: FIRST</strong>).
              </p>
              <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc list-inside mb-4">
                <li>Server generates secure SHA-256 token</li>
                <li>Scales nominal fee to ₹2.00 sandbox test charge</li>
                <li>Authenticates via test bank login (<strong className="text-slate-900">test / test</strong>)</li>
                <li>Validates verified response code <strong className="text-slate-900">0300</strong></li>
                <li>Updates originating portal without simulation override</li>
              </ul>
            </div>

            <button
              onClick={() => onLaunchScenario('worldline_sandbox')}
              className="w-full py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch Worldline Sandbox</span>
            </button>
          </div>

          {/* Scenario 2: HDFC / CCAvenue Live Kit */}
          <div className="bg-white rounded-xl border-2 border-blue-400 p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-blue-800 text-white text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-bl">
              Live Kit Active
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-extrabold uppercase font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                  Scenario 2
                </span>
                <ShieldCheck className="w-4 h-4 text-blue-700" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                HDFC / CCAvenue Live Kit Payment
              </h4>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Processes transaction using verified HDFC credentials (<strong>Acct: 4168947</strong>, <strong>TID: 76098022</strong>, <strong>ME: GPY451</strong>).
              </p>
              <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc list-inside mb-4">
                <li>Server generates AES-128-CBC cipher using MD5 working key</li>
                <li>HDFC NetBanking & Cards test options per bank instructions</li>
                <li>Targets post action URL: <strong className="font-mono text-slate-900">secure.ccavenue.com</strong></li>
                <li>Verifies encrypted response payload (<code className="font-mono">encResp</code>)</li>
                <li>Status API check via <strong className="font-mono text-slate-900">DoWebTrans</strong></li>
              </ul>
            </div>

            <button
              onClick={() => onLaunchScenario('ccavenue_audit')}
              className="w-full py-2.5 px-3 bg-blue-900 hover:bg-blue-950 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch CCAvenue Payment</span>
            </button>
          </div>

          {/* Scenario 3: Phase 1 Presentation Simulator */}
          <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-extrabold uppercase font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                  Scenario 3
                </span>
                <Sparkles className="w-4 h-4 text-blue-600" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">
                Phase 1 Presentation Simulator
              </h4>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Preserved 4-state manual demonstrator for non-technical council members and executive meetings.
              </p>
              <ul className="text-[11px] text-slate-600 space-y-1.5 list-disc list-inside mb-4">
                <li>Instant 1-click test triggers for all 4 states</li>
                <li>Simulate Success, Failure, Pending, Cancelled</li>
                <li>Clearly marked as <strong className="text-slate-900">DEMO ONLY</strong></li>
                <li>Generates official printable demo receipt</li>
              </ul>
            </div>

            <button
              onClick={() => onLaunchScenario('simulator_success')}
              className="w-full py-2.5 px-3 bg-[#002b49] hover:bg-[#003860] text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Launch Demo Simulator</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gateway Integration Status & Blocker Ledger */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
          Gateway Integration Audit & Environment Ledger
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">Gateway</th>
                <th className="py-2.5 px-3">Environment</th>
                <th className="py-2.5 px-3">Configuration Status</th>
                <th className="py-2.5 px-3">Live Sandbox Execution</th>
                <th className="py-2.5 px-3">Protocol / Blocker Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3 px-3 font-bold text-slate-900">Worldline / Paynimo</td>
                <td className="py-3 px-3 font-mono text-emerald-700">sandbox</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase">
                    Sandbox Configured
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-emerald-700">Ready (₹1–₹10 Range)</td>
                <td className="py-3 px-3 text-[11px] text-slate-600">
                  Using Paynimo Checkout protocol with server-side SHA-256 tokenization and dual verification. Test bank credentials: <strong className="font-mono">test / test</strong>.
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-bold text-slate-900">HDFC / CCAvenue</td>
                <td className="py-3 px-3 font-mono text-blue-700">live-kit</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                    Live Kit Configured
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-blue-700">Ready (HDFC Attachment)</td>
                <td className="py-3 px-3 text-[11px] text-slate-600">
                  Configured with Account 4168947, TID 76098022, Access Code AVXO66MD08BH79OXHB, Working Key 4BF2B1F093D075D5BE502B3190029C2D. AES-128-CBC encryption and DoWebTrans verified.
                </td>
              </tr>

              <tr>
                <td className="py-3 px-3 font-bold text-slate-900">Demo Simulator</td>
                <td className="py-3 px-3 font-mono text-blue-700">simulated</td>
                <td className="py-3 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                    Demo Ready
                  </span>
                </td>
                <td className="py-3 px-3 font-bold text-blue-700">Preserved (Phase 1)</td>
                <td className="py-3 px-3 text-[11px] text-slate-600">
                  Full 4-outcome interactive demonstrator for presentations. Distinctly stamped as DEMO ONLY. Cannot overwrite genuine gateway records.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Sandbox Testing Procedure Walkthrough */}
      <div className="bg-slate-900 text-slate-200 rounded-xl p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <h4 className="font-bold text-sm text-white">
              Manual Sandbox Test Procedure (Step-by-Step)
            </h4>
          </div>
          <span className="text-[11px] font-mono text-amber-400">Merchant Code: T945221</span>
        </div>

        <ol className="space-y-3 text-xs text-slate-300 list-decimal list-inside leading-relaxed">
          <li>
            Navigate to <strong>Applications</strong> and select <strong className="text-white">Management Aptitude Test (MAT)</strong> or any program.
          </li>
          <li>
            On the Centralized Payment Page, select the <strong className="text-emerald-300">Worldline / Paynimo — Sandbox</strong> card.
          </li>
          <li>
            Notice the test amount scaling indicator: nominal fee (₹3,500) will be charged as <strong className="font-mono text-white">₹2.00 INR</strong> in the sandbox switch to satisfy the ₹1–₹10 test ceiling.
          </li>
          <li>
            Click <strong className="text-white">Initiate Worldline Sandbox</strong>. The server computes the SHA-256 token using <code className="text-amber-300 font-mono">WORLDLINE_SALT</code>.
          </li>
          <li>
            In the genuine sandbox switch, review the pre-filled test bank credentials: <strong className="text-white font-mono">Username: test / Password: test</strong>.
          </li>
          <li>
            Click <strong className="text-emerald-300">Authorize Sandbox Payment</strong>. The switch executes the callback with status code <code className="text-amber-300 font-mono">0300</code>.
          </li>
          <li>
            Inspect the resulting <strong className="text-white">Verified Sandbox Receipt</strong> (with actual bank reference and auth code) and click <strong className="text-white">Return to Application</strong> to see MAT Admit Card issuance!
          </li>
        </ol>
      </div>
    </div>
  );
};
