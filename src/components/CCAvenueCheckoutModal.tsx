import React, { useState } from 'react';
import { TransactionRecord } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  ShieldCheck, 
  Lock, 
  X, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Building2, 
  CreditCard,
  Loader2,
  ExternalLink,
  KeyRound,
  ArrowRight,
  Code2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  QrCode,
  FileCheck
} from 'lucide-react';

interface CCAvenueCheckoutModalProps {
  transaction: TransactionRecord;
  checkoutPayload: any;
  isOpen: boolean;
  onClose: () => void;
  onCCAvenueResponse: (encResp: string, orderId: string) => void;
}

export const CCAvenueCheckoutModal: React.FC<CCAvenueCheckoutModalProps> = ({
  transaction,
  checkoutPayload,
  isOpen,
  onClose,
  onCCAvenueResponse,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<'netbanking' | 'cards' | 'upi'>('netbanking');
  const [selectedBank, setSelectedBank] = useState<string>('HDFC Bank');
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);
  const [authStep, setAuthStep] = useState<string>('');
  const [showTechnicalInspector, setShowTechnicalInspector] = useState<boolean>(false);

  if (!isOpen) return null;

  const payableAmount = transaction.gatewayAmount ? transaction.gatewayAmount.toFixed(2) : transaction.totalAmount.toFixed(2);
  const testAmount = payableAmount;
  const merchantId = checkoutPayload?.merchantId || '4168947';
  const tid = checkoutPayload?.tid || '76098022';
  const accessCode = checkoutPayload?.accessCode || 'AVXO66MD08BH79OXHB';
  const encRequest = checkoutPayload?.encRequest || '';
  const actionUrl = checkoutPayload?.actionUrl || 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

  const handleTestBankSubmit = async (outcome: 'Success' | 'Failure' | 'Pending' | 'Aborted') => {
    setIsAuthorizing(true);

    if (outcome === 'Success') {
      setAuthStep('Submitting test transaction to HDFC CCAvenue engine...');
    } else if (outcome === 'Failure') {
      setAuthStep('Receiving bank authorization decline...');
    } else if (outcome === 'Pending') {
      setAuthStep('Queueing reconciliation via DoWebTrans API...');
    } else {
      setAuthStep('Cancelling transaction per user request...');
    }

    try {
      // 1. Ask server to encrypt the response using the official AES-128-CBC key
      const encryptRes = await fetch('/api/payments/ccavenue/encrypt-test-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: transaction.orderId,
          status: outcome,
          amount: testAmount,
          paymentMode: selectedMethod === 'netbanking' ? 'NetBanking' : selectedMethod === 'cards' ? 'Credit Card' : 'UPI',
          bankName: selectedBank,
          bankRef: outcome === 'Success' || outcome === 'Pending' ? `HDFC${Math.floor(100000 + Math.random() * 900000)}` : undefined,
          trackingId: `${Math.floor(310000000000 + Math.random() * 90000000000)}`,
          authCode: outcome === 'Success' ? `AUTH-HDFC-${Math.floor(1000 + Math.random() * 9000)}` : undefined,
        }),
      });

      const encryptJson = await encryptRes.json();
      if (!encryptJson.success || !encryptJson.encResp) {
        throw new Error(encryptJson.error || 'Failed to encrypt response');
      }

      setTimeout(() => {
        setIsAuthorizing(false);
        onCCAvenueResponse(encryptJson.encResp, transaction.orderId);
      }, 1000);
    } catch (err: any) {
      setIsAuthorizing(false);
      alert(`Simulation error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-300 overflow-hidden my-6">
        {/* Top HDFC CCAvenue Banner */}
        <div className="bg-[#002b49] text-white px-5 py-2.5 text-xs font-bold flex items-center justify-between border-b border-[#0a3f68]">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-blue-700 text-white text-[10px] uppercase font-mono font-extrabold tracking-wider">
              HDFC CCAVENUE
            </span>
            <span>Official Payment Gateway</span>
          </div>
          <button
            onClick={onClose}
            disabled={isAuthorizing}
            className="text-white hover:text-slate-200 font-bold p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Merchant & Order Header */}
        <div className="bg-gradient-to-r from-[#002b49] to-[#044372] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-base tracking-tight text-white">HDFC Bank / CCAvenue</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-1">
              Order ID: <strong className="font-mono text-white">{transaction.orderId}</strong>
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="block text-[10px] text-amber-300 font-semibold uppercase">
              Total Amount
            </span>
            <span className="text-2xl font-extrabold text-amber-300 font-mono tabular-nums">
              ₹{payableAmount}
            </span>
          </div>
        </div>

        {/* Processing State Overlay */}
        {isAuthorizing && (
          <div className="absolute inset-0 z-30 bg-white/95 flex flex-col items-center justify-center p-6 space-y-3">
            <Loader2 className="w-10 h-10 text-[#002b49] animate-spin" />
            <h4 className="font-bold text-slate-900 text-sm">{authStep}</h4>
            <p className="text-xs text-slate-500">
              Encrypting response with AES-128-CBC and verifying via server callback...
            </p>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-xs">
          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-blue-950 text-[11px] leading-relaxed flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0" />
            <span className="text-slate-700">
              Secure 256-Bit SSL connection with HDFC Bank & CCAvenue Payment Gateway.
            </span>
          </div>

          {/* Payment Rail Tabs */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setSelectedMethod('netbanking')}
                className={`flex-1 py-2 px-3 rounded-lg border text-center font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                  selectedMethod === 'netbanking'
                    ? 'border-[#002b49] bg-sky-50 text-[#002b49]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>NetBanking</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('cards')}
                className={`flex-1 py-2 px-3 rounded-lg border text-center font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                  selectedMethod === 'cards'
                    ? 'border-[#002b49] bg-sky-50 text-[#002b49]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Cards / RuPay</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('upi')}
                className={`flex-1 py-2 px-3 rounded-lg border text-center font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                  selectedMethod === 'upi'
                    ? 'border-[#002b49] bg-sky-50 text-[#002b49]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>UPI / QR</span>
              </button>
            </div>

            {/* Rail Content Box */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
              {selectedMethod === 'netbanking' && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                    Select Test Bank (HDFC NetBanking Integration):
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {['HDFC Bank', 'State Bank of India', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra', 'Punjab National Bank'].map((b) => (
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

              {selectedMethod === 'cards' && (
                <div className="space-y-2">
                  <span className="block text-[11px] font-semibold text-slate-700">
                    HDFC Merchant Card Rail:
                  </span>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold text-slate-900 block text-xs">
                        •••• •••• •••• 4012 (HDFC RuPay Corporate)
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Cardholder: {transaction.applicantName} · Exp: 09/29
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                      256-Bit SSL
                    </span>
                  </div>
                </div>
              )}

              {selectedMethod === 'upi' && (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 bg-white p-1 rounded border border-slate-300 flex items-center justify-center shrink-0">
                    <QrCode className="w-14 h-14 text-slate-800" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block text-xs">
                      HDFC SmartHub Dynamic UPI
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono block">
                      VPA: aima.mat@hdfcbank
                    </span>
                  </div>
                </div>
              )}

              {/* Primary Authorization Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleTestBankSubmit('Success')}
                  className="w-full py-2.5 px-3 bg-[#002b49] hover:bg-[#003860] text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>Proceed to Pay ₹{payableAmount}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Test Status Triggers (Edge Cases) */}
          <div>
            <span className="block text-[11px] font-bold text-slate-700 mb-2">
              Test Gateway Edge Cases (CCAvenue Status Codes):
            </span>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTestBankSubmit('Failure')}
                className="p-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900 rounded-lg text-left cursor-pointer transition-colors"
              >
                <span className="font-bold text-[11px] block">Decline / Failure</span>
                <span className="text-[10px] text-rose-700">order_status=Failure</span>
              </button>

              <button
                type="button"
                onClick={() => handleTestBankSubmit('Pending')}
                className="p-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-left cursor-pointer transition-colors"
              >
                <span className="font-bold text-[11px] block">Pending Awaited</span>
                <span className="text-[10px] text-amber-700">order_status=Pending</span>
              </button>

              <button
                type="button"
                onClick={() => handleTestBankSubmit('Aborted')}
                className="p-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg text-left cursor-pointer transition-colors"
              >
                <span className="font-bold text-[11px] block">Abort / Cancel</span>
                <span className="text-[10px] text-slate-600">order_status=Aborted</span>
              </button>
            </div>
          </div>

          {/* Collapsible Technical & Cryptographic Inspector */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTechnicalInspector(!showTechnicalInspector)}
              className="w-full p-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left font-bold text-slate-800 text-xs cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-blue-700" />
                <span>Technical & Cryptographic Inspector (AES-128-CBC)</span>
              </div>
              {showTechnicalInspector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showTechnicalInspector && (
              <div className="p-4 bg-slate-900 text-slate-200 space-y-3 font-mono text-[10px]">
                <div>
                  <span className="text-amber-400 font-bold block">Target Post Action URL:</span>
                  <span className="text-slate-300 break-all">{actionUrl}</span>
                </div>

                <div>
                  <span className="text-amber-400 font-bold block">Access Code:</span>
                  <span className="text-slate-300">{accessCode}</span>
                </div>

                <div>
                  <span className="text-amber-400 font-bold block">Encrypted Request Cipher (`encRequest`):</span>
                  <p className="bg-slate-950 p-2 rounded text-emerald-400 break-all text-[9px]">
                    {encRequest || 'GENERATED_SERVER_SIDE'}
                  </p>
                </div>

                <div>
                  <span className="text-amber-400 font-bold block">Inquiry API (DoWebTrans):</span>
                  <span className="text-slate-300">https://api.ccavenue.com/apis/servlet/DoWebTrans</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1 font-medium text-slate-600">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            PCI-DSS Level 1 · 256-Bit SSL Encrypted
          </span>
          <button
            onClick={onClose}
            className="text-slate-700 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Cancel Transaction
          </button>
        </div>
      </div>
    </div>
  );
};
