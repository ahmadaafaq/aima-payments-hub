import React, { useState, useEffect } from 'react';
import {
  Shield, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Key, Plus, Activity, Lock,
  Clock, ArrowRight, RotateCcw, ExternalLink, Zap,
  Building2, Settings, Layers, Cpu, Check
} from 'lucide-react';

interface AmountRule {
  paymentPurpose: string;
  description: string;
  mode: 'FIXED' | 'VARIABLE' | 'RANGE';
  fixedAmountPaise?: number;
  minAmountPaise?: number;
  maxAmountPaise?: number;
  currency: 'INR';
  gstApplicable: boolean;
}

interface CredentialSummary {
  credentialId: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  revokedAt?: string;
}

interface SourceApplication {
  id: string;
  sourceCode: string;
  aliases?: string[];
  name: string;
  department?: string;
  description: string;
  isActive: boolean;
  assignedGateway: string;
  routingMode: 'AUTO' | 'USER_SELECTABLE';
  allowedReturnUrls: string[];
  notificationUrl: string;
  allowedPaymentPurposes: string[];
  amountRules: AmountRule[];
  allowedGateways: string[];
  credentialSummary: CredentialSummary[];
  createdAt: string;
  updatedAt: string;
  auditHistory: Array<{ timestamp: string; action: string; detail: string; performedBy: string }>;
}

const ADMIN_TOKEN = 'aima-admin-dev-token-2026';

