import React, { useState, useEffect } from 'react';
import { AimaApplication, ApplicantPreset, PaymentGateway, GatewayStatusInfo } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  ShieldCheck, 
  Lock, 
  Building, 
  CreditCard, 
  CheckCircle2, 
  Info, 
  Clock, 
  ArrowLeft,
  ChevronRight,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ExternalLink,
  Layers,
  AlertTriangle
} from 'lucide-react';

interface CentralizedPaymentPageProps {
  application: AimaApplication;
  applicant: ApplicantPreset;
  orderId: string;
  selectedGateway: PaymentGateway;
  gatewayStatuses: { [key in PaymentGateway]?: GatewayStatusInfo };
  onSelectGateway: (gw: PaymentGateway) => void;
  onProceedToPay: (chosenGateway: PaymentGateway) => void;
  onBackToApps: () => void;
}

export const CentralizedPaymentPage: React.FC<CentralizedPaymentPageProps> = ({
  application,
  applicant,
  orderId,
  selectedGateway,
  gatewayStatuses,
  onSelectGateway,
  onProceedToPay,
  onBackToApps,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(898);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const currentStatusInfo = gatewayStatuses[selectedGateway];

  const getStatusBadge = (statusInfo?: GatewayStatusInfo) => {
    if (!statusInfo) return null;

    if (statusInfo.id === 'DEMO_SIMULATOR') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
          Demo Simulator
        </span>
      );
    }

    if (statusInfo.status === 'CONFIGURED') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Sandbox configured
        </span>
      );
    }

    if (statusInfo.status === 'INCOMPLETE') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
          <AlertCircle className="w-3 h-3" />
          Configuration incomplete
        </span>
      );
    }

    if (statusInfo.status === 'CONFIG_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
          <AlertCircle className="w-3 h-3" />
          Sandbox configuration required
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-800">
        <AlertTriangle className="w-3 h-3" />
        Integration error
      </span>
    );
  };

  const isWorldline = selectedGateway === 'WORLDLINE_PAYNIMO';
  const isCCAvenue = selectedGateway === 'CCAVENUE';
  const isSimulator = selectedGateway === 'DEMO_SIMULATOR';

  const wlStatus = gatewayStatuses['WORLDLINE_PAYNIMO'];
  const ccStatus = gatewayStatuses['CCAVENUE'];
  const simStatus = gatewayStatuses['DEMO_SIMULATOR'];

  // Worldline & CCAvenue test transactions scale to ₹2.00 test charges
  const actualGatewayCharge = (isWorldline || isCCAvenue) ? 2.0 : applicant.totalAmount;  const isAutoRouted = application.routingMode !== 'USER_SELECTABLE';

  useEffect(() => {
    if (isAutoRouted && application.assignedGateway && selectedGateway !== application.assignedGateway) {
      onSelectGateway(application.assignedGateway);
    }
  }, [application, isAutoRouted, selectedGateway, onSelectGateway]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 text-xs">
        <button
          onClick={onBackToApps}
          className="inline-flex items-center gap-1.5 text-slate-600 hover:text-[#002b49] font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Applications</span>
        </button>

        <div className="flex items-center gap-4 text-slate-500">
          <div className="flex items-center gap-1.5 text-slate-700 font-mono">
            <span>Order ID:</span>
            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {orderId}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>Session: {formattedTime}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Order Details & Gateway Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 cols): Order Summary & Candidate Details */}
        <div className="lg:col-span-7 space-y-6">
          {/* Institutional Trust Banner */}
          <div className="bg-slate-900 text-white p-5 rounded-xl border border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                Official AIMA Central Payment Service
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                256-Bit SSL Encrypted
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {application.name}
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Originating Portal: <span className="text-amber-300 font-mono">{application.portalUrl}</span>
            </p>
          </div>

          {/* Applicant & Reference Information */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Applicant & Registration Particulars</span>
              <span className="text-[11px] font-normal text-slate-500 font-mono">Verified Candidate Dossier</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="block text-slate-500 text-[11px]">Applicant / Entity Name</span>
                <span className="font-bold text-slate-900 text-sm">{applicant.name}</span>
              </div>
              <div>
                <span className="block text-slate-500 text-[11px]">Application Reference Number</span>
                <span className="font-mono font-bold text-blue-900 text-sm bg-blue-50 px-2 py-0.5 rounded inline-block">
                  {applicant.refNo}
                </span>
              </div>
              <div>
                <span className="block text-slate-500 text-[11px]">Email Address</span>
                <span className="font-medium text-slate-800">{applicant.email}</span>
              </div>
              <div>
                <span className="block text-slate-500 text-[11px]">Registered Mobile Number</span>
                <span className="font-mono text-slate-800">{applicant.phone}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-xs">
              <span className="block text-slate-500 text-[11px]">Program / Module Description</span>
              <p className="font-medium text-slate-900 mt-0.5">{applicant.courseOrEvent}</p>
            </div>
          </div>

          {/* Itemized Fee Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider pb-3 border-b border-slate-100">
              Tax Invoice & Fee Schedule (INR)
            </h3>

            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 text-slate-600">
                <div>
                  <span className="font-medium text-slate-900">{applicant.feeDescription}</span>
                  <span className="block text-[11px] text-slate-500">SAC Code: 999293 (Management Testing & Certification)</span>
                </div>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {formatINR(applicant.baseAmount)}
                </span>
              </div>

              {applicant.gstAmount > 0 ? (
                <>
                  <div className="flex items-center justify-between py-1 text-slate-600 border-t border-dashed border-slate-200">
                    <span className="text-slate-600">Central GST (CGST @ 9%)</span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      {formatINR(applicant.gstAmount / 2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-slate-600">
                    <span className="text-slate-600">State GST (SGST @ 9%)</span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      {formatINR(applicant.gstAmount / 2)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between py-1 text-slate-600 border-t border-dashed border-slate-200 text-[11px]">
                  <span className="text-slate-500">GST Exemption Status</span>
                  <span className="text-emerald-700 font-medium">Exempt (Entrance Examination Authority)</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t-2 border-slate-900 text-sm">
                <div>
                  <span className="font-extrabold text-slate-900">Total Program Fee</span>
                  <span className="block text-[10px] text-slate-500 uppercase">Inclusive of all applicable taxes</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-slate-900 font-mono tabular-nums">
                    {formatINR(applicant.totalAmount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Gateway Selection & Checkout CTA */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            {isAutoRouted ? (
              <div className="mb-4 pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#002b49]" />
                    <span>Assigned Gateway</span>
                  </h3>
                  <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                    {application.department || 'CME'} Policy
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Automatically routed to <strong>{selectedGateway === 'WORLDLINE_PAYNIMO' ? 'Worldline / Paynimo' : 'HDFC / CCAvenue'}</strong> by institutional policy.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Select Payment Mode / Gateway
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Choose between genuine gateway sandbox processing or presentation simulator:
                </p>
              </>
            )}

            {/* OPTION 1: Worldline / Paynimo — Sandbox */}
            {(!isAutoRouted || selectedGateway === 'WORLDLINE_PAYNIMO') && (
            <div
              onClick={() => onSelectGateway('WORLDLINE_PAYNIMO')}
              className={`p-4 rounded-xl border transition-all ${!isAutoRouted ? 'cursor-pointer hover:border-slate-300' : 'cursor-default'} mb-3 relative ${
                selectedGateway === 'WORLDLINE_PAYNIMO'
                  ? 'border-[#002b49] bg-sky-50/40 ring-2 ring-[#002b49]/20 shadow-sm'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                    WL
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900">
                        Worldline / Paynimo
                      </h4>
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        Sandbox
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Merchant: <strong className="font-mono text-slate-700">T945221</strong> · Scheme: <strong className="font-mono text-slate-700">FIRST</strong>
                    </span>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedGateway === 'WORLDLINE_PAYNIMO'
                      ? 'border-[#002b49] bg-[#002b49] text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {selectedGateway === 'WORLDLINE_PAYNIMO' && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-600">Test Range: ₹1–₹10 · NetBanking test/test</span>
                {getStatusBadge(wlStatus)}
              </div>
            </div>
            )}

            {/* OPTION 2: CCAvenue — HDFC Live Kit */}
            {(!isAutoRouted || selectedGateway === 'CCAVENUE') && (
            <div
              onClick={() => onSelectGateway('CCAVENUE')}
              className={`p-4 rounded-xl border transition-all ${!isAutoRouted ? 'cursor-pointer hover:border-slate-300' : 'cursor-default'} mb-3 relative ${
                selectedGateway === 'CCAVENUE'
                  ? 'border-[#002b49] bg-sky-50/40 ring-2 ring-[#002b49]/20 shadow-sm'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                    HDFC
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900">
                        HDFC / CCAvenue
                      </h4>
                      <span className="text-[10px] font-semibold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                        Live Kit
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Acct ID: <strong className="font-mono text-slate-700">4168947</strong> · TID: <strong className="font-mono text-slate-700">76098022</strong>
                    </span>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedGateway === 'CCAVENUE'
                      ? 'border-[#002b49] bg-[#002b49] text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {selectedGateway === 'CCAVENUE' && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-600">secure.ccavenue.com · NetBanking & Cards</span>
                {getStatusBadge(ccStatus)}
              </div>
            </div>
            )}

            {/* OPTION 3: Demo Simulator (Phase 1) — Only shown if not auto-routed */}
            {!isAutoRouted && (
            <div
              onClick={() => onSelectGateway('DEMO_SIMULATOR')}
              className={`p-4 rounded-xl border transition-all cursor-pointer relative ${
                selectedGateway === 'DEMO_SIMULATOR'
                  ? 'border-[#002b49] bg-sky-50/40 ring-2 ring-[#002b49]/20 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-800 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                    DEMO
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900">
                        Demo Simulator
                      </h4>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                        Presentation Mode
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Phase 1 Presentation flow (Success, Fail, Pending, Cancel)
                    </span>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    selectedGateway === 'DEMO_SIMULATOR'
                      ? 'border-[#002b49] bg-[#002b49] text-white'
                      : 'border-slate-300'
                  }`}
                >
                  {selectedGateway === 'DEMO_SIMULATOR' && <CheckCircle2 className="w-3.5 h-3.5" />}
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                <span className="text-slate-600">Simulate any gateway response state</span>
                {getStatusBadge(simStatus)}
              </div>
            </div>
            )}

            {/* Configuration Blocker Alert for CCAvenue */}
            {isCCAvenue && !ccStatus?.canProcessLiveSandbox && (
              <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Gateway Sandbox Configuration Required</span>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  {ccStatus?.blockerDetails || 'HDFC / CCAvenue sandbox credentials are not configured. The Payment Hub strictly prevents falling back to simulated success for genuine application payment orders.'}
                </p>
                <div className="text-[10px] text-rose-700 font-mono">
                  Missing variables: {ccStatus?.missingEnvVars.join(', ') || 'CCAVENUE_WORKING_KEY'}
                </div>
              </div>
            )}

            {/* Dynamic Status / Blocker Explanations */}
            {isWorldline && (
              <div className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Worldline Sandbox Active</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Per AIMA test kit specifications, test sandbox charges are restricted to <strong>₹1.00 – ₹10.00</strong>.
                  For this transaction, the nominal amount ({formatINR(applicant.totalAmount)}) will be charged at 
                  <strong className="font-mono text-emerald-950 font-bold"> ₹2.00 INR</strong> on the Worldline sandbox test switch.
                </p>
                <div className="pt-1 text-[10px] font-mono text-emerald-700">
                  Test credentials: Bank login: <strong className="text-emerald-950">test</strong> / Password: <strong className="text-emerald-950">test</strong>
                </div>
              </div>
            )}

            {isCCAvenue && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-950 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                  <span>HDFC Bank Live Kit Active</span>
                </div>
                <p className="text-[11px] text-blue-900 leading-relaxed">
                  Configured with verified HDFC Bank spreadsheet credentials (<strong>Acct ID: 4168947</strong>, <strong>TID: 76098022</strong>, <strong>ME: GPY451</strong>).
                  Per bank instruction, testing uses live test charge <strong className="font-mono text-blue-950 font-bold">₹2.00 INR</strong> with 128-bit AES encryption.
                </p>
                <div className="p-2 bg-white/80 rounded border border-blue-200 text-[10px] font-mono text-blue-900">
                  Access Code: AVXO66MD08BH79OXHB · Working Key: 4BF2B1F0... · Post: secure.ccavenue.com
                </div>
              </div>
            )}

            {isSimulator && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs text-blue-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-blue-900">
                  <Info className="w-3.5 h-3.5 text-blue-700" />
                  <span>Phase 1 Presentation Simulator</span>
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Allows stakeholders to manually demonstrate <strong>Success</strong>, <strong>Failure</strong>, 
                  <strong>Pending</strong>, and <strong>Cancellation</strong> states with full receipt generation 
                  and 2-way application callback simulation.
                </p>
              </div>
            )}

            {/* Prominent Checkout Button */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onProceedToPay(selectedGateway)}
                disabled={isCCAvenue && !ccStatus?.canProcessLiveSandbox}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide shadow-md transition-all flex items-center justify-center gap-2 ${
                  isCCAvenue && !ccStatus?.canProcessLiveSandbox
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-[#002b49] hover:bg-[#003860] active:scale-[0.99] text-white cursor-pointer group'
                }`}
              >
                <Lock className="w-4 h-4 text-amber-400 group-hover:text-amber-300" />
                <span>
                  {isWorldline
                    ? `Initiate Worldline Sandbox (₹${actualGatewayCharge.toFixed(2)})`
                    : isCCAvenue && !ccStatus?.canProcessLiveSandbox
                    ? 'Configuration Required'
                    : isCCAvenue
                    ? `Initiate HDFC / CCAvenue (₹${actualGatewayCharge.toFixed(2)})`
                    : `Launch Simulator (${formatINR(applicant.totalAmount)})`}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="mt-3 text-center">
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  PCI-DSS Level 1 · RBI Certified Tokenization · Sandbox Enforced
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
