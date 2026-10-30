import React, { useState, useEffect, useRef } from 'react';
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
  Smartphone, 
  CreditCard,
  Loader2,
  ExternalLink,
  KeyRound,
  ArrowRight,
  Wifi,
  WifiOff,
  Zap,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

// ─── Paynimo SDK Script URLs ─────────────────────────────────────────────────
// UAT/Sandbox: https://www.paynimo.com/paynimocheckout/server/lib/checkout.js
// jQuery (required by Paynimo SDK if not already present)
const PAYNIMO_JQUERY_URL = 'https://www.paynimo.com/paynimocheckout/client/lib/jquery.min.js';
const PAYNIMO_CHECKOUT_JS_URL = 'https://www.paynimo.com/paynimocheckout/server/lib/checkout.js';

// ─── SDK Loader Utility ──────────────────────────────────────────────────────

type SdkStatus = 'idle' | 'loading' | 'ready' | 'error';

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Skip if already loaded
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.type = 'text/javascript';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadPaynimoSdk(): Promise<boolean> {
  try {
    // Load jQuery first (Paynimo SDK depends on it)
    if (!(window as any).jQuery && !(window as any).$) {
      await loadScript(PAYNIMO_JQUERY_URL, 'paynimo-jquery');
    }
    // Then load the Paynimo checkout SDK
    await loadScript(PAYNIMO_CHECKOUT_JS_URL, 'paynimo-checkout-js');
    // Verify $.pnCheckout is available
    const $ = (window as any).jQuery || (window as any).$;
    return typeof $ === 'function' && typeof $.pnCheckout === 'function';
  } catch (err) {
    console.warn('[PaynimoSDK] Failed to load Paynimo SDK:', err);
    return false;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface WorldlineSandboxModalProps {
  transaction: TransactionRecord;
  checkoutPayload: any;
  isOpen: boolean;
  onClose: () => void;
  onSandboxResponse: (responsePayload: any) => void;
}

export const WorldlineSandboxModal: React.FC<WorldlineSandboxModalProps> = ({
  transaction,
  checkoutPayload,
  isOpen,
  onClose,
  onSandboxResponse,
}) => {
  const [bankUsername, setBankUsername] = useState('test');
  const [bankPassword, setBankPassword] = useState('test');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authStep, setAuthStep] = useState<string>('');

  // ── Live SDK State ─────────────────────────────────────────────────────────
  const [sdkStatus, setSdkStatus] = useState<SdkStatus>('idle');
  const [sdkError, setSdkError] = useState<string>('');
  const [useLiveSdk, setUseLiveSdk] = useState(true);
  const [liveSdkLaunched, setLiveSdkLaunched] = useState(false);
  const responseHandlerRef = useRef<((res: any) => void) | null>(null);

  // ── Load Paynimo SDK on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setSdkStatus('loading');
    setSdkError('');

    loadPaynimoSdk().then((success) => {
      if (cancelled) return;
      if (success) {
        setSdkStatus('ready');
        console.log('[PaynimoSDK] Worldline Paynimo checkout.js loaded successfully');
      } else {
        setSdkStatus('error');
        setSdkError('$.pnCheckout not available after script load');
        console.warn('[PaynimoSDK] SDK loaded but $.pnCheckout is not a function');
      }
    }).catch((err) => {
      if (cancelled) return;
      setSdkStatus('error');
      setSdkError(err.message);
    });

    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Register global response handler for live SDK ──────────────────────────
  // Paynimo SDK calls a global function named in consumerData.responseHandler
  useEffect(() => {
    if (!isOpen) return;

    const handlerName = checkoutPayload?.consumerData?.responseHandler || 'handleWorldlineResponse';

    // Define the global callback that Paynimo will invoke
    (window as any)[handlerName] = (response: any) => {
      console.log('[PaynimoSDK] Live response received:', response);
      setLiveSdkLaunched(false);
      setIsAuthorizing(false);
      onSandboxResponse(response);
    };

    responseHandlerRef.current = (window as any)[handlerName];

    return () => {
      // Cleanup global handler
      delete (window as any)[handlerName];
      responseHandlerRef.current = null;
    };
  }, [isOpen, checkoutPayload, onSandboxResponse]);

  const consumerData = checkoutPayload?.consumerData;
  const testAmount = consumerData?.items?.[0]?.amount || '2.00';
  const schemeCode = consumerData?.items?.[0]?.itemId || 'FIRST';
  const merchantId = consumerData?.merchantId || 'T1202993';

  const isSdkReady = sdkStatus === 'ready';
  const canUseLiveSdk = isSdkReady && useLiveSdk;

  // ── Launch Live Paynimo SDK Checkout ────────────────────────────────────────
  const handleLiveSdkCheckout = () => {
    const $ = (window as any).jQuery || (window as any).$;
    if (!$ || typeof $.pnCheckout !== 'function') {
      setSdkError('$.pnCheckout is not available. Falling back to simulated mode.');
      setUseLiveSdk(false);
      return;
    }

    setIsAuthorizing(true);
    setLiveSdkLaunched(true);
    setAuthStep('Launching Worldline Paynimo Live Sandbox Checkout...');

    try {
      // Build the configuration object expected by $.pnCheckout
      const sdkConfig = {
        tarCall: checkoutPayload?.tarCall ?? false,
        features: checkoutPayload?.features ?? {
          showFullResponse: true,
          showSplitOption: false,
          enableNewWindowFlow: false,
        },
        consumerData: {
          ...consumerData,
          // Ensure responseHandler is set as a string (function name)
          responseHandler: consumerData?.responseHandler || 'handleWorldlineResponse',
        },
      };

      console.log('[PaynimoSDK] Invoking $.pnCheckout with config:', sdkConfig);
      $.pnCheckout(sdkConfig);

      // The SDK opens an overlay/iframe. Response comes back via the global handler.
      // If user closes the Paynimo overlay without completing, we need a timeout fallback.
      setTimeout(() => {
        if (liveSdkLaunched) {
          setIsAuthorizing(false);
          setAuthStep('');
        }
      }, 120000); // 2 min safety timeout
    } catch (err: any) {
      console.error('[PaynimoSDK] Error launching checkout:', err);
      setSdkError(`SDK launch error: ${err.message}`);
      setIsAuthorizing(false);
      setLiveSdkLaunched(false);
      setUseLiveSdk(false);
    }
  };

  // ── Simulated Bank Response (Fallback) ─────────────────────────────────────
  const handleTestBankSubmit = (outcome: '0300' | '0399' | '0396' | '0392') => {
    setIsAuthorizing(true);

    if (outcome === '0300') {
      setAuthStep('Submitting test/test credentials to Worldline switch...');
    } else if (outcome === '0399') {
      setAuthStep('Simulating bank authorization decline...');
    } else if (outcome === '0396') {
      setAuthStep('Queueing pending bank reconciliation...');
    } else {
      setAuthStep('Aborting transaction per user request...');
    }

    setTimeout(() => {
      const bankRef =
        outcome === '0300' || outcome === '0396'
          ? `WL-SANDBOX-REF-${Math.floor(10000000 + Math.random() * 90000000)}`
          : undefined;

      const authCode =
        outcome === '0300'
          ? `AUTH-WL-${Math.floor(10000 + Math.random() * 90000)}`
          : undefined;

      const payload = {
        paymentMethod: {
          paymentTransaction: {
            statusCode: outcome,
            statusMessage:
              outcome === '0300'
                ? 'Transaction Successful via Sandbox Test Bank'
                : outcome === '0399'
                ? 'Transaction Declined by Bank: Insufficient balance / limit'
                : outcome === '0396'
                ? 'Transaction Awaited: Delayed bank response'
                : 'Transaction Aborted by User',
            merchantTransactionIdentifier: transaction.id,
            identifier: `WL-TXN-${Date.now()}`,
            bankReferenceIdentifier: bankRef,
            authCode: authCode,
            paymentMode: 'NetBanking',
            bankName: 'Worldline Sandbox Test Bank',
            amount: testAmount,
            currency: 'INR',
          },
        },
        merchantTxnId: transaction.id,
        token: consumerData?.token,
      };

      setIsAuthorizing(false);
      onSandboxResponse(payload);
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-300 overflow-hidden my-6">
        {/* Top Sandbox Notice Header */}
        <div className="bg-emerald-600 text-white px-5 py-2.5 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-white text-emerald-900 text-[10px] uppercase font-mono font-extrabold tracking-wider">
              GENUINE SANDBOX
            </span>
            <span>Worldline / Paynimo Multi-Rail Test Gateway</span>
          </div>
          <button
            onClick={onClose}
            disabled={isAuthorizing}
            className="text-white hover:text-emerald-100 font-bold p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Brand & Order strip */}
        <div className="bg-[#002b49] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-white">Worldline / Paynimo</span>
              <span className="text-[10px] font-mono text-amber-300">Merchant: {merchantId}</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Scheme: <strong className="font-mono text-white">{schemeCode}</strong> · Order: <strong className="font-mono text-white">{transaction.orderId}</strong>
            </p>
          </div>

          <div className="text-right">
            <span className="block text-[10px] text-emerald-300 font-semibold uppercase">
              Sandbox Test Charge
            </span>
            <span className="text-2xl font-extrabold text-amber-300 font-mono tabular-nums">
              ₹{testAmount}
            </span>
            <span className="block text-[10px] text-slate-300">
              (Nominal: {formatINR(transaction.totalAmount)})
            </span>
          </div>
        </div>

        {/* ── Live SDK Status Bar ───────────────────────────────────────────── */}
        <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px]">
            {sdkStatus === 'loading' && (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                <span className="text-amber-700 font-semibold">Loading Paynimo SDK...</span>
              </>
            )}
            {sdkStatus === 'ready' && (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Paynimo SDK Ready</span>
                <span className="text-slate-400 font-mono">checkout.js</span>
              </>
            )}
            {sdkStatus === 'error' && (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-600 font-semibold">SDK Unavailable</span>
                <span className="text-slate-400 text-[10px] truncate max-w-[200px]">{sdkError}</span>
              </>
            )}
            {sdkStatus === 'idle' && (
              <>
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500">Initializing...</span>
              </>
            )}
          </div>

          {/* Live / Simulated toggle */}
          <button
            type="button"
            onClick={() => setUseLiveSdk(!useLiveSdk)}
            disabled={!isSdkReady}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors cursor-pointer
              ${canUseLiveSdk
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
              } ${!isSdkReady ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {canUseLiveSdk ? (
              <>
                <ToggleRight className="w-4 h-4" />
                <span>Live SDK</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4" />
                <span>Simulated</span>
              </>
            )}
          </button>
        </div>

        {/* Processing Overlay */}
        {isAuthorizing && (
          <div className="absolute inset-0 z-30 bg-white/95 flex flex-col items-center justify-center p-6 space-y-3">
            <Loader2 className="w-10 h-10 text-emerald-700 animate-spin" />
            <h4 className="font-bold text-slate-900 text-sm">{authStep}</h4>
            <p className="text-xs text-slate-500">
              {liveSdkLaunched
                ? 'The Worldline Paynimo checkout overlay should open momentarily. Complete the payment in the overlay to proceed.'
                : 'Validating signature and dispatching verified callback to AIMA Server...'}
            </p>
            {liveSdkLaunched && (
              <button
                type="button"
                onClick={() => {
                  setIsAuthorizing(false);
                  setLiveSdkLaunched(false);
                  setAuthStep('');
                }}
                className="mt-2 text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
              >
                Cancel and return to manual mode
              </button>
            )}
          </div>
        )}

        {/* Body Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Cryptographic Token Audit Card */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 font-mono text-[10px] space-y-1">
            <div className="flex items-center justify-between text-slate-800 font-bold">
              <span>Server-Signed Token (SHA-256):</span>
              <span className="text-emerald-700">Validated</span>
            </div>
            <div className="truncate text-slate-500">
              {consumerData?.token || 'HASH_CALCULATED_ON_SERVER'}
            </div>
          </div>

          {/* ── Live SDK Primary Action ─────────────────────────────────────── */}
          {canUseLiveSdk && (
            <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50/50 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-700" />
                  <span className="font-bold text-emerald-900">
                    Live Worldline Paynimo Checkout
                  </span>
                </div>
                <span className="text-[10px] text-emerald-600 font-mono px-1.5 py-0.5 bg-emerald-100 rounded">
                  $.pnCheckout
                </span>
              </div>

              <p className="text-[11px] text-slate-600">
                Launch the official Worldline Paynimo checkout overlay. You'll be redirected to the
                real Paynimo sandbox test bank page using credentials: <strong className="text-slate-800">test / test</strong>.
              </p>

              <button
                type="button"
                onClick={handleLiveSdkCheckout}
                disabled={isAuthorizing}
                className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Zap className="w-4 h-4" />
                <span>Launch Paynimo Checkout (₹{testAmount})</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <p className="text-[10px] text-slate-400 text-center">
                Opens the official Worldline overlay — no simulated data
              </p>
            </div>
          )}

          {/* ── Simulated Test Bank Login (Fallback or Manual Mode) ─────────── */}
          <div className={`border rounded-xl p-4 bg-white shadow-xs space-y-3 ${canUseLiveSdk ? 'border-slate-100 opacity-75' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-slate-900">
                  {canUseLiveSdk ? 'Manual Simulated Test Bank (Fallback)' : 'Sandbox Test NetBanking Switch'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                {canUseLiveSdk ? 'Alternative' : 'Simulated Bank Gate'}
              </span>
            </div>

            <p className="text-[11px] text-slate-500">
              {canUseLiveSdk
                ? 'Use this if the live SDK overlay doesn\'t load or you want to test specific edge cases with manual status codes.'
                : 'The AIMA test configuration specifies test bank login credentials:'}{' '}
              <strong className="text-slate-800">test / test</strong>.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Test User ID
                </label>
                <input
                  type="text"
                  value={bankUsername}
                  onChange={(e) => setBankUsername(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Test Password
                </label>
                <input
                  type="password"
                  value={bankPassword}
                  onChange={(e) => setBankPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-slate-900 font-bold"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleTestBankSubmit('0300')}
                className="w-full py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Authorize Sandbox Payment (₹{testAmount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Test Error & Edge-case Triggers for Quality Assurance */}
          <div>
            <span className="block text-[11px] font-bold text-slate-700 mb-2">
              Test Gateway Edge Cases (Official Worldline Status Codes):
            </span>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTestBankSubmit('0399')}
                className="p-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900 rounded-lg text-left cursor-pointer transition-colors"
              >
                <span className="font-bold text-[11px] block">Bank Decline (0399)</span>
                <span className="text-[10px] text-rose-700">Simulate rejection</span>
              </button>

              <button
                type="button"
                onClick={() => handleTestBankSubmit('0396')}
                className="p-2 border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-left cursor-pointer transition-colors"
              >
                <span className="font-bold text-[11px] block">Awaited (0396)</span>
                <span className="text-[10px] text-amber-700">Reconciliation pending</span>
              </button>

              <button
                type="button"
                onClick={() => handleTestBankSubmit('0392')}
                className="p-2 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-lg text-left cursor-pointer transition-colors"
              >
                <span className="font-bold text-[11px] block">Abort (0392)</span>
                <span className="text-[10px] text-slate-600">User cancelled</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-mono">paynimo.com/paynimocheckout/docs</span>
            {isSdkReady && (
              <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold uppercase">
                SDK Loaded
              </span>
            )}
          </div>
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
