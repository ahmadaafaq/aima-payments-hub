import React, { useState } from 'react';
import { AIMA_APPLICATIONS } from '../data/aimaApplications';
import { AimaApplication, ApplicantPreset } from '../types/payment';
import { formatINR } from '../services/paymentStorage';
import { 
  GraduationCap, 
  FileText, 
  Users, 
  Award, 
  Calendar, 
  Building2, 
  Compass, 
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  SlidersHorizontal,
  ChevronRight
} from 'lucide-react';

interface ApplicationSelectorProps {
  onInitiatePayment: (
    app: AimaApplication,
    applicant: ApplicantPreset,
    customOrderId?: string
  ) => void;
}

export const ApplicationSelector: React.FC<ApplicationSelectorProps> = ({
  onInitiatePayment,
}) => {
  const [selectedAppId, setSelectedAppId] = useState<string>('mat');
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<{ [appId: string]: number }>({
    mat: 0,
    cme: 0,
    'case-league': 0,
    ugat: 0,
    lma: 0,
    amt: 0,
    'aima-vcc': 0,
    events: 0,
  });

  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customApp, setCustomApp] = useState<AimaApplication>(AIMA_APPLICATIONS[0]);
  const [customForm, setCustomForm] = useState<ApplicantPreset>({
    name: 'Dr. Vikram Malhotra',
    refNo: 'AIMA-CUSTOM-2026-99',
    email: 'vikram.malhotra@iim.ac.in',
    phone: '+91 98201 99112',
    courseOrEvent: 'Executive Leadership Colloquium',
    feeDescription: 'Delegation Registration & Study Material',
    baseAmount: 5000,
    gstAmount: 900,
    totalAmount: 5900,
  });

  const categories = ['All', 'Exams', 'Academics', 'Corporate', 'Affiliation', 'Events'];

  const filteredApps = filterCategory === 'All' 
    ? AIMA_APPLICATIONS 
    : AIMA_APPLICATIONS.filter((app) => app.category === filterCategory);

  const getAppIcon = (id: string) => {
    switch (id) {
      case 'mat':
        return <GraduationCap className="w-5 h-5 text-sky-700" />;
      case 'cme':
        return <FileText className="w-5 h-5 text-blue-700" />;
      case 'case-league':
        return <Award className="w-5 h-5 text-indigo-700" />;
      case 'ugat':
        return <Compass className="w-5 h-5 text-cyan-700" />;
      case 'lma':
        return <Building2 className="w-5 h-5 text-emerald-700" />;
      case 'amt':
        return <Sparkles className="w-5 h-5 text-blue-600" />;
      case 'aima-vcc':
        return <Users className="w-5 h-5 text-violet-700" />;
      case 'events':
        return <Calendar className="w-5 h-5 text-amber-700" />;
      default:
        return <GraduationCap className="w-5 h-5 text-slate-700" />;
    }
  };

  const handleSelectPreset = (appId: string, idx: number) => {
    setSelectedPresetIndex((prev) => ({ ...prev, [appId]: idx }));
    setSelectedAppId(appId);
  };

  const handleLaunchPayment = (app: AimaApplication) => {
    const idx = selectedPresetIndex[app.id] || 0;
    const applicant = app.sampleApplicants[idx] || app.sampleApplicants[0];
    onInitiatePayment(app, applicant);
  };

  const handleLaunchCustom = (e: React.FormEvent) => {
    e.preventDefault();
    onInitiatePayment(customApp, customForm);
    setShowCustomModal(false);
  };

  return (
    <div className="space-y-8">
      {/* Hero / Strategic Context Header */}
      <div className="bg-gradient-to-br from-[#002b49] via-[#003860] to-[#044e82] text-white rounded-xl shadow-lg border border-[#0e5285] p-6 sm:p-8">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
            <span>AIMA Executive Architecture</span>
            <span aria-hidden="true">·</span>
            <span>Consolidated Payment Gateway</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
            One Gateway for All AIMA Applications
          </h1>
          <p className="text-slate-200 text-sm sm:text-base leading-relaxed mb-6">
            Historically, each AIMA division managed fragmented payment forms. This centralized hub provides 
            a single, secure checkout experience for candidates, delegates, and member institutions—with unified 
            settlement and automatic 2-way status return to each originating application.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/15 text-xs text-slate-200">
            <div>
              <span className="block text-amber-300 font-bold text-base tabular-nums">8+ Verticals</span>
              <span>Unified under 1 MID</span>
            </div>
            <div>
              <span className="block text-amber-300 font-bold text-base tabular-nums">HDFC & Worldline</span>
              <span>Multi-rail failover</span>
            </div>
            <div>
              <span className="block text-amber-300 font-bold text-base tabular-nums">Auto Webhooks</span>
              <span>Direct ERP callbacks</span>
            </div>
            <div>
              <span className="block text-amber-300 font-bold text-base tabular-nums">Single MIS</span>
              <span>Daily reconciliation</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control bar: Category filter & Custom applicant trigger */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            1. Select an AIMA Application
          </h2>
          <p className="text-xs text-slate-500">
            Choose any program or exam below to launch a sample checkout flow.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Filter tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg text-xs font-medium overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filterCategory === cat
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCustomModal(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#002b49] bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
            <span>Custom Applicant</span>
          </button>
        </div>
      </div>

      {/* Grid of 8 AIMA Applications */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {filteredApps.map((app) => {
          const currentPresetIdx = selectedPresetIndex[app.id] || 0;
          const currentApplicant = app.sampleApplicants[currentPresetIdx] || app.sampleApplicants[0];
          const isSelected = selectedAppId === app.id;

          return (
            <div
              key={app.id}
              onClick={() => setSelectedAppId(app.id)}
              className={`flex flex-col justify-between bg-white rounded-xl border transition-all duration-200 p-5 cursor-pointer ${
                isSelected
                  ? 'border-[#002b49] shadow-md ring-2 ring-[#002b49]/10'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <div>
                {/* Header row: Icon & Category */}
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 rounded-lg bg-slate-100 border border-slate-200/80">
                    {getAppIcon(app.id)}
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    {app.category}
                  </span>
                </div>

                {/* Title & Tagline */}
                <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug mb-1">
                  {app.name}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mb-4 leading-relaxed">
                  {app.description}
                </p>

                {/* Sample Preset Selector */}
                <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 mb-4 text-xs">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Sample Candidate / Delegate:
                  </label>
                  {app.sampleApplicants.length > 1 ? (
                    <select
                      value={currentPresetIdx}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleSelectPreset(app.id, parseInt(e.target.value, 10));
                      }}
                      className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#002b49]"
                    >
                      {app.sampleApplicants.map((preset, idx) => (
                        <option key={preset.refNo} value={idx}>
                          {preset.name} ({formatINR(preset.totalAmount)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-slate-800 font-medium">
                      {currentApplicant.name}
                    </div>
                  )}

                  <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-mono">{currentApplicant.refNo}</span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatINR(currentApplicant.totalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Action Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleLaunchPayment(app);
                }}
                className={`w-full py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#002b49] text-white hover:bg-[#003860]'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <span>Initiate Payment</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Stakeholder Architecture Callout */}
      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 text-xs text-amber-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              Architecture Benefit: Decoupled Payment Logic
            </h4>
            <p className="text-slate-600 mt-0.5">
              Individual application teams (MAT, CME, Case League) no longer need to implement bank integration kits,
              manage checksum hashing, or handle PG upgrades. All payment logic, GST compliance, and reconciliation 
              is consolidated into this single hub.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-mono">TID: 76098022 · HDFC Bank</span>
        </div>
      </div>

      {/* Custom Applicant Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Configure Custom Test Transaction
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLaunchCustom} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Target AIMA Application
                </label>
                <select
                  value={customApp.id}
                  onChange={(e) => {
                    const found = AIMA_APPLICATIONS.find((a) => a.id === e.target.value);
                    if (found) setCustomApp(found);
                  }}
                  className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                >
                  {AIMA_APPLICATIONS.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Applicant / Entity Name
                  </label>
                  <input
                    type="text"
                    required
                    value={customForm.name}
                    onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Application Reference No.
                  </label>
                  <input
                    type="text"
                    required
                    value={customForm.refNo}
                    onChange={(e) => setCustomForm({ ...customForm, refNo: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={customForm.email}
                    onChange={(e) => setCustomForm({ ...customForm, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phone / Mobile
                  </label>
                  <input
                    type="tel"
                    required
                    value={customForm.phone}
                    onChange={(e) => setCustomForm({ ...customForm, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Fee Description
                </label>
                <input
                  type="text"
                  required
                  value={customForm.feeDescription}
                  onChange={(e) => setCustomForm({ ...customForm, feeDescription: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Base Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={customForm.baseAmount}
                    onChange={(e) => {
                      const base = parseFloat(e.target.value) || 0;
                      const gst = Math.round(base * 0.18);
                      setCustomForm({
                        ...customForm,
                        baseAmount: base,
                        gstAmount: gst,
                        totalAmount: base + gst,
                      });
                    }}
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    18% GST (₹)
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={customForm.gstAmount}
                    className="w-full border border-slate-200 bg-slate-100 rounded-lg p-2 font-mono text-slate-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Total (₹)
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={customForm.totalAmount}
                    className="w-full border border-slate-200 bg-amber-50 rounded-lg p-2 font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#002b49] text-white rounded-lg font-bold hover:bg-[#003860]"
                >
                  Proceed to Payment Hub
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