async function adminFetch(path: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ADMIN_TOKEN}`,
      ...options.headers,
    },
  });
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
      <XCircle className="w-3 h-3" /> Inactive
    </span>
  );
}

function AppCard({
  app,
  onToggle,
  onRotateKey,
  onUpdateGateway,
}: {
  app: SourceApplication;
  onToggle: (code: string, active: boolean) => void;
  onRotateKey: (code: string) => void;
  onUpdateGateway: (code: string, assignedGateway: string, routingMode: 'AUTO' | 'USER_SELECTABLE') => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);

  const [selectedGw, setSelectedGw] = useState(app.assignedGateway || 'CCAVENUE');
  const [selectedMode, setSelectedMode] = useState<'AUTO' | 'USER_SELECTABLE'>(app.routingMode || 'AUTO');
  const [gwSuccess, setGwSuccess] = useState(false);

  useEffect(() => {
    setSelectedGw(app.assignedGateway || 'CCAVENUE');
    setSelectedMode(app.routingMode || 'AUTO');
  }, [app]);

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(app.sourceCode, !app.isActive);
    setToggling(false);
  };

  const handleRotate = async () => {
    if (!window.confirm(`Rotate API key for ${app.sourceCode}? The old key will be immediately revoked.`)) return;
    setRotating(true);
    await onRotateKey(app.sourceCode);
    setRotating(false);
  };

  const handleSaveGateway = async () => {
    setSavingGateway(true);
    try {
      await onUpdateGateway(app.sourceCode, selectedGw, selectedMode);
      setGwSuccess(true);
      setTimeout(() => setGwSuccess(false), 2500);
    } catch (err: any) {
      alert(`Failed to update gateway assignment: ${err.message}`);
    } finally {
      setSavingGateway(false);
    }
  };

  const gatewayColors: Record<string, string> = {
    WORLDLINE_PAYNIMO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    CCAVENUE: 'bg-blue-50 text-blue-700 border-blue-200',
    DEMO_SIMULATOR: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const deptColors: Record<string, string> = {
    CME: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    CMS: 'bg-sky-50 text-sky-700 border-sky-200',
    LMA: 'bg-teal-50 text-teal-700 border-teal-200',
    VLC: 'bg-purple-50 text-purple-700 border-purple-200',
    Events: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 ${app.isActive ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-75'}`}>
      {/* Card Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[#00223b] flex items-center justify-center shrink-0 shadow-sm">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 text-sm">{app.name}</span>
              <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">{app.sourceCode}</span>
              {app.department && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${deptColors[app.department] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  {app.department}
                </span>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-bold ${gatewayColors[app.assignedGateway] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                {app.assignedGateway === 'WORLDLINE_PAYNIMO' ? 'Worldline' : 'HDFC / CCAvenue'}
              </span>
              <StatusBadge isActive={app.isActive} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{app.description}</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 ml-2"
          aria-label="Expand application details"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Quick stats row */}
      <div className="flex gap-4 px-4 pb-3 text-xs text-slate-500 border-b border-slate-100">
        <span className="flex items-center gap-1 font-mono"><Cpu className="w-3.5 h-3.5 text-slate-400" /> Mode: <strong>{app.routingMode || 'AUTO'}</strong></span>
        <span className="flex items-center gap-1"><Key className="w-3 h-3 text-slate-400" /> {app.credentialSummary.filter(c => c.isActive).length} active key</span>
        <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-slate-400" /> {app.allowedPaymentPurposes.length} purposes</span>
        <span className="flex items-center gap-1"><Activity className="w-3 h-3 text-slate-400" /> {app.allowedGateways.length} gateways</span>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4">
          {/* Dynamic Gateway Assignment Box */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#00223b]" />
              Gateway Routing Assignment (No Code Change Required)
            </h5>
            <p className="text-xs text-slate-500 mb-3">
              Configure the automated gateway assignment for this source application. Changes take effect immediately for all subsequent transactions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Assigned Payment Gateway</label>
                <select
                  value={selectedGw}
                  onChange={(e) => setSelectedGw(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-[#00223b] focus:outline-none"
                >
                  <option value="CCAVENUE">HDFC / CCAvenue (CME & CMS Default)</option>
                  <option value="WORLDLINE_PAYNIMO">Worldline / Paynimo (LMA & VLC Default)</option>
                  <option value="DEMO_SIMULATOR">Demo Simulator (Phase 1 Testing)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Routing Mode</label>
                <select
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value as 'AUTO' | 'USER_SELECTABLE')}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-[#00223b] focus:outline-none"
                >
                  <option value="AUTO">AUTO (Direct to Assigned Gateway)</option>
                  <option value="USER_SELECTABLE">USER_SELECTABLE (Allow User Choice)</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveGateway}
                disabled={savingGateway}
                className="px-3 py-1.5 bg-[#00223b] hover:bg-[#003860] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {savingGateway ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save Assignment Policy
              </button>
              {gwSuccess && (
                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Updated successfully!
                </span>
              )}
            </div>
          </div>

          {/* Allowed Return URLs */}
          <div>
            <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Return URL Allowlist</h5>
            <ul className="space-y-1">
              {app.allowedReturnUrls.map((url, i) => (
                <li key={i} className="flex items-center gap-1.5 text-xs text-slate-700">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="font-mono">{url}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Notification URL */}
          <div>
            <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">S2S Notification URL</h5>
            <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-700">
              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
              {app.notificationUrl}
            </div>
          </div>

          {/* Amount Rules */}
          <div>
            <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Amount Rules</h5>
            <div className="space-y-1.5">
              {app.amountRules.map((rule, i) => (
                <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-700">{rule.paymentPurpose}</span>
                    <span className="text-xs text-slate-500 ml-2">{rule.description}</span>
                  </div>
                  <div className="text-xs text-slate-600 shrink-0 ml-2">
                    {rule.mode === 'FIXED'
                      ? <span className="text-emerald-700 font-mono">{formatPaise(rule.fixedAmountPaise!)}</span>
                      : <span className="font-mono">{formatPaise(rule.minAmountPaise!)} – {formatPaise(rule.maxAmountPaise!)}</span>
                    }
                    {rule.gstApplicable && <span className="ml-1.5 text-amber-600 text-xs">+GST</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Allowed Gateways */}
          <div>
            <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Allowed Gateways</h5>
            <div className="flex gap-2 flex-wrap">
              {app.allowedGateways.map((gw, i) => (
                <span key={i} className={`text-xs px-2 py-1 rounded-full border font-medium ${gatewayColors[gw] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                  {gw.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>

          {/* Credential Summary */}
          <div>
            <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Credentials</h5>
            <div className="space-y-1.5">
              {app.credentialSummary.map((cred) => (
                <div key={cred.credentialId} className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 border ${cred.isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                  <div className="flex items-center gap-2">
                    <Key className="w-3 h-3 text-slate-400" />
                    <span className="font-mono text-slate-700">{cred.keyPrefix}••••••••••••••</span>
                    {cred.isActive
                      ? <span className="text-emerald-600 font-semibold">Active</span>
                      : <span className="text-rose-500">Revoked</span>
                    }
                  </div>
                  <span className="text-slate-400">{new Date(cred.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Audit History (last 3) */}
          <div>
            <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Recent Audit Events</h5>
            <div className="space-y-1">
              {app.auditHistory.slice(-3).reverse().map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <Clock className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                  <span className="text-slate-400 shrink-0">{new Date(entry.timestamp).toLocaleDateString('en-IN')}</span>
                  <span className="font-semibold text-slate-700 shrink-0">{entry.action}</span>
                  <span>{entry.detail}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-slate-200">
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                app.isActive
                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              {toggling ? <RefreshCw className="w-3 h-3 animate-spin" /> : (app.isActive ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />)}
              {app.isActive ? 'Deactivate' : 'Activate'}
            </button>
            <button
              onClick={handleRotate}
              disabled={rotating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors"
            >
              {rotating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Rotate API Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppRegistry() {
  const [apps, setApps] = useState<SourceApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotatedKey, setRotatedKey] = useState<{ code: string; key: string } | null>(null);

  // New application registration modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regForm, setRegForm] = useState({
    sourceCode: '',
    name: '',
    department: 'CME',
    description: '',
    assignedGateway: 'CCAVENUE',
    routingMode: 'AUTO',
    allowedReturnUrls: 'https://myapp.aima.in, http://localhost:4000',
    notificationUrl: 'https://myapp.aima.in/api/v1/payment-notification',
    paymentPurpose: 'REGISTRATION_FEE',
    feeAmount: '1000',
  });
  const [registering, setRegistering] = useState(false);

  const loadApps = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/applications');
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();
      setApps(data.applications || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load application registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadApps(); }, []);

  const handleToggle = async (code: string, isActive: boolean) => {
    try {
      const res = await adminFetch(`/api/v1/admin/applications/${encodeURIComponent(code)}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      await loadApps();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleRotateKey = async (code: string) => {
    try {
      const res = await adminFetch(`/api/v1/admin/applications/${encodeURIComponent(code)}/rotate-key`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to rotate key');
      const data = await res.json();
      setRotatedKey({ code, key: data.apiKey });
      await loadApps();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleUpdateGateway = async (code: string, assignedGateway: string, routingMode: 'AUTO' | 'USER_SELECTABLE') => {
    const res = await adminFetch(`/api/v1/admin/applications/${encodeURIComponent(code)}/gateway`, {
      method: 'PUT',
      body: JSON.stringify({ assignedGateway, routingMode }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server responded with ${res.status}`);
    }
    await loadApps();
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const urls = regForm.allowedReturnUrls.split(',').map(s => s.trim()).filter(Boolean);
      const parsedFee = parseFloat(regForm.feeAmount) || 1000;
      const res = await adminFetch('/api/v1/admin/applications', {
        method: 'POST',
        body: JSON.stringify({
          sourceCode: regForm.sourceCode.trim(),
          name: regForm.name.trim(),
          department: regForm.department,
          description: regForm.description,
          assignedGateway: regForm.assignedGateway,
          routingMode: regForm.routingMode,
          allowedReturnUrls: urls,
          notificationUrl: regForm.notificationUrl.trim(),
          allowedPaymentPurposes: [regForm.paymentPurpose.trim() || 'REGISTRATION_FEE'],
          amountRules: [
            {
              paymentPurpose: regForm.paymentPurpose.trim() || 'REGISTRATION_FEE',
              description: `${regForm.name} Fee`,
              mode: 'VARIABLE',
              minAmountPaise: Math.round(parsedFee * 50),
              maxAmountPaise: Math.round(parsedFee * 500),
              currency: 'INR',
              gstApplicable: true,
            },
          ],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to register application');
      }

      const data = await res.json();
      setShowRegisterModal(false);
      setRotatedKey({ code: regForm.sourceCode, key: data.apiKey });
      await loadApps();
    } catch (err: any) {
      alert(`Registration Error: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  const activeCount = apps.filter((a) => a.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#00223b]" />
            Application Registry & Gateway Routing Policy
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage registered source applications, departmental routing matrix, credentials, and allowlists.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRegisterModal(true)}
            className="px-3.5 py-2 rounded-lg bg-[#00223b] hover:bg-[#003860] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Application
          </button>
          <div className="text-right pl-3 border-l border-slate-200">
            <div className="text-2xl font-bold text-[#00223b]">{activeCount}<span className="text-slate-400 text-sm font-normal">/{apps.length}</span></div>
            <div className="text-xs text-slate-500">Active Apps</div>
          </div>
          <button
            onClick={loadApps}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            title="Refresh application list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Automatic Gateway Routing Policy Banner */}
      <div className="bg-[#00223b]/5 border border-[#00223b]/20 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-[#00223b] shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-[#00223b] mb-1">Source-to-Gateway Matrix & Automatic Routing Policy</p>
          <p className="text-slate-600 text-xs leading-relaxed">
            Applications in <strong>CME</strong> & <strong>CMS</strong> (AMIACRC, CME Admission, CME AMD DNC, AMT, MAT B School, UGAT) route automatically to <strong>HDFC / CCAvenue</strong>.
            Applications in <strong>LMA</strong> & <strong>VLC</strong> route automatically to <strong>Worldline / Paynimo</strong>.
            Any unmapped source applications route to <strong>HDFC / CCAvenue</strong> by default. Administrators can reassign gateways dynamically without modifying code.
          </p>
        </div>
      </div>

      {/* Rotated / New Key Alert */}
      {rotatedKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
              <Key className="w-4 h-4" />
              API Key for {rotatedKey.code} — Copy Now (shown once only)
            </div>
            <button onClick={() => setRotatedKey(null)} className="text-amber-700 hover:text-amber-900 text-xs font-semibold">Dismiss</button>
          </div>
          <div className="bg-white border border-amber-200 rounded-lg p-3 font-mono text-xs text-slate-800 break-all select-all">
            {rotatedKey.key}
          </div>
          <p className="text-xs text-amber-700">⚠️ Deliver this key securely to the source application engineering team. It will never be displayed again.</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-2 text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* App cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading application registry...</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <AppCard
              key={app.sourceCode}
              app={app}
              onToggle={handleToggle}
              onRotateKey={handleRotateKey}
              onUpdateGateway={handleUpdateGateway}
            />
          ))}
        </div>
      )}

      {/* Register Application Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#00223b]" />
                <h3 className="text-base font-bold text-slate-900">Register New Source Application</h3>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateApp} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Project / Source Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AMIACRC"
                    value={regForm.sourceCode}
                    onChange={(e) => setRegForm({ ...regForm, sourceCode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department *</label>
                  <select
                    value={regForm.department}
                    onChange={(e) => setRegForm({ ...regForm, department: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  >
                    <option value="CME">CME (Centre for Management Education)</option>
                    <option value="CMS">CMS (Centre for Management Services)</option>
                    <option value="LMA">LMA (Local Management Associations)</option>
                    <option value="VLC">VLC (Virtual Learning Centre)</option>
                    <option value="Corporate">Corporate / Case Studies</option>
                    <option value="Events">Conventions & Events</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Application Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AIMA Centre for Research and Case Studies"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assigned Payment Gateway *</label>
                  <select
                    value={regForm.assignedGateway}
                    onChange={(e) => setRegForm({ ...regForm, assignedGateway: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                  >
                    <option value="CCAVENUE">HDFC / CCAvenue</option>
                    <option value="WORLDLINE_PAYNIMO">Worldline / Paynimo</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Routing Mode *</label>
                  <select
                    value={regForm.routingMode}
                    onChange={(e) => setRegForm({ ...regForm, routingMode: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                  >
                    <option value="AUTO">AUTO (Automatic Gateway Routing)</option>
                    <option value="USER_SELECTABLE">USER_SELECTABLE (User Chooses)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Allowed Return URLs (Comma-separated) *</label>
                <input
                  type="text"
                  required
                  placeholder="https://app.aima.in, http://localhost:4000"
                  value={regForm.allowedReturnUrls}
                  onChange={(e) => setRegForm({ ...regForm, allowedReturnUrls: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">S2S Notification Webhook URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://app.aima.in/api/v1/payment-notification"
                  value={regForm.notificationUrl}
                  onChange={(e) => setRegForm({ ...regForm, notificationUrl: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Payment Purpose Code</label>
                  <input
                    type="text"
                    placeholder="REGISTRATION_FEE"
                    value={regForm.paymentPurpose}
                    onChange={(e) => setRegForm({ ...regForm, paymentPurpose: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estimated Base Fee (₹ INR)</label>
                  <input
                    type="number"
                    placeholder="1000"
                    value={regForm.feeAmount}
                    onChange={(e) => setRegForm({ ...regForm, feeAmount: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="px-5 py-2 bg-[#00223b] hover:bg-[#003860] text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {registering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Register Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Integration guide link */}
      <div className="border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-slate-700">Source Application Integration Specification</p>
            <p className="text-xs text-slate-500">Refer to <code className="bg-slate-100 px-1 rounded font-mono">docs/integration/README.md</code> for request signing, common /pay redirect parameters, and S2S notification verification.</p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400" />
      </div>
    </div>
  );
}
