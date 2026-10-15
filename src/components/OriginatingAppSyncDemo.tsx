import React, { useState } from 'react';
import { TransactionRecord, AimaApplication, PaymentStatus } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  ArrowRight, 
  RefreshCw, 
  Code, 
  FileCheck, 
  Download, 
  ExternalLink,
  ShieldCheck,
  Webhook,
  Server,
  Layers,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

interface OriginatingAppSyncDemoProps {
  transaction: TransactionRecord;
  application: AimaApplication;
  onInitiateNewPayment: () => void;
  onRetryPayment: () => void;
}

export const OriginatingAppSyncDemo: React.FC<OriginatingAppSyncDemoProps> = ({
  transaction,
  application,
  onInitiateNewPayment,
  onRetryPayment,
}) => {
  const [activeTab, setActiveTab] = useState<'appView' | 'webhookTrace' | 'architecture'>('appView');
  const [simulatedStatus, setSimulatedStatus] = useState<PaymentStatus>(transaction.status);

  const isPaid = simulatedStatus === 'SUCCESS';
  const isFailed = simulatedStatus === 'FAILED';
  const isPending = simulatedStatus === 'PENDING';
  const isCancelled = simulatedStatus === 'CANCELLED';

  const webhookPayload = {
    event: 'aima.payment.verified',
    apiVersion: '2026-10-01',
    timestamp: new Date().toISOString(),
    orderId: transaction.orderId,
    transactionId: transaction.id,
    applicationRef: transaction.applicationRef,
    applicant: {
      name: transaction.applicantName,
      email: transaction.applicantEmail,
      phone: transaction.applicantPhone,
    },
    paymentDetails: {
      gateway: transaction.gateway,
      tid: transaction.gatewayTid,
      paymentMode: transaction.paymentMode,
      bankReference: transaction.bankReference || 'N/A',
      authCode: transaction.authCode || 'N/A',
      amountInINR: transaction.totalAmount,
      baseFee: transaction.baseAmount,
      gstTax: transaction.gstAmount,
      status: simulatedStatus === 'SUCCESS' ? 'PAID' : simulatedStatus,
      statusCode: simulatedStatus === 'SUCCESS' ? '00' : simulatedStatus === 'FAILED' ? '05' : '99',
    },
    security: {
      signatureMethod: 'HMAC-SHA256',
      signature: 'e89a44fc7102b489a2e881024bb49102c488319aa5028910',
    },
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Strategic Callout Banner */}
      <div className="bg-[#002b49] text-white rounded-xl p-5 border border-[#0a4b78] shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
              <Webhook className="w-4 h-4" />
              <span>Two-Way Return Sync Demonstration</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Originating Application: {application.name}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Simulating how the central payment platform automatically updates the candidate's record on{' '}
              <span className="font-mono text-amber-300">{application.portalUrl}</span> via signed callbacks.
            </p>
          </div>

          {/* Quick Simulation State Override for Stakeholders */}
          <div className="bg-[#052137] p-2.5 rounded-lg border border-[#0d3b61] text-xs">
            <span className="block text-[11px] text-slate-400 mb-1.5 font-medium">
              Switch Simulated Response State:
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSimulatedStatus('SUCCESS')}
                className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                  simulatedStatus === 'SUCCESS'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Paid
              </button>
              <button
                onClick={() => setSimulatedStatus('FAILED')}
                className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                  simulatedStatus === 'FAILED'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Failed
              </button>
              <button
                onClick={() => setSimulatedStatus('PENDING')}
                className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                  simulatedStatus === 'PENDING'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Pending
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('appView')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeTab === 'appView'
              ? 'border-[#002b49] text-[#002b49]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Originating App Portal View ({application.code})</span>
        </button>

        <button
          onClick={() => setActiveTab('webhookTrace')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeTab === 'webhookTrace'
              ? 'border-[#002b49] text-[#002b49]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          <span>Webhook & API Callback Trace</span>
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`py-2.5 px-4 border-b-2 cursor-pointer transition-colors flex items-center gap-1.5 ${
            activeTab === 'architecture'
              ? 'border-[#002b49] text-[#002b49]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Centralized Architecture Flow</span>
        </button>
      </div>

      {/* TAB 1: Simulated Originating Portal Screen */}
      {activeTab === 'appView' && (
        <div className="space-y-6">
          {/* Mock Browser Window Container */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden">
            {/* Mock Browser Header */}
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-[11px] font-mono text-slate-500 bg-white px-3 py-0.5 rounded border border-slate-200">
                  {application.portalUrl}/candidate-dashboard?ref={transaction.applicationRef}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 uppercase font-mono font-medium">
                Simulated {application.code} Portal
              </span>
            </div>

            {/* Portal Content Area */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Portal Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Candidate Self-Service Portal
                  </span>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {application.name}
                  </h3>
                </div>

                <div className="text-left sm:text-right text-xs">
                  <span className="block text-slate-500 text-[11px]">Dossier Reference</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {transaction.applicationRef}
                  </span>
                </div>
              </div>

              {/* Status Indicator Card in Originating Application */}
              <div
                className={`p-5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  isPaid
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : isFailed
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : isPending
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {isPaid && <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                    {isFailed && <XCircle className="w-6 h-6 text-rose-600" />}
                    {isPending && <Clock className="w-6 h-6 text-amber-600" />}
                    {isCancelled && <AlertTriangle className="w-6 h-6 text-slate-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Payment Status on {application.code}:
                      </span>
                      <span
                        className={`text-xs font-extrabold px-2 py-0.5 rounded ${
                          isPaid
                            ? 'bg-emerald-600 text-white'
                            : isFailed
                            ? 'bg-rose-600 text-white'
                            : isPending
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-700 text-white'
                        }`}
                      >
                        {isPaid ? 'PAID & CONFIRMED' : isFailed ? 'PAYMENT FAILED' : isPending ? 'VERIFICATION PENDING' : 'CANCELLED'}
                      </span>
                    </div>

                    <p className="text-xs mt-1 text-slate-700">
                      {isPaid && (
                        <>Payment verified via AIMA Central Hub (Txn: <span className="font-mono">{transaction.id}</span>). Candidate registration is active.</>
                      )}
                      {isFailed && (
                        <>Transaction was declined by issuing bank. Please re-attempt payment to complete registration before closing date.</>
                      )}
                      {isPending && (
                        <>Transaction is awaiting reconciliation from bank switch. Status updates automatically once verified.</>
                      )}
                      {isCancelled && (
                        <>Payment was cancelled. Application saved as draft.</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Dynamic Actions based on sync state */}
                <div className="shrink-0">
                  {isPaid && (
                    <button
                      onClick={() => alert(`Simulated Download for ${application.code}: Admit Card / Registration Confirmation downloaded successfully!`)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Admit Card / Pass</span>
                    </button>
                  )}

                  {isFailed && (
                    <button
                      onClick={onRetryPayment}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Payment</span>
                    </button>
                  )}

                  {isPending && (
                    <button
                      onClick={() => alert('Simulated Status Query: AIMA Central Hub is polling CCAvenue DoWebTrans API. Status updated to PAID!')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Query Status API</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Applicant Dossier summary in Originating Application */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[11px]">Candidate Name</span>
                  <span className="font-bold text-slate-900">{transaction.applicantName}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[11px]">Target Module / Exam</span>
                  <span className="font-bold text-slate-900">{transaction.courseOrEvent}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-slate-500 block text-[11px]">Fee Accounted (INR)</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR(transaction.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Educational Simulation Notice */}
              <div className="p-4 bg-slate-50 rounded-lg border border-dashed border-slate-300 text-slate-500 text-[11px] leading-relaxed">
                <strong className="text-slate-700">Prototype Note:</strong> This simulated screen 
                illustrates how the originating application ({application.code}) consumes the webhook event 
                dispatched by the AIMA Central Payment Hub. In production, each vertical database (e.g. MAT Oracle DB, 
                CME Student ERP) simply listens for this secure HTTPS callback without handling gateway SDKs.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Webhook & API Callback Trace */}
      {activeTab === 'webhookTrace' && (
        <div className="bg-slate-900 text-slate-200 rounded-xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-xs font-bold text-emerald-400">
                POST https://{application.id}.aima.in/api/v1/payment-callback
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">HTTP/2 200 OK Delivered</span>
          </div>

          <p className="text-xs text-slate-300">
            When a transaction concludes at HDFC CCAvenue or Worldline, the Central Payment Hub signs the verified 
            transaction event with HMAC-SHA256 and dispatches it directly to the registered webhook endpoint of {application.name}:
          </p>

          <pre className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-[11px] text-amber-300 overflow-x-auto leading-relaxed">
            {JSON.stringify(webhookPayload, null, 2)}
          </pre>

          <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400">
            <span>Status API Reference: DoWebTrans Checksum Validated</span>
            <span>Delivery Latency: 182ms</span>
          </div>
        </div>
      )}

      {/* TAB 3: Centralized Architecture Flow */}
      {activeTab === 'architecture' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <h3 className="text-base font-bold text-slate-900">
            AIMA Centralized Payment Architecture Model
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            This diagram illustrates how all 8+ AIMA business verticals route payments through a single hub 
            while keeping application-specific candidate databases intact.
          </p>

          {/* Visual Architecture Steps */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Step 1</span>
                <h4 className="font-bold text-slate-900 mt-1">Originating Portals</h4>
                <p className="text-[11px] text-slate-500 mt-1">
                  MAT, CME, Case League, UGAT, LMA, AMT, VCC, Events create checkout intent.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-slate-200 text-[10px] font-mono text-slate-600">
                Redirects with Order Token
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-blue-600 uppercase font-mono">Step 2</span>
                <h4 className="font-bold text-[#002b49] mt-1">AIMA Central Hub</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Single hosted checkout page. Manages GST, order IDs, fee schedules.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-blue-200 text-[10px] font-mono text-blue-800">
                Single Merchant Acct
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-700 uppercase font-mono">Step 3</span>
                <h4 className="font-bold text-slate-900 mt-1">Authorized Gateways</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  HDFC CCAvenue (TID 76098022) & Worldline Paynimo with smart failover.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-amber-200 text-[10px] font-mono text-amber-800">
                NetBanking / Cards / UPI
              </div>
            </div>

            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-purple-700 uppercase font-mono">Step 4</span>
                <h4 className="font-bold text-purple-900 mt-1">Central Ledger & MIS</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Unified audit log, GST invoice generation, DoWebTrans reconciliation.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-purple-200 text-[10px] font-mono text-purple-800">
                Consolidated Reports
              </div>
            </div>

            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 uppercase font-mono">Step 5</span>
                <h4 className="font-bold text-emerald-950 mt-1">Two-Way Callback</h4>
                <p className="text-[11px] text-slate-600 mt-1">
                  Verified webhook updates originating application record to Paid or Failed.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-emerald-200 text-[10px] font-mono text-emerald-800">
                Candidate Admitted
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 text-xs">
        <button
          onClick={onInitiateNewPayment}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-lg transition-colors cursor-pointer"
        >
          <span>Test Another AIMA Application</span>
        </button>

        <span className="text-slate-500">
          Showing real-time sync for order <span className="font-mono font-bold text-slate-900">{transaction.orderId}</span>
        </span>
      </div>
    </div>
  );
};
