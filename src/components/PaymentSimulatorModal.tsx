import React, { useState } from 'react';
import { AimaApplication, ApplicantPreset, PaymentGateway, PaymentStatus } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  ShieldCheck, 
  Lock, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  CreditCard, 
  QrCode, 
  Building2, 
  Smartphone,
  Loader2,
  HelpCircle,
  Sparkles
} from 'lucide-react';

interface PaymentSimulatorModalProps {
  application: AimaApplication;
  applicant: ApplicantPreset;
  orderId: string;
  gateway: PaymentGateway;
  isOpen: boolean;
  onClose: () => void;
  onCompleteSimulation: (
    status: PaymentStatus,
    paymentMode: 'NetBanking' | 'Credit Card' | 'Debit Card' | 'UPI' | 'Corporate NB',
    bankName: string,
    reason?: string
  ) => void;
}

export const PaymentSimulatorModal: React.FC<PaymentSimulatorModalProps> = ({
  application,
  applicant,
  orderId,
  gateway,
  isOpen,
  onClose,
  onCompleteSimulation,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'netbanking' | 'upi' | 'card'>('netbanking');
  const [selectedBank, setSelectedBank] = useState<string>('HDFC Bank');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  if (!isOpen) return null;

  const gatewayName = gateway === 'CCAVENUE' ? 'HDFC Bank / CCAvenue' : gateway === 'WORLDLINE_PAYNIMO' ? 'Worldline / Paynimo' : 'AIMA Presentation Simulator';
  const tid = gateway === 'CCAVENUE' ? '76098022' : gateway === 'WORLDLINE_PAYNIMO' ? 'WL-MUM-99182' : 'SIM-DEMO-01';
  const acctId = gateway === 'CCAVENUE' ? '4168947' : gateway === 'WORLDLINE_PAYNIMO' ? 'WL-AIMA-MAIN' : 'AIMA-SIMULATOR';

  const triggerOutcome = (
    status: PaymentStatus,
    reason?: string
  ) => {
    setIsProcessing(true);

    if (status === 'SUCCESS') {
      setProcessingStatus('Authorizing payment with issuing bank...');
    } else if (status === 'FAILED') {
      setProcessingStatus('Receiving bank response...');
    } else if (status === 'PENDING') {
      setProcessingStatus('Queueing two-step bank reconciliation...');
    } else {
      setProcessingStatus('Cancelling gateway checkout session...');
    }

    setTimeout(() => {
      let mode: 'NetBanking' | 'Credit Card' | 'Debit Card' | 'UPI' | 'Corporate NB' = 'NetBanking';
      if (selectedMethod === 'upi') mode = 'UPI';
      if (selectedMethod === 'card') mode = 'Credit Card';

      setIsProcessing(false);
      onCompleteSimulation(status, mode, selectedBank, reason);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-300 overflow-hidden my-6">
        {/* Top Demo Warning Ribbon */}
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 text-[10px] uppercase font-mono tracking-wider">
              Demo Simulator
            </span>
            <span>Stakeholder Evaluation Environment · No Real Card/Bank Data Collected</span>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-900 hover:text-black font-bold p-0.5 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gateway Header Banner */}
        <div className="bg-[#002b49] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white text-[#002b49] font-extrabold flex items-center justify-center text-xs shadow-inner">
              {gateway === 'CCAVENUE' ? 'HDFC' : gateway === 'WORLDLINE_PAYNIMO' ? 'WL' : 'SIM'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight text-white">{gatewayName}</h3>
                <span className="text-[10px] text-amber-300 font-mono">TID: {tid}</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Merchant: All India Management Association (Acct: {acctId})
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="block text-[11px] text-slate-300 font-mono">Order: {orderId}</span>
            <span className="text-lg font-extrabold text-amber-300 font-mono tabular-nums">
              {formatINR(applicant.totalAmount)}
            </span>
          </div>
        </div>

        {/* Processing State Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-20 bg-white/95 flex flex-col items-center justify-center p-6 space-y-4">
            <Loader2 className="w-10 h-10 text-[#002b49] animate-spin" />
            <div className="text-center">
              <h4 className="font-bold text-slate-900 text-base">{processingStatus}</h4>
              <p className="text-xs text-slate-500 mt-1">
                Simulating secure gateway API handshake with AIMA Central Hub...
              </p>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 text-xs">
          {/* Simulated Payment Channel Selector */}
          <div>
            <label className="block font-bold text-slate-800 text-xs mb-2">
              Select Simulated Payment Rail:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedMethod('netbanking')}
                className={`py-2 px-3 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-colors ${
                  selectedMethod === 'netbanking'
                    ? 'border-[#002b49] bg-sky-50/50 text-[#002b49] font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4 text-[#002b49]" />
                <span>NetBanking</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('upi')}
                className={`py-2 px-3 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-colors ${
                  selectedMethod === 'upi'
                    ? 'border-[#002b49] bg-sky-50/50 text-[#002b49] font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>UPI / QR</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('card')}
                className={`py-2 px-3 rounded-lg border text-left flex items-center gap-2 cursor-pointer transition-colors ${
                  selectedMethod === 'card'
                    ? 'border-[#002b49] bg-sky-50/50 text-[#002b49] font-bold'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-amber-600" />
                <span>Cards / RuPay</span>
              </button>
            </div>
          </div>

          {/* Rail Details Box */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            {selectedMethod === 'netbanking' && (
              <div className="space-y-3">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  Select Simulated Bank (50+ Indian Banks Integrated):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Punjab National Bank', 'Kotak Mahindra'].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setSelectedBank(b)}
                      className={`p-2 rounded border text-left text-xs transition-colors cursor-pointer ${
                        selectedBank === b
                          ? 'border-[#002b49] bg-white font-bold text-[#002b49] shadow-xs'
                          : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedMethod === 'upi' && (
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white p-2 rounded-lg border border-slate-300 flex items-center justify-center shrink-0">
                  <QrCode className="w-16 h-16 text-slate-800" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 block text-xs">
                    Simulated Dynamic UPI QR
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Scan with any UPI app (Google Pay, PhonePe, Paytm, BHIM).
                    VPA: <span className="font-mono text-slate-800">aima.central@hdfcbank</span>
                  </p>
                </div>
              </div>
            )}

            {selectedMethod === 'card' && (
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  Simulated Tokenized Card Rail:
                </span>
                <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-800">
                      •••• •••• •••• 4012 (Demo RuPay / Visa)
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      Cardholder: {applicant.name} · Expiry: 12/28
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    Tokenized
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* PRESENTER SIMULATION CONTROL DECK */}
          <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-amber-400">
                  Presenter Simulation Controls
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Click any outcome to demonstrate</span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              As requested for stakeholder demonstration, trigger the gateway response states to test how 
              AIMA Central Payment Hub and the originating application handle each scenario:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {/* Outcome 1: SUCCESS */}
              <button
                type="button"
                onClick={() => triggerOutcome('SUCCESS')}
                className="p-3 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/70 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Simulate Payment SUCCESS</span>
                </div>
                <p className="text-[10px] text-emerald-200/70 mt-1 pl-6">
                  Issues Bank Auth Code, settles order & marks record as PAID
                </p>
              </button>

              {/* Outcome 2: FAILED */}
              <button
                type="button"
                onClick={() =>
                  triggerOutcome(
                    'FAILED',
                    'Card/Netbanking transaction declined by issuing bank (Insufficient balance / authorization error)'
                  )
                }
                className="p-3 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600/70 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 text-rose-300 font-bold text-xs">
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Simulate Payment FAILED</span>
                </div>
                <p className="text-[10px] text-rose-200/70 mt-1 pl-6">
                  Simulates bank rejection; provides retry token & logs failure audit
                </p>
              </button>

              {/* Outcome 3: PENDING */}
              <button
                type="button"
                onClick={() =>
                  triggerOutcome(
                    'PENDING',
                    'Two-step verification pending bank reconciliation. Status API DoWebTrans will query gateway.'
                  )
                }
                className="p-3 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-600/70 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Simulate Payment PENDING</span>
                </div>
                <p className="text-[10px] text-amber-200/70 mt-1 pl-6">
                  Awaits bank clearance; demonstrates background reconciliation SLA
                </p>
              </button>

              {/* Outcome 4: CANCELLED */}
              <button
                type="button"
                onClick={() =>
                  triggerOutcome('CANCELLED', 'User voluntarily cancelled transaction at checkout')
                }
                className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2 text-slate-300 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Simulate Payment CANCELLED</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 pl-6">
                  User aborted checkout; safe return with application state preserved
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span className="font-mono">CCAvenue Production URL Reference: DoWebTrans API</span>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="text-slate-700 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Abort & Return
          </button>
        </div>
      </div>
    </div>
  );
};
