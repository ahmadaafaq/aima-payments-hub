import React, { useState } from 'react';
import { TransactionRecord } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { AimaLogo } from './AimaLogo';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  Printer, 
  ArrowRight, 
  RotateCcw, 
  ExternalLink, 
  ShieldCheck, 
  Download,
  Share2,
  FileCheck,
  RefreshCw
} from 'lucide-react';

interface PaymentResultProps {
  transaction: TransactionRecord;
  onReturnToOriginatingApp: () => void;
  onRetryPayment: () => void;
  onRecheckPendingStatus?: (transactionId: string) => void;
}

export const PaymentResult: React.FC<PaymentResultProps> = ({
  transaction,
  onReturnToOriginatingApp,
  onRetryPayment,
  onRecheckPendingStatus,
}) => {
  const [isRechecking, setIsRechecking] = useState(false);

  const isSuccess = transaction.status === 'SUCCESS';
  const isFailed = transaction.status === 'FAILED';
  const isPending = transaction.status === 'PENDING';
  const isCancelled = transaction.status === 'CANCELLED';

  const handlePrint = () => {
    window.print();
  };

  const handleStatusCheck = () => {
    if (onRecheckPendingStatus) {
      setIsRechecking(true);
      setTimeout(() => {
        setIsRechecking(false);
        onRecheckPendingStatus(transaction.id);
      }, 1000);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Top Result Banner */}
      <div
        className={`rounded-2xl p-6 sm:p-8 border shadow-sm ${
          isSuccess
            ? 'bg-emerald-950/20 border-emerald-300 text-slate-900'
            : isFailed
            ? 'bg-rose-950/20 border-rose-300 text-slate-900'
            : isPending
            ? 'bg-amber-950/20 border-amber-300 text-slate-900'
            : 'bg-slate-100 border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                isSuccess
                  ? 'bg-emerald-600 text-white'
                  : isFailed
                  ? 'bg-rose-600 text-white'
                  : isPending
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-600 text-white'
              }`}
            >
              {isSuccess && <CheckCircle2 className="w-8 h-8" />}
              {isFailed && <XCircle className="w-8 h-8" />}
              {isPending && <Clock className="w-8 h-8" />}
              {isCancelled && <AlertTriangle className="w-8 h-8" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isSuccess
                      ? 'bg-emerald-100 text-emerald-800'
                      : isFailed
                      ? 'bg-rose-100 text-rose-800'
                      : isPending
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  Payment {transaction.status}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  {transaction.gateway === 'CCAVENUE' ? 'HDFC / CCAvenue' : transaction.gateway === 'WORLDLINE_PAYNIMO' ? 'Worldline / Paynimo' : 'Demo Simulator'}
                </span>
                {transaction.isSimulated ? (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded uppercase">
                    Simulated Demo
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded uppercase">
                    Genuine Sandbox
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 mt-1">
                {isSuccess && 'Payment Successfully Received'}
                {isFailed && 'Payment Transaction Declined'}
                {isPending && 'Payment Verification in Progress'}
                {isCancelled && 'Payment Cancelled by User'}
              </h2>

              <p className="text-xs text-slate-600 mt-0.5">
                {isSuccess && 'Your fee has been received and verified by AIMA Centralized Payment Service.'}
                {isFailed && (transaction.statusReason || 'Bank authorization declined this transaction.')}
                {isPending && 'Bank clearance is pending. CCAvenue DoWebTrans API will synchronize the status.'}
                {isCancelled && 'No amount was deducted. Your draft application data is preserved.'}
              </p>
              {!transaction.isSimulated && (
                <div className="mt-1 text-[11px] font-mono text-emerald-800">
                  Verified via {transaction.verificationMethod || 'HASH_VALIDATION'} · Gateway Txn: {transaction.gatewayTransactionId || transaction.id}
                  {transaction.gatewayAmount && transaction.gatewayAmount !== transaction.totalAmount && (
                    <span className="ml-1 text-slate-600 font-sans">
                      (Sandbox charged: ₹{transaction.gatewayAmount.toFixed(2)})
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Amount Badge */}
          <div className="text-left sm:text-right bg-white/80 p-3 sm:p-4 rounded-xl border border-slate-200 shrink-0">
            <span className="block text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
              Amount Transacted
            </span>
            <span className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
              {formatINR(transaction.totalAmount)}
            </span>
          </div>
        </div>

        {/* Quick Actions Strip */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs no-print">
          <div className="flex items-center gap-2">
            <button
              onClick={onReturnToOriginatingApp}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#002b49] hover:bg-[#003860] text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <span>Return to {transaction.applicationCode} Application</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {isFailed && (
              <button
                onClick={onRetryPayment}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Payment</span>
              </button>
            )}

            {isPending && (
              <button
                onClick={handleStatusCheck}
                disabled={isRechecking}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRechecking ? 'animate-spin' : ''}`} />
                <span>Check Status (DoWebTrans API)</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-lg border border-slate-300 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print Official Receipt</span>
            </button>
          </div>
        </div>
      </div>

      {/* PRINTABLE RECEIPT CONTAINER (Formatted as authentic AIMA Tax Invoice) */}
      <div
        id="printable-receipt"
        className="bg-white rounded-2xl border-2 border-slate-300 p-8 shadow-sm relative overflow-hidden"
      >
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.06] select-none rotate-[-25deg]">
          <span className="text-7xl font-extrabold tracking-widest text-slate-900 uppercase">
            {transaction.isSimulated ? 'AIMA DEMO RECEIPT' : 'AIMA SANDBOX RECEIPT'}
          </span>
        </div>

        {/* Header Ribbon on Receipt */}
        <div
          className={`text-center py-1.5 px-3 rounded-lg text-xs font-bold uppercase tracking-widest mb-6 border ${
            transaction.isSimulated
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : 'bg-emerald-100 text-emerald-950 border-emerald-300'
          }`}
        >
          {transaction.isSimulated
            ? '★ DEMO RECEIPT — STAKEHOLDER SIMULATION ONLY ★'
            : '★ OFFICIAL SANDBOX RECEIPT — TEST ENVIRONMENT VERIFIED ★'}
        </div>

        {/* Receipt Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b-2 border-[#002b49]">
          <div className="flex items-center gap-4">
            <AimaLogo size="md" variant="dark" />
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">
                ALL INDIA MANAGEMENT ASSOCIATION
              </h1>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Management House, 14, Institutional Area, Lodi Road, New Delhi - 110003<br />
                Ph: +91 11 24645100 · Email: pghelpdesk@aima.in · Web: www.aima.in
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right text-xs">
            <span className="block font-bold text-slate-900 text-sm">PAYMENT RECEIPT</span>
            <span className="font-mono text-slate-600 block">GSTIN: 07AAATA0865F1Z2</span>
            <span className="font-mono text-slate-500 block text-[11px]">PAN: AAATA0865F</span>
          </div>
        </div>

        {/* Transaction Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-b border-slate-200 text-xs">
          <div>
            <span className="block text-[11px] text-slate-500">Transaction Ref No:</span>
            <span className="font-mono font-bold text-slate-900">{transaction.id}</span>
          </div>
          <div>
            <span className="block text-[11px] text-slate-500">Order ID:</span>
            <span className="font-mono font-bold text-slate-900">{transaction.orderId}</span>
          </div>
          <div>
            <span className="block text-[11px] text-slate-500">Transaction Date & Time:</span>
            <span className="font-mono text-slate-800">
              {new Date(transaction.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </span>
          </div>
          <div>
            <span className="block text-[11px] text-slate-500">Gateway TID / MID:</span>
            <span className="font-mono text-slate-800">
              {transaction.gatewayTid || 'N/A'} ({transaction.gateway === 'CCAVENUE' ? 'HDFC/CC' : transaction.gateway === 'WORLDLINE_PAYNIMO' ? 'Worldline' : 'Simulator'})
            </span>
          </div>
        </div>

        {/* Applicant Details */}
        <div className="py-4 border-b border-slate-200 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-[11px] text-slate-500">Applicant / Candidate:</span>
              <span className="font-bold text-slate-900 text-sm">{transaction.applicantName}</span>
              <span className="block text-slate-600 text-[11px]">{transaction.applicantEmail} · {transaction.applicantPhone}</span>
            </div>
            <div>
              <span className="block text-[11px] text-slate-500">Application Reference:</span>
              <span className="font-mono font-bold text-[#002b49] text-sm">{transaction.applicationRef}</span>
              <span className="block text-slate-600 text-[11px]">Division: {transaction.applicationName}</span>
            </div>
          </div>
        </div>

        {/* Particulars Table */}
        <div className="py-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left font-bold text-slate-700">
                <th className="py-2">Sl.</th>
                <th className="py-2">Description of Services</th>
                <th className="py-2">SAC</th>
                <th className="py-2 text-right">Base Fee</th>
                <th className="py-2 text-right">GST (18%)</th>
                <th className="py-2 text-right">Total (INR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 font-mono">1</td>
                <td className="py-3">
                  <div className="font-bold text-slate-900">{transaction.feeDescription}</div>
                  <div className="text-[11px] text-slate-500">{transaction.courseOrEvent}</div>
                </td>
                <td className="py-3 font-mono text-slate-600">999293</td>
                <td className="py-3 text-right font-mono tabular-nums">{formatINR(transaction.baseAmount)}</td>
                <td className="py-3 text-right font-mono tabular-nums">{formatINR(transaction.gstAmount)}</td>
                <td className="py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                  {formatINR(transaction.totalAmount)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 font-bold text-sm">
                <td colSpan={5} className="py-3 text-right">Total Amount Received:</td>
                <td className="py-3 text-right font-mono tabular-nums">{formatINR(transaction.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Banking Authorization & Legal Footnote */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs text-slate-600">
          <div>
            <span className="block font-semibold text-slate-900 mb-1">Banking Settlement Details:</span>
            <ul className="space-y-1 text-[11px] font-mono">
              <li>Status: <span className="font-bold text-slate-900">{transaction.status}</span></li>
              {transaction.bankReference && <li>Bank Ref No: {transaction.bankReference}</li>}
              {transaction.authCode && <li>Gateway Auth Code: {transaction.authCode}</li>}
              <li>Payment Mode: {transaction.paymentMode} {transaction.bankName ? `(${transaction.bankName})` : ''}</li>
            </ul>
          </div>

          <div className="text-left sm:text-right flex flex-col justify-between items-start sm:items-end">
            <div className="w-40 border-b border-slate-400 pb-1 mb-1 text-center font-serif italic text-xs text-slate-500">
              Computer Generated Stamp
            </div>
            <span className="text-[11px] font-bold text-slate-800">
              For All India Management Association
            </span>
            <span className="text-[10px] text-slate-500">Authorized Payment Central Desk</span>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-8 pt-3 border-t border-slate-100 text-[10px] text-slate-400 text-center">
          Note: This document is a simulated demonstration receipt generated by the AIMA Centralized Payment Hub prototype.
          Applicable for presentation and architectural review purposes only.
        </div>
      </div>
    </div>
  );
};
