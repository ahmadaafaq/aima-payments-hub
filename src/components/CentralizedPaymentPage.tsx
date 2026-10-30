import React, { useState, useEffect } from 'react';
import { AimaApplication, ApplicantPreset, PaymentGateway, GatewayStatusInfo } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  ShieldCheck, 
  Lock, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

interface CentralizedPaymentPageProps {
  application: AimaApplication;
  applicant: ApplicantPreset;
  orderId: string;
  selectedGateway: PaymentGateway;
  gatewayStatuses: { [key in PaymentGateway]?: GatewayStatusInfo };
  sessionReturnUrl?: string | null;
  expiresAt?: string;
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
  sessionReturnUrl,
  expiresAt,
  onSelectGateway,
  onProceedToPay,
  onBackToApps,
}) => {
  const calculateRemainingSeconds = () => {
    if (!expiresAt) return 898;
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  };

  const [timeLeft, setTimeLeft] = useState<number>(calculateRemainingSeconds);
  const [isExpired, setIsExpired] = useState<boolean>(() => calculateRemainingSeconds() <= 0);

  useEffect(() => {
    const remaining = calculateRemainingSeconds();
    setTimeLeft(remaining);
    if (remaining <= 0) {
      setIsExpired(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  useEffect(() => {
    // If no gateway is selected yet, default to application's assigned gateway
    if (!selectedGateway && application.assignedGateway) {
      onSelectGateway(application.assignedGateway);
    }
  }, [application, selectedGateway, onSelectGateway]);

  const handleCancelAndReturn = () => {
    if (!sessionReturnUrl) {
      onBackToApps();
      return;
    }

    if (window.confirm(`Are you sure you want to cancel payment and return to ${application.name}?`)) {
      try {
        const target = new URL(sessionReturnUrl);
        target.searchParams.set('orderId', orderId);
        target.searchParams.set('reference', applicant.refNo);
        target.searchParams.set('status', 'CANCELLED');
        target.searchParams.set('reason', 'USER_CANCELLED');
        target.searchParams.set('amount', String(applicant.totalAmount));
        window.location.href = target.toString();
      } catch {
        window.location.href = sessionReturnUrl;
      }
    }
  };

  const handleExpiredReturn = () => {
    if (!sessionReturnUrl) {
      onBackToApps();
      return;
    }

    try {
      const target = new URL(sessionReturnUrl);
      target.searchParams.set('orderId', orderId);
      target.searchParams.set('reference', applicant.refNo);
      target.searchParams.set('status', 'FAILED');
      target.searchParams.set('reason', 'SESSION_EXPIRED');
      target.searchParams.set('amount', String(applicant.totalAmount));
      window.location.href = target.toString();
    } catch {
      window.location.href = sessionReturnUrl;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto relative">
      {/* Top Breadcrumb & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 text-xs">
        {sessionReturnUrl ? (
          <button
            type="button"
            onClick={handleCancelAndReturn}
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-rose-700 font-semibold cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Cancel & Return to {application.name}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onBackToApps}
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-[#002b49] font-semibold cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to {application?.name || 'Application'}</span>
          </button>
        )}

        <div className="flex items-center gap-4 text-slate-500">
          <div className="flex items-center gap-1.5 text-slate-700 font-mono">
            <span>Order ID:</span>
            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {orderId}
            </span>
          </div>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded border font-mono ${
            timeLeft < 120 
              ? 'text-rose-700 bg-rose-50 border-rose-300 animate-pulse' 
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}>
            <Clock className="w-3.5 h-3.5" />
            <span>Session: {formattedTime}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Order Details & Payment CTA */}
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
                <span className="font-mono text-slate-800">{applicant.phone || '—'}</span>
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

        {/* Right Column (5 cols): Clean Payment Action Card (No fake mode selection) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Payment Summary
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Verified & Secured
              </span>
            </div>

            {/* Concise Order Summary */}
            <div className="space-y-3 mb-6 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Application Reference:</span>
                <span className="font-mono font-bold text-slate-900">{applicant.refNo}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Order Identifier:</span>
                <span className="font-mono font-semibold text-slate-800">{orderId}</span>
              </div>
              <div className="flex items-center justify-between text-slate-700 pt-3 border-t border-slate-100">
                <span className="font-bold">Total Payable Amount:</span>
                <span className="text-2xl font-black text-[#002b49] font-mono tabular-nums">
                  {formatINR(applicant.totalAmount)}
                </span>
              </div>
            </div>

            {/* Gateway Selection Switch */}
            <div className="mb-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Select Payment Processor
                </span>
                <span className="text-[10px] text-amber-600 font-medium">Sandbox Testbed</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Worldline Paynimo Option */}
                <button
                  type="button"
                  onClick={() => onSelectGateway('WORLDLINE_PAYNIMO')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    selectedGateway === 'WORLDLINE_PAYNIMO'
                      ? 'border-[#002b49] bg-blue-50/80 ring-2 ring-[#002b49]/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900">Worldline</span>
                    {selectedGateway === 'WORLDLINE_PAYNIMO' && (
                      <CheckCircle2 className="w-4 h-4 text-[#002b49]" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block leading-tight">Paynimo SDK (Ingenico)</span>
                </button>

                {/* HDFC Collect Now Option */}
                <button
                  type="button"
                  onClick={() => onSelectGateway('CCAVENUE')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    selectedGateway === 'CCAVENUE'
                      ? 'border-[#002b49] bg-blue-50/80 ring-2 ring-[#002b49]/20 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900">HDFC Bank</span>
                    {selectedGateway === 'CCAVENUE' && (
                      <CheckCircle2 className="w-4 h-4 text-[#002b49]" />
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 block leading-tight">Collect Now (Razorpay)</span>
                </button>
              </div>
            </div>

            {/* Prominent Checkout Button */}
            <div>
              <button
                type="button"
                onClick={() => onProceedToPay(selectedGateway)}
                disabled={isExpired}
                className="w-full py-4 px-4 rounded-xl font-bold text-base tracking-wide shadow-md transition-all flex items-center justify-center gap-2 bg-[#002b49] hover:bg-[#003860] active:scale-[0.99] text-white cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4 text-amber-400 group-hover:text-amber-300" />
                <span>
                  Proceed via {selectedGateway === 'WORLDLINE_PAYNIMO' ? 'Worldline Paynimo' : 'HDFC Collect Now'} ({formatINR(applicant.totalAmount)})
                </span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <div className="mt-4 text-center space-y-1.5">
                <p className="text-xs text-slate-600 font-medium">
                  Accepts Credit / Debit Cards, Net Banking, UPI & Wallets
                </p>
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  PCI-DSS Level 1 · RBI Certified Tokenization · 256-Bit SSL Secured
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Standard Banking Session Expired Modal Overlay */}
      {isExpired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-2xl border border-slate-200 space-y-5">
            <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center shadow-inner">
              <Clock className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-slate-900">
                Payment Session Expired
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                For security reasons, your 15-minute checkout session has expired. No amount has been deducted from your bank account or card.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-600 space-y-1 text-left">
              <div className="flex justify-between">
                <span>Order ID:</span>
                <span className="font-bold text-slate-900">{orderId}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span className="font-bold text-rose-600">SESSION_EXPIRED</span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleExpiredReturn}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-xs bg-[#002b49] hover:bg-[#003860] text-white transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <span>{sessionReturnUrl ? `Return to ${application.name}` : 'Start New Session'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
