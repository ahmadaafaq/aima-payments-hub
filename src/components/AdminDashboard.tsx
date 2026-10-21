import React, { useState, useMemo, useEffect } from 'react';
import { TransactionRecord, PaymentGateway, PaymentStatus } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  Search, 
  Filter, 
  Download, 
  RotateCcw, 
  Eye, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  ArrowUpDown,
  Building,
  CreditCard,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  ExternalLink,
  ShieldCheck,
  FileSpreadsheet,
  RotateCw,
  X
} from 'lucide-react';

interface AdminDashboardProps {
  transactions: TransactionRecord[];
  onResetData?: () => void;
  onViewReceipt: (transaction: TransactionRecord) => void;
  onViewSync?: (transaction: TransactionRecord) => void;
  onReconcileSuccess?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  transactions,
  onResetData,
  onViewReceipt,
  onViewSync,
  onReconcileSuccess,
  onRefresh,
  isRefreshing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedApp, setSelectedApp] = useState<string>('ALL');
  const [detailModalTransaction, setDetailModalTransaction] = useState<TransactionRecord | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Date and Time formatters (IST Asia/Kolkata)
  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return isoString;
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });
    } catch {
      return '';
    }
  };

  // Reconciliation State
  const [showReconcilePanel, setShowReconcilePanel] = useState<boolean>(false);
  const [recStatus, setRecStatus] = useState<'SUCCESS' | 'FAILED' | 'CANCELLED'>('SUCCESS');
  const [recBankRef, setRecBankRef] = useState<string>('');
  const [recNote, setRecNote] = useState<string>('');
  const [recSubmitting, setRecSubmitting] = useState<boolean>(false);
  const [recSuccessMsg, setRecSuccessMsg] = useState<string | null>(null);

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailModalTransaction) return;
    setRecSubmitting(true);
    setRecSuccessMsg(null);
    try {
      const token = localStorage.getItem('aima_admin_token') || 'aima-admin-dev-token-2026';
      const res = await fetch(`/api/v1/admin/transactions/${encodeURIComponent(detailModalTransaction.id)}/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: recStatus,
          note: recNote.trim() || 'Manual resolution by administrator',
          bankReference: recBankRef.trim() || detailModalTransaction.bankReference,
          adminUser: 'AIMA Admin',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Reconciliation failed');
      }

      const data = await res.json();
      setDetailModalTransaction(data.transaction);
      setRecSuccessMsg('Transaction successfully reconciled and persisted to Supabase database!');
      setShowReconcilePanel(false);
      if (onReconcileSuccess) onReconcileSuccess();
    } catch (err: any) {
      alert(`Reconciliation Error: ${err.message}`);
    } finally {
      setRecSubmitting(false);
    }
  };

  // Calculate Metrics
  const metrics = useMemo(() => {
    const totalCount = transactions.length;
    const successList = transactions.filter((t) => t.status === 'SUCCESS');
    const failedList = transactions.filter((t) => t.status === 'FAILED');
    const pendingList = transactions.filter((t) => t.status === 'PENDING');
    const cancelledList = transactions.filter((t) => t.status === 'CANCELLED');

    const totalSuccessAmount = successList.reduce((acc, t) => acc + t.totalAmount, 0);
    const successRate = totalCount > 0 ? ((successList.length / totalCount) * 100).toFixed(1) : '0';

    // Gateway breakdown
    const hdfcTxns = transactions.filter((t) => t.gateway === 'CCAVENUE');
    const hdfcSuccess = hdfcTxns.filter((t) => t.status === 'SUCCESS');
    const hdfcAmount = hdfcSuccess.reduce((acc, t) => acc + t.totalAmount, 0);

    const wlTxns = transactions.filter((t) => t.gateway === 'WORLDLINE_PAYNIMO');
    const wlSuccess = wlTxns.filter((t) => t.status === 'SUCCESS');
    const wlAmount = wlSuccess.reduce((acc, t) => acc + t.totalAmount, 0);

    // Application breakdown
    const appMap: { [code: string]: { count: number; amount: number; successCount: number } } = {};
    transactions.forEach((t) => {
      if (!appMap[t.applicationCode]) {
        appMap[t.applicationCode] = { count: 0, amount: 0, successCount: 0 };
      }
      appMap[t.applicationCode].count += 1;
      if (t.status === 'SUCCESS') {
        appMap[t.applicationCode].amount += t.totalAmount;
        appMap[t.applicationCode].successCount += 1;
      }
    });

    return {
      totalCount,
      successCount: successList.length,
      failedCount: failedList.length,
      pendingCount: pendingList.length,
      cancelledCount: cancelledList.length,
      totalSuccessAmount,
      successRate,
      gateways: {
        hdfc: {
          total: hdfcTxns.length,
          success: hdfcSuccess.length,
          amount: hdfcAmount,
        },
        worldline: {
          total: wlTxns.length,
          success: wlSuccess.length,
          amount: wlAmount,
        },
      },
      appBreakdown: Object.entries(appMap).map(([code, data]) => ({
        code,
        ...data,
      })),
    };
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        searchTerm === '' ||
        t.applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.applicationRef.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesGateway =
        selectedGateway === 'ALL' || t.gateway === selectedGateway;

      const matchesStatus =
        selectedStatus === 'ALL' || t.status === selectedStatus;

      const matchesApp =
        selectedApp === 'ALL' || t.applicationCode === selectedApp;

      return matchesSearch && matchesGateway && matchesStatus && matchesApp;
    });
  }, [transactions, searchTerm, selectedGateway, selectedStatus, selectedApp]);

  // Reset page when filters or pageSize change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedGateway, selectedStatus, selectedApp, pageSize]);

  // Sort by createdAt descending (latest transactions at the top)
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [filteredTransactions]);

  const totalItems = sortedTransactions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTransactions = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, safeCurrentPage, pageSize]);

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = [
      'Transaction ID',
      'Order ID',
      'Application Code',
      'Application Ref',
      'Applicant Name',
      'Email',
      'Phone',
      'Gateway',
      'Status',
      'Total Amount (INR)',
      'Payment Mode',
      'Bank Ref',
      'Created At',
    ];

    const rows = filteredTransactions.map((t) => [
      t.id,
      t.orderId,
      t.applicationCode,
      t.applicationRef,
      `"${t.applicantName.replace(/"/g, '""')}"`,
      t.applicantEmail,
      t.applicantPhone,
      t.gateway,
      t.status,
      t.totalAmount,
      t.paymentMode,
      t.bankReference || '',
      t.createdAt,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AIMA_Central_Payment_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const uniqueApps = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((t) => set.add(t.applicationCode));
    return Array.from(set);
  }, [transactions]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Export Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            <span>AIMA Financial Services Division</span>
            <span aria-hidden="true">·</span>
            <span>Central MIS Console</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Centralized Payment MIS & Settlement Ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Single consolidated view of financial collections across MAT, CME, Case League, UGAT, LMA, AMT, VCC and Events.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh ledger from Supabase"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 text-slate-600 ${isRefreshing ? 'animate-spin text-[#002b49]' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Ledger'}</span>
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 shadow-xs cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV Report</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards (Single-Elevation, anti-slop, tabular figures) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Metric 1: Total Gross Collections */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs col-span-2 lg:col-span-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Collections (INR)
          </span>
          <div className="mt-2 text-2xl font-extrabold text-[#002b49] font-mono tabular-nums">
            {formatINR(metrics.totalSuccessAmount)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Across {metrics.successCount} verified payments
          </div>
        </div>

        {/* Metric 2: Total Transactions */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Transactions
          </span>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 font-mono tabular-nums">
            {metrics.totalCount}
          </div>
          <div className="mt-1 text-[11px] text-emerald-700 font-medium">
            {metrics.successRate}% Success Rate
          </div>
        </div>

        {/* Metric 3: Successful */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
            Successful
          </span>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700 font-mono tabular-nums">
            {metrics.successCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Delivered to originating ERP
          </div>
        </div>

        {/* Metric 4: Pending */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
            Pending Clearance
          </span>
          <div className="mt-2 text-2xl font-extrabold text-amber-700 font-mono tabular-nums">
            {metrics.pendingCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            DoWebTrans prober polling
          </div>
        </div>

        {/* Metric 5: Failed / Cancelled */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider block">
            Failed / Cancelled
          </span>
          <div className="mt-2 text-2xl font-extrabold text-rose-700 font-mono tabular-nums">
            {metrics.failedCount + metrics.cancelledCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {metrics.failedCount} Declined · {metrics.cancelledCount} Aborted
          </div>
        </div>
      </div>

      {/* Gateway & Application Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Gateway Performance (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
            Gateway-Wise Distribution
          </h3>

          <div className="space-y-4 text-xs">
            {/* HDFC Collect Now */}
            <div className="p-3.5 rounded-lg bg-sky-50/50 border border-sky-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-blue-900 text-white font-bold text-[10px] flex items-center justify-center">
                    HDFC
                  </div>
                  <span className="font-bold text-slate-900">HDFC Collect Now (Razorpay)</span>
                </div>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatINR(metrics.gateways.hdfc.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>TID: 76098022 · Acct: 4168947</span>
                <span className="font-medium text-slate-700">
                  {metrics.gateways.hdfc.success} of {metrics.gateways.hdfc.total} Success (
                  {metrics.gateways.hdfc.total > 0
                    ? Math.round((metrics.gateways.hdfc.success / metrics.gateways.hdfc.total) * 100)
                    : 0}
                  %)
                </span>
              </div>
            </div>

            {/* Worldline Paynimo */}
            <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200/80">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-emerald-800 text-white font-bold text-[10px] flex items-center justify-center">
                    WL
                  </div>
                  <span className="font-bold text-slate-900">Worldline / Paynimo</span>
                </div>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatINR(metrics.gateways.worldline.amount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>MID: WL-AIMA-MAIN · Multi-Rail</span>
                <span className="font-medium text-slate-700">
                  {metrics.gateways.worldline.success} of {metrics.gateways.worldline.total} Success (
                  {metrics.gateways.worldline.total > 0
                    ? Math.round((metrics.gateways.worldline.success / metrics.gateways.worldline.total) * 100)
                    : 0}
                  %)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Application Breakdown (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
            Application-Wise Collections Breakdown
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {metrics.appBreakdown.map((item) => (
              <div key={item.code} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-bold text-slate-900 text-xs block">{item.code}</span>
                <span className="text-[11px] text-slate-500 block">{item.count} total txns</span>
                <span className="mt-1 font-mono font-bold text-[#002b49] block text-xs tabular-nums">
                  {formatINR(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          {/* Search Input (5 cols) */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Applicant, Order ID, Txn ID, or Ref..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#002b49]"
            />
          </div>

          {/* Gateway Filter (2 cols) */}
          <div className="sm:col-span-2">
            <select
              value={selectedGateway}
              onChange={(e) => setSelectedGateway(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white"
            >
              <option value="ALL">All Gateways</option>
              <option value="WORLDLINE_PAYNIMO">Worldline / Paynimo</option>
              <option value="CCAVENUE">HDFC Collect Now (Razorpay)</option>
              <option value="DEMO_SIMULATOR">Demo Simulator</option>
            </select>
          </div>

          {/* Status Filter (2 cols) */}
          <div className="sm:col-span-2">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* App Filter (3 cols) */}
          <div className="sm:col-span-3">
            <select
              value={selectedApp}
              onChange={(e) => setSelectedApp(e.target.value)}
              className="w-full py-2 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:bg-white"
            >
              <option value="ALL">All AIMA Applications</option>
              {uniqueApps.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter count notice */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>
            Showing <strong className="text-slate-900 font-mono">{totalItems > 0 ? `${Math.min((safeCurrentPage - 1) * pageSize + 1, totalItems)}–${Math.min(safeCurrentPage * pageSize, totalItems)}` : 0}</strong> of{' '}
            <strong className="text-slate-900 font-mono">{totalItems}</strong> filtered ({transactions.length} total) transactions · Page <strong className="text-slate-900">{safeCurrentPage}</strong> of {totalPages}
          </span>
          {(searchTerm || selectedGateway !== 'ALL' || selectedStatus !== 'ALL' || selectedApp !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedGateway('ALL');
                setSelectedStatus('ALL');
                setSelectedApp('ALL');
              }}
              className="text-[#002b49] font-bold hover:underline cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* High-Density Transaction Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Order & Txn ID</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Application</th>
                <th className="py-3 px-4">Applicant Particulars</th>
                <th className="py-3 px-4">Gateway / Mode</th>
                <th className="py-3 px-4 text-right">Amount (INR)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransactions.length > 0 ? (
                paginatedTransactions.map((txn) => {
                  const isSuccess = txn.status === 'SUCCESS';
                  const isFailed = txn.status === 'FAILED';
                  const isPending = txn.status === 'PENDING';
                  const isCancelled = txn.status === 'CANCELLED';

                  return (
                    <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Order & Txn ID */}
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{txn.orderId}</div>
                        <div className="font-mono text-[11px] text-slate-500">{txn.id}</div>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDate(txn.createdAt)}</span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 pl-5">
                          {formatTime(txn.createdAt)}
                        </div>
                      </td>

                      {/* Application */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{txn.applicationCode}</span>
                        <span className="font-mono text-[11px] text-slate-500 block">{txn.applicationRef}</span>
                      </td>

                      {/* Applicant Particulars */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{txn.applicantName}</div>
                        <div className="text-[11px] text-slate-500">{txn.courseOrEvent}</div>
                      </td>

                      {/* Gateway / Mode */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-800">
                            {txn.gateway === 'CCAVENUE'
                              ? 'HDFC Collect Now (Razorpay)'
                              : txn.gateway === 'WORLDLINE_PAYNIMO'
                              ? 'Worldline / Paynimo'
                              : 'Demo Simulator'}
                          </span>
                          {txn.isSimulated ? (
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1 py-0.5 rounded uppercase">
                              Demo
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded uppercase">
                              Sandbox
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {txn.paymentMode} {txn.bankName ? `· ${txn.bankName}` : ''}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatINR(txn.totalAmount)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            isSuccess
                              ? 'bg-emerald-100 text-emerald-800'
                              : isFailed
                              ? 'bg-rose-100 text-rose-800'
                              : isPending
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {isSuccess && <CheckCircle2 className="w-3 h-3" />}
                          {isFailed && <XCircle className="w-3 h-3" />}
                          {isPending && <Clock className="w-3 h-3" />}
                          {isCancelled && <AlertTriangle className="w-3 h-3" />}
                          {txn.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setDetailModalTransaction(txn)}
                            title="View Full Audit Log & Gateway Metadata"
                            className="p-1.5 rounded hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onViewReceipt(txn)}
                            title="View / Print Official Receipt"
                            className="p-1.5 rounded hover:bg-slate-200 text-blue-700 transition-colors cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No transactions match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalItems > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-slate-900 font-mono">{Math.min((safeCurrentPage - 1) * pageSize + 1, totalItems)}</strong> to{' '}
                <strong className="text-slate-900 font-mono">{Math.min(safeCurrentPage * pageSize, totalItems)}</strong> of{' '}
                <strong className="text-slate-900 font-mono">{totalItems}</strong> transactions
              </span>
              <div className="hidden sm:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-200">
                <span className="text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="py-1 px-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#002b49]"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
                title="First Page"
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ChevronsLeft className="w-4 h-4 text-slate-700" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                title="Previous Page"
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    return (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - safeCurrentPage) <= 1
                    );
                  })
                  .map((page, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showEllipsis = prev && page - prev > 1;

                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && <span className="px-1 text-slate-400 font-bold">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[28px] h-7 px-2 rounded font-bold text-xs transition-colors cursor-pointer ${
                            safeCurrentPage === page
                              ? 'bg-[#002b49] text-white shadow-xs'
                              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                title="Next Page"
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-slate-700" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
                title="Last Page"
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <ChevronsRight className="w-4 h-4 text-slate-700" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Detail & Audit Trail Modal */}
      {detailModalTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="bg-[#002b49] text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-amber-400">
                    {detailModalTransaction.orderId}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs">{detailModalTransaction.applicationName}</span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  Transaction Audit Trail & Gateway Metadata
                </h3>
              </div>
              <button
                onClick={() => setDetailModalTransaction(null)}
                className="text-white/80 hover:text-white font-bold p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-xs">
              {/* Top metadata grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-500 block">Transaction ID</span>
                  <span className="font-mono font-bold text-slate-900">{detailModalTransaction.id}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Date & Time</span>
                  <span className="font-semibold text-slate-900 block">{formatDate(detailModalTransaction.createdAt)}</span>
                  <span className="font-mono text-[10px] text-slate-500">{formatTime(detailModalTransaction.createdAt)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Total Amount</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatINR(detailModalTransaction.totalAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Gateway</span>
                  <span className="font-bold text-slate-800">
                    {detailModalTransaction.gateway === 'CCAVENUE' ? 'HDFC Collect Now (Razorpay)' : detailModalTransaction.gateway === 'WORLDLINE_PAYNIMO' ? 'Worldline / Paynimo' : 'Demo Simulator'}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Merchant TID</span>
                  <span className="font-mono text-slate-800">{detailModalTransaction.gatewayTid}</span>
                </div>
              </div>

              {/* Status & Bank Auth */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Banking Settlement Data:</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-extrabold uppercase ${
                      detailModalTransaction.status === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-800'
                        : detailModalTransaction.status === 'FAILED'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {detailModalTransaction.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 font-mono">
                  <div>Bank Ref: {detailModalTransaction.bankReference || 'None'}</div>
                  <div>Auth Code: {detailModalTransaction.authCode || 'None'}</div>
                  <div>Mode: {detailModalTransaction.paymentMode}</div>
                  <div>Bank: {detailModalTransaction.bankName || 'Direct PG'}</div>
                </div>
                {detailModalTransaction.statusReason && (
                  <p className="text-[11px] text-rose-700 mt-1 bg-rose-50 p-2 rounded border border-rose-200">
                    {detailModalTransaction.statusReason}
                  </p>
                )}
              </div>

              {/* Conflict Resolution & Reconciliation Box */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-800" />
                    <span className="font-bold text-amber-900 text-xs">Administrative Reconciliation & Dispute Resolution</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowReconcilePanel(!showReconcilePanel);
                      setRecBankRef(detailModalTransaction.bankReference || '');
                      setRecStatus(detailModalTransaction.status === 'SUCCESS' ? 'SUCCESS' : 'SUCCESS');
                    }}
                    className="px-2.5 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded font-bold text-[11px] transition-colors cursor-pointer"
                  >
                    {showReconcilePanel ? 'Cancel' : 'Reconcile / Resolve Discrepancy'}
                  </button>
                </div>

                {recSuccessMsg && (
                  <div className="p-2.5 bg-emerald-100 border border-emerald-300 rounded text-emerald-800 text-[11px] font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>{recSuccessMsg}</span>
                  </div>
                )}

                {showReconcilePanel && (
                  <form onSubmit={handleReconcileSubmit} className="pt-2 space-y-3 border-t border-amber-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Reconciled Status
                        </label>
                        <select
                          value={recStatus}
                          onChange={(e) => setRecStatus(e.target.value as any)}
                          className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-900 font-bold"
                        >
                          <option value="SUCCESS">SUCCESS (Mark as Settled / Paid)</option>
                          <option value="FAILED">FAILED (Mark as Failed / Declined)</option>
                          <option value="CANCELLED">CANCELLED (Refunded / Aborted)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Bank Reference / UTR
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. HDFC-REF-992100"
                          value={recBankRef}
                          onChange={(e) => setRecBankRef(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded p-1.5 font-mono text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Dispute / Audit Resolution Note *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Verified with bank statement; student presented UTR confirmation."
                        value={recNote}
                        onChange={(e) => setRecNote(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded p-1.5 text-slate-900"
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        disabled={recSubmitting}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded text-xs transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {recSubmitting ? 'Persisting to Database...' : 'Save & Sync Resolution'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Step-by-Step Audit Trail */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2 uppercase tracking-wider text-[11px]">
                  Lifecycle Event Log
                </h4>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {detailModalTransaction.auditTrail.map((step, idx) => (
                    <div key={idx} className="p-3 flex items-start gap-3">
                      <div className="mt-0.5">
                        {step.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {step.status === 'fail' && <XCircle className="w-4 h-4 text-rose-600" />}
                        {step.status === 'warn' && <Clock className="w-4 h-4 text-amber-600" />}
                        {step.status === 'info' && <ShieldCheck className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{step.step}</span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(step.timestamp).toLocaleTimeString('en-IN')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Webhook Delivery response */}
              {detailModalTransaction.callbackResponse && (
                <div className="bg-slate-900 text-slate-300 p-3.5 rounded-xl font-mono text-[11px] space-y-1">
                  <div
                    className={`font-bold ${
                      detailModalTransaction.callbackDelivered && detailModalTransaction.callbackResponse.httpStatus === 200
                        ? 'text-emerald-400'
                        : detailModalTransaction.callbackResponse.httpStatus === 0 || !detailModalTransaction.callbackDelivered
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {detailModalTransaction.callbackDelivered && detailModalTransaction.callbackResponse.httpStatus === 200
                      ? `Callback Dispatched: HTTP ${detailModalTransaction.callbackResponse.httpStatus} OK`
                      : detailModalTransaction.callbackResponse.httpStatus === 0 || !detailModalTransaction.callbackDelivered
                      ? 'S2S Webhook: Queued for Delivery (Pending Target Endpoint Availability)'
                      : `Callback Attempt Failed (HTTP ${detailModalTransaction.callbackResponse.httpStatus}): Retrying`}
                  </div>
                  <div className="text-slate-400 text-[10px] truncate">
                    Target: {detailModalTransaction.callbackResponse.targetUrl}
                  </div>
                  <div className="text-amber-300 text-[10px] break-all">
                    Payload / Status: {detailModalTransaction.callbackResponse.payloadSnippet}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 rounded-b-2xl border-t border-slate-200 flex items-center justify-between text-xs">
              <button
                onClick={() => {
                  setDetailModalTransaction(null);
                  onViewReceipt(detailModalTransaction);
                }}
                className="text-[#002b49] font-bold hover:underline"
              >
                Open Official Tax Receipt
              </button>

              <button
                onClick={() => setDetailModalTransaction(null)}
                className="px-4 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
