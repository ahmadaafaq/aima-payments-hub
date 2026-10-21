import React, { useState, useEffect } from 'react';
import {
  Shield, CheckCircle2, XCircle, RefreshCw,
  ChevronDown, ChevronUp, Key, Plus, ExternalLink,
  Layers, Check, Trash2, ArrowRight, Link as LinkIcon
} from 'lucide-react';

export interface SourceApplication {
  id: string;
  sourceCode: string;
  aliases?: string[];
  name: string;
  department?: string;
  description?: string;
  isActive: boolean;
  assignedGateway: string;
  allowedReturnUrls: string[];
  notificationUrl: string;
  allowedGateways: string[];
  createdAt: string;
  updatedAt: string;
}

const ADMIN_TOKEN = 'aima-admin-dev-token-2026';

async function adminFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('aima_admin_token') || ADMIN_TOKEN;
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
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
  onSaveConfig,
  onDelete,
}: {
  app: SourceApplication;
  onToggle: (code: string, active: boolean) => void;
  onRotateKey: (code: string) => void;
  onSaveConfig: (code: string, updates: { name: string; assignedGateway: string; allowedReturnUrls: string[]; notificationUrl: string }) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form edit states
  const [name, setName] = useState(app.name);
  const [selectedGw, setSelectedGw] = useState(app.assignedGateway || 'CCAVENUE');
  const [returnUrlsText, setReturnUrlsText] = useState((app.allowedReturnUrls || []).join('\n'));
  const [notificationUrl, setNotificationUrl] = useState(app.notificationUrl || '');

  useEffect(() => {
    setName(app.name);
    setSelectedGw(app.assignedGateway || 'CCAVENUE');
    setReturnUrlsText((app.allowedReturnUrls || []).join('\n'));
    setNotificationUrl(app.notificationUrl || '');
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

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(app.sourceCode);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const urls = returnUrlsText
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean);

      await onSaveConfig(app.sourceCode, {
        name: name.trim(),
        assignedGateway: selectedGw,
        allowedReturnUrls: urls,
        notificationUrl: notificationUrl.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(`Save Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs hover:border-slate-300 transition-colors">
      {/* Header Row */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between p-4 cursor-pointer select-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[#00223b] text-white flex items-center justify-center font-bold text-xs shrink-0">
            {app.sourceCode.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 text-sm">{app.name}</span>
              <span className="font-mono text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                {app.sourceCode}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border font-bold bg-blue-50 text-blue-800 border-blue-200">
                {app.assignedGateway === 'WORLDLINE_PAYNIMO' ? 'Worldline / Paynimo' : 'HDFC Collect Now (Razorpay)'}
              </span>
              <StatusBadge isActive={app.isActive} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              Return URLs: {app.allowedReturnUrls?.length || 0} configured · Webhook: {app.notificationUrl ? 'Active' : 'Not set'}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0 ml-2"
          aria-label="Expand application configuration"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded Direct Configuration Form */}
      {expanded && (
        <form onSubmit={handleSave} className="border-t border-slate-100 bg-slate-50/70 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Field 1: Platform Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Platform Display Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-[#00223b] focus:outline-none"
              />
            </div>

            {/* Field 2: Assigned Payment Gateway */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Assigned Payment Gateway *
              </label>
              <select
                value={selectedGw}
                onChange={(e) => setSelectedGw(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-[#00223b] focus:outline-none"
              >
                <option value="CCAVENUE">HDFC Collect Now (Razorpay) — Recommended</option>
                <option value="WORLDLINE_PAYNIMO">Worldline / Paynimo</option>
                <option value="DEMO_SIMULATOR">Demo Simulator (Testing Only)</option>
              </select>
            </div>
          </div>

          {/* Field 3: Return URL Allowlist (Editable) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-[#00223b]" />
                Return URL Allowlist (One URL per line)
              </label>
              <span className="text-[11px] text-slate-500">
                Where students are redirected after payment completion
              </span>
            </div>
            <textarea
              rows={3}
              value={returnUrlsText}
              onChange={(e) => setReturnUrlsText(e.target.value)}
              placeholder="https://caseleague.aima.in&#10;https://research.aima.in"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-[#00223b] focus:outline-none"
            />
          </div>

          {/* Field 4: S2S Notification Webhook URL */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-[#00223b]" />
                S2S Notification Webhook URL
              </label>
              <span className="text-[11px] text-slate-500">
                Server-to-Server endpoint that receives payment status confirmation
              </span>
            </div>
            <input
              type="url"
              value={notificationUrl}
              onChange={(e) => setNotificationUrl(e.target.value)}
              placeholder="https://caseleague.aima.in/api/v1/payment-notification"
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-[#00223b] focus:outline-none"
            />
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#00223b] hover:bg-[#003860] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save Changes
              </button>

              {saveSuccess && (
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Changes saved and synced to database!
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggle}
                disabled={toggling}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  app.isActive
                    ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                {toggling ? <RefreshCw className="w-3 h-3 animate-spin" /> : (app.isActive ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />)}
                {app.isActive ? 'Deactivate Platform' : 'Activate Platform'}
              </button>

              <button
                type="button"
                onClick={handleRotate}
                disabled={rotating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
              >
                {rotating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
                Rotate API Key
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
              >
                {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete
              </button>
            </div>
          </div>
        </form>
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
    assignedGateway: 'CCAVENUE',
    allowedReturnUrls: '',
    notificationUrl: '',
  });
  const [registering, setRegistering] = useState(false);

  const loadApps = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/api/v1/admin/applications');
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load applications`);
      const data = await res.json();
      setApps(data.applications || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load application registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

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

  const handleSaveConfig = async (code: string, updates: { name: string; assignedGateway: string; allowedReturnUrls: string[]; notificationUrl: string }) => {
    const res = await adminFetch(`/api/v1/admin/applications/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Server responded with ${res.status}`);
    }
    await loadApps();
  };

  const handleDeleteApp = async (code: string) => {
    if (!window.confirm(`Are you sure you want to delete '${code}' platform? All future transactions from this source will be blocked.`)) return;
    try {
      const res = await adminFetch(`/api/v1/admin/applications/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete application');
      }
      await loadApps();
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const urls = regForm.allowedReturnUrls
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await adminFetch('/api/v1/admin/applications', {
        method: 'POST',
        body: JSON.stringify({
          sourceCode: regForm.sourceCode.trim().toUpperCase(),
          name: regForm.name.trim(),
          department: regForm.department,
          assignedGateway: regForm.assignedGateway,
          allowedReturnUrls: urls.length > 0 ? urls : ['http://localhost:3000'],
          notificationUrl: regForm.notificationUrl.trim() || 'http://localhost:3000/api/callback',
          allowedPaymentPurposes: ['REGISTRATION_FEE'],
          amountRules: [
            {
              paymentPurpose: 'REGISTRATION_FEE',
              description: `${regForm.name} Fee`,
              mode: 'VARIABLE',
              minAmountPaise: 1000,
              maxAmountPaise: 10000000,
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
      setRotatedKey({ code: regForm.sourceCode.toUpperCase(), key: data.apiKey });
      setRegForm({
        sourceCode: '',
        name: '',
        department: 'CME',
        assignedGateway: 'CCAVENUE',
        allowedReturnUrls: '',
        notificationUrl: '',
      });
      await loadApps();
    } catch (err: any) {
      alert(`Registration Error: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  const activeCount = apps.filter((a) => a.isActive).length;

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#00223b]" />
            Source Platforms & Gateway Routing
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure institutional source platforms, assigned payment gateways, return URLs, and webhooks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRegisterModal(true)}
            className="px-3.5 py-2 rounded-lg bg-[#00223b] hover:bg-[#003860] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Platform
          </button>
          <div className="text-right pl-3 border-l border-slate-200">
            <div className="text-xl font-bold text-[#00223b]">
              {activeCount}<span className="text-slate-400 text-xs font-normal">/{apps.length}</span>
            </div>
            <div className="text-[11px] text-slate-500">Active Platforms</div>
          </div>
          <button
            onClick={loadApps}
            className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Refresh application list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Rotated / New Key Alert */}
      {rotatedKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs">
              <Key className="w-4 h-4" />
              API Key for {rotatedKey.code} — Copy Now (shown once only)
            </div>
            <button
              onClick={() => setRotatedKey(null)}
              className="text-amber-700 hover:text-amber-900 text-xs font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
          <div className="bg-white border border-amber-200 rounded-lg p-2.5 font-mono text-xs text-slate-800 break-all select-all">
            {rotatedKey.key}
          </div>
          <p className="text-[11px] text-amber-700">
            Deliver this key securely to the technical team of {rotatedKey.code}. It will not be shown again.
          </p>
        </div>
      )}

      {/* App cards list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-slate-500 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading registered platforms...</span>
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
              onSaveConfig={handleSaveConfig}
              onDelete={handleDeleteApp}
            />
          ))}
        </div>
      )}

      {/* Add Platform Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#00223b]" />
                Register New Source Platform
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateApp} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Source Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CASE_LEAGUE"
                    value={regForm.sourceCode}
                    onChange={(e) => setRegForm({ ...regForm, sourceCode: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    placeholder="e.g. CME or CMS"
                    value={regForm.department}
                    onChange={(e) => setRegForm({ ...regForm, department: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Platform Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AIMA Case League & Olympiad"
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Payment Gateway *</label>
                <select
                  value={regForm.assignedGateway}
                  onChange={(e) => setRegForm({ ...regForm, assignedGateway: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold"
                >
                  <option value="CCAVENUE">HDFC Collect Now (Razorpay)</option>
                  <option value="WORLDLINE_PAYNIMO">Worldline / Paynimo</option>
                  <option value="DEMO_SIMULATOR">Demo Simulator</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Allowed Return URLs (One per line)</label>
                <textarea
                  rows={2}
                  placeholder="https://caseleague.aima.in&#10;http://localhost:3000"
                  value={regForm.allowedReturnUrls}
                  onChange={(e) => setRegForm({ ...regForm, allowedReturnUrls: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">S2S Notification Webhook URL</label>
                <input
                  type="url"
                  placeholder="https://caseleague.aima.in/api/v1/payment-notification"
                  value={regForm.notificationUrl}
                  onChange={(e) => setRegForm({ ...regForm, notificationUrl: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registering}
                  className="px-4 py-2 bg-[#002b49] hover:bg-[#003860] text-white rounded-lg font-bold transition-colors cursor-pointer"
                >
                  {registering ? 'Registering...' : 'Register Platform'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
