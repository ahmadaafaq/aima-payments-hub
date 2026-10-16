import React, { useState, useEffect } from 'react';
import { Header, ActiveTab } from './components/Header';
import { ApplicationSelector } from './components/ApplicationSelector';
import { CentralizedPaymentPage } from './components/CentralizedPaymentPage';
import { PaymentSimulatorModal } from './components/PaymentSimulatorModal';
import { WorldlineSandboxModal } from './components/WorldlineSandboxModal';
import { CCAvenueCheckoutModal } from './components/CCAvenueCheckoutModal';
import { PaymentResult } from './components/PaymentResult';
import { OriginatingAppSyncDemo } from './components/OriginatingAppSyncDemo';
import { AdminDashboard } from './components/AdminDashboard';
import { StakeholderDemoGuide } from './components/StakeholderDemoGuide';
import { AppRegistry } from './components/AppRegistry';
import { AimaLogo } from './components/AimaLogo';
import { AIMA_APPLICATIONS, INITIAL_TRANSACTIONS } from './data/aimaApplications';
import { 
  AimaApplication, 
  ApplicantPreset, 
  PaymentGateway, 
  PaymentStatus, 
  TransactionRecord,
  GatewayStatusInfo
} from './types/payment';
import { 
  getStoredTransactions, 
  saveTransaction, 
  resetDemoTransactions 
} from './services/paymentStorage';
import { 
  fetchGatewayStatus, 
  createServerOrder, 
  initiateWorldlineCheckout, 
  initiateCCAvenueCheckout,
  postWorldlineCallback,
  recordSimulatorTransactionApi 
} from './services/gatewayApi';
import { ShieldCheck, Info, CheckCircle2, RotateCcw, AlertTriangle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('applications');
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);

  // Gateway status cache from server
  const [gatewayStatuses, setGatewayStatuses] = useState<{ [key in PaymentGateway]?: GatewayStatusInfo }>({
    WORLDLINE_PAYNIMO: {
      id: 'WORLDLINE_PAYNIMO',
      name: 'Worldline / Paynimo (Sandbox)',
      environment: 'sandbox',
      status: 'CONFIGURED',
      statusLabel: 'Sandbox Configured',
      canProcessLiveSandbox: true,
      configuredDetails: {
        merchantId: 'T945221',
        schemeCode: 'FIRST',
        testAmountLimits: '₹1.00 – ₹10.00',
        testCredentialsHint: 'Bank login: test / test',
      },
      missingEnvVars: [],
    },
    CCAVENUE: {
      id: 'CCAVENUE',
      name: 'HDFC / CCAvenue (Sandbox)',
      environment: 'sandbox',
      status: 'CONFIG_REQUIRED',
      statusLabel: 'Sandbox configuration required',
      canProcessLiveSandbox: false,
      blockerDetails: 'CCAvenue test credentials missing. The email correspondence only supplied LIVE credentials (TID 76098022, ACCT ID 4168947, secure.ccavenue.com). Sandboxes require separate test.ccavenue.com credentials.',
      missingEnvVars: ['CCAVENUE_MERCHANT_ID', 'CCAVENUE_ACCESS_CODE', 'CCAVENUE_WORKING_KEY'],
    },
    DEMO_SIMULATOR: {
      id: 'DEMO_SIMULATOR',
      name: 'Demo Simulator (Phase 1)',
      environment: 'simulated',
      status: 'CONFIGURED',
      statusLabel: 'Demo Simulator Ready',
      canProcessLiveSandbox: false,
      missingEnvVars: [],
    },
  });

  // Current checkout session state
  const [selectedApp, setSelectedApp] = useState<AimaApplication>(AIMA_APPLICATIONS[0]);
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantPreset>(AIMA_APPLICATIONS[0].sampleApplicants[0]);
  const [activeOrderId, setActiveOrderId] = useState<string>('ORD-AIMA-MAT-4410');
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway>('WORLDLINE_PAYNIMO');
  
  // Modals state
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [isWorldlineModalOpen, setIsWorldlineModalOpen] = useState<boolean>(false);
  const [worldlinePayload, setWorldlinePayload] = useState<any>(null);
  const [isCCAvenueModalOpen, setIsCCAvenueModalOpen] = useState<boolean>(false);
  const [ccavenuePayload, setCcavenuePayload] = useState<any>(null);
  const [isInitiating, setIsInitiating] = useState<boolean>(false);
  const [initiationError, setInitiationError] = useState<string | null>(null);

  const [lastTransaction, setLastTransaction] = useState<TransactionRecord | null>(null);
  const [checkoutSubView, setCheckoutSubView] = useState<'form' | 'result'>('form');
  const [sessionReturnUrl, setSessionReturnUrl] = useState<string | null>(null);

  // Load initial stored transactions & gateway statuses on mount
  useEffect(() => {
    // 1. Load local transactions
    const list = getStoredTransactions();
    setTransactions(list);
    if (list.length > 0) {
      setLastTransaction(list[0]);
    }

    // 2. Fetch live gateway statuses from server
    fetchGatewayStatus()
      .then((res) => {
        if (res?.gateways) {
          setGatewayStatuses(res.gateways);
        }
      })
      .catch((err) => {
        console.warn('Could not query /api/gateways/status:', err);
      });

    // 3. Try to sync server transactions
    fetch('/api/transactions')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.transactions) && data.transactions.length > 0) {
          setTransactions(data.transactions);
          setLastTransaction(data.transactions[0]);
        }
      })
      .catch(() => {
        // graceful offline fallback
      });

    // 4. Check for checkout session token in URL path /checkout/:token or ?session=
    const pathname = window.location.pathname;
    let sessionToken = '';
    if (pathname.includes('/checkout/')) {
      sessionToken = pathname.split('/checkout/')[1]?.split('/')[0] || '';
    } else {
      sessionToken = new URLSearchParams(window.location.search).get('session') || '';
    }

    if (sessionToken) {
      fetch(`/api/v1/session/${sessionToken}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.session) {
            const sess = data.session;
            if (sess.returnUrl) {
              setSessionReturnUrl(sess.returnUrl);
            }
            setActiveOrderId(sess.orderId);
            if (sess.selectedGateway) {
              setSelectedGateway(sess.selectedGateway as PaymentGateway);
            }
            // Match application
            const foundApp = AIMA_APPLICATIONS.find(
              (a) =>
                a.code.toUpperCase() === sess.sourceCode.toUpperCase() ||
                a.name.toUpperCase().includes(sess.sourceCode.toUpperCase())
            ) || AIMA_APPLICATIONS[0];
            setSelectedApp(foundApp);

            setSelectedApplicant({
              name: sess.customerName || 'Candidate',
              refNo: sess.applicationReference || sess.orderId,
              email: sess.customerEmail || 'applicant@aima.in',
              phone: sess.customerPhone || '',
              courseOrEvent: sess.paymentPurpose || 'Case League Registration',
              feeDescription: sess.paymentPurpose || 'Registration Fee',
              baseAmount: (sess.amountPaise || 10000) / 100,
              gstAmount: 0,
              totalAmount: (sess.amountPaise || 10000) / 100,
            });

            setActiveTab('checkout');
            setCheckoutSubView('form');
          }
        })
        .catch((err) => {
          console.warn('Could not resolve checkout session:', err);
        });
    }
  }, []);

  const generateOrderId = (appCode: string) => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `ORD-AIMA-${appCode}-${rand}`;
  };

  const generateTxnId = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(10000 + Math.random() * 90000);
    return `TXN-${dateStr}-${rand}`;
  };

  // Handler: When user clicks "Initiate Payment" on an application card
  const handleInitiatePayment = (
    app: AimaApplication,
    applicant: ApplicantPreset,
    customOrderId?: string
  ) => {
    setSelectedApp(app);
    setSelectedApplicant(applicant);
    const orderId = customOrderId || generateOrderId(app.code);
    setActiveOrderId(orderId);
    if (app.assignedGateway) {
      setSelectedGateway(app.assignedGateway);
    }
    setInitiationError(null);
    setCheckoutSubView('form');
    setActiveTab('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler: Proceed to pay button clicked on checkout page
  const handleProceedToPay = async (chosenGateway: PaymentGateway) => {
    setInitiationError(null);

    // GATEWAY 1: Genuine Worldline Sandbox Payment
    if (chosenGateway === 'WORLDLINE_PAYNIMO') {
      const wlStatus = gatewayStatuses['WORLDLINE_PAYNIMO'];
      if (wlStatus && !wlStatus.canProcessLiveSandbox) {
        setInitiationError('Gateway Configuration Error: Worldline / Paynimo sandbox credentials are not configured.');
        return;
      }
      setIsInitiating(true);
      try {
        // 1. Create order on server
        const newTxn = await createServerOrder({
          applicationId: selectedApp.id,
          applicationCode: selectedApp.code,
          applicationName: selectedApp.name,
          applicationRef: selectedApplicant.refNo,
          applicantName: selectedApplicant.name,
          applicantEmail: selectedApplicant.email,
          applicantPhone: selectedApplicant.phone,
          courseOrEvent: selectedApplicant.courseOrEvent,
          feeDescription: selectedApplicant.feeDescription,
          baseAmount: selectedApplicant.baseAmount,
          gstAmount: selectedApplicant.gstAmount,
          totalAmount: selectedApplicant.totalAmount,
          gateway: 'WORLDLINE_PAYNIMO',
          portalUrl: selectedApp.portalUrl,
        });

        // 2. Fetch server-signed checkout token
        const initResponse = await initiateWorldlineCheckout(newTxn.id);
        setWorldlinePayload(initResponse.payload);
        setLastTransaction(newTxn);
        setIsWorldlineModalOpen(true);
      } catch (err: any) {
        setInitiationError(err.message || 'Failed to initiate Worldline Sandbox session');
      } finally {
        setIsInitiating(false);
      }
      return;
    }

    // GATEWAY 2: CCAvenue Live Kit Payment
    if (chosenGateway === 'CCAVENUE') {
      const ccStatus = gatewayStatuses['CCAVENUE'];
      if (ccStatus && !ccStatus.canProcessLiveSandbox) {
        setInitiationError(
          'Gateway Configuration Error: HDFC / CCAvenue sandbox credentials are not configured. Cannot process payments without active test keys. Falling back to simulator is strictly prohibited.'
        );
        return;
      }
      setIsInitiating(true);
      try {
        const newTxn = await createServerOrder({
          applicationId: selectedApp.id,
          applicationCode: selectedApp.code,
          applicationName: selectedApp.name,
          applicationRef: selectedApplicant.refNo,
          applicantName: selectedApplicant.name,
          applicantEmail: selectedApplicant.email,
          applicantPhone: selectedApplicant.phone,
          courseOrEvent: selectedApplicant.courseOrEvent,
          feeDescription: selectedApplicant.feeDescription,
          baseAmount: selectedApplicant.baseAmount,
          gstAmount: selectedApplicant.gstAmount,
          totalAmount: selectedApplicant.totalAmount,
          gateway: 'CCAVENUE',
          portalUrl: selectedApp.portalUrl,
        });

        const initResponse = await initiateCCAvenueCheckout(newTxn.id);
        setCcavenuePayload(initResponse.payload);
        setLastTransaction(newTxn);
        setIsCCAvenueModalOpen(true);
      } catch (err: any) {
        setInitiationError(err.message || 'Failed to initiate CCAvenue Live Kit session');
      } finally {
        setIsInitiating(false);
      }
      return;
    }

    // GATEWAY 3: Phase 1 Demo Simulator
    setIsSimulatorOpen(true);
  };

  // Handler: Received response from CCAvenue
  const handleCCAvenueResponse = async (encResp: string, orderId: string) => {
    setIsCCAvenueModalOpen(false);

    try {
      const res = await fetch('/api/payments/ccavenue/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encResp, orderNo: orderId }),
      });
      const data = await res.json();
      if (!data.success || !data.transaction) {
        throw new Error(data.error || 'CCAvenue verification failed');
      }
      const verifiedTxn = data.transaction;
      const updatedList = saveTransaction(verifiedTxn);
      setTransactions(updatedList);
      setLastTransaction(verifiedTxn);
      setCheckoutSubView('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      alert(`CCAvenue Gateway verification error: ${err.message}`);
    }
  };

  // Handler: Received response from Worldline Sandbox
  const handleWorldlineSandboxResponse = async (responsePayload: any) => {
    setIsWorldlineModalOpen(false);

    try {
      // Post callback to server for verification
      const verifiedTxn = await postWorldlineCallback(responsePayload);
      const updatedList = saveTransaction(verifiedTxn);
      setTransactions(updatedList);
      setLastTransaction(verifiedTxn);
      setCheckoutSubView('result');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      alert(`Gateway verification error: ${err.message}`);
    }
  };

  // Handler: Complete Phase 1 simulated payment
  const handleCompleteSimulation = async (
    status: PaymentStatus,
    paymentMode: 'NetBanking' | 'Credit Card' | 'Debit Card' | 'UPI' | 'Corporate NB',
    bankName: string,
    reason?: string
  ) => {
    setIsSimulatorOpen(false);

    const now = new Date().toISOString();
    const txnId = generateTxnId();

    const authCode =
      status === 'SUCCESS'
        ? `AUTH-SIM-${Math.floor(10000 + Math.random() * 90000)}`
        : undefined;

    const bankRef =
      status === 'SUCCESS' || status === 'PENDING'
        ? `SIM-REF-${Math.floor(10000000 + Math.random() * 90000000)}`
        : undefined;

    const simulatedRecord: TransactionRecord = {
      id: txnId,
      orderId: activeOrderId,
      applicationId: selectedApp.id,
      applicationCode: selectedApp.code,
      applicationName: selectedApp.name,
      applicationRef: selectedApplicant.refNo,
      applicantName: selectedApplicant.name,
      applicantEmail: selectedApplicant.email,
      applicantPhone: selectedApplicant.phone,
      courseOrEvent: selectedApplicant.courseOrEvent,
      feeDescription: selectedApplicant.feeDescription,
      baseAmount: selectedApplicant.baseAmount,
      gstAmount: selectedApplicant.gstAmount,
      totalAmount: selectedApplicant.totalAmount,
      gatewayAmount: selectedApplicant.totalAmount,
      currency: 'INR',
      gateway: 'DEMO_SIMULATOR',
      gatewayEnvironment: 'simulated',
      isSimulated: true,
      gatewayTid: 'SIM-DEMO-01',
      gatewayAcctId: 'AIMA-SIMULATOR',
      status: status,
      statusReason: reason,
      bankReference: bankRef,
      authCode: authCode,
      paymentMode: paymentMode,
      bankName: bankName,
      createdAt: now,
      completedAt: status !== 'PENDING' ? now : undefined,
      verifiedAt: status !== 'PENDING' ? now : undefined,
      verificationMethod: 'SIMULATED',
      callbackDelivered: status !== 'PENDING',
      callbackResponse: {
        httpStatus: 200,
        deliveredAt: now,
        targetUrl: `${selectedApp.portalUrl}/api/v1/payment-callback`,
        payloadSnippet: JSON.stringify({
          orderId: activeOrderId,
          status: status === 'SUCCESS' ? 'PAID' : status,
          txnId: txnId,
        }),
      },
      auditTrail: [
        {
          step: 'Order Initiated (Simulator)',
          timestamp: now,
          detail: `Simulated order ${activeOrderId} for ${selectedApp.code}`,
          status: 'ok',
        },
        {
          step: 'Simulation State Triggered',
          timestamp: now,
          detail: `Presenter triggered outcome: ${status} (${paymentMode})`,
          status: status === 'SUCCESS' ? 'ok' : status === 'FAILED' ? 'fail' : status === 'PENDING' ? 'warn' : 'info',
        },
      ],
    };

    try {
      await recordSimulatorTransactionApi(simulatedRecord);
    } catch {
      // fallback to localStorage
    }

    const updatedList = saveTransaction(simulatedRecord);
    setTransactions(updatedList);
    setLastTransaction(simulatedRecord);
    setCheckoutSubView('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handler: Reset demo data
  const handleResetData = async () => {
    if (window.confirm('Reset demo transactions back to default baseline?')) {
      try {
        await fetch('/api/transactions/reset', { method: 'POST' });
      } catch {
        // offline
      }
      const resetList = resetDemoTransactions();
      setTransactions(resetList);
      if (resetList.length > 0) {
        setLastTransaction(resetList[0]);
      }
      setSelectedApp(AIMA_APPLICATIONS[0]);
      setSelectedApplicant(AIMA_APPLICATIONS[0].sampleApplicants[0]);
      setActiveOrderId(generateOrderId(AIMA_APPLICATIONS[0].code));
      setCheckoutSubView('form');
    }
  };

  // Handler: Demo Guide 1-click launcher
  const handleLaunchScenario = (
    scenario: 'worldline_sandbox' | 'ccavenue_audit' | 'simulator_success' | 'simulator_failed' | 'simulator_pending'
  ) => {
    if (scenario === 'worldline_sandbox') {
      const app = AIMA_APPLICATIONS.find((a) => a.id === 'mat') || AIMA_APPLICATIONS[0];
      setSelectedApp(app);
      setSelectedApplicant(app.sampleApplicants[0]);
      setActiveOrderId(generateOrderId(app.code));
      setSelectedGateway('WORLDLINE_PAYNIMO');
      setCheckoutSubView('form');
      setActiveTab('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (scenario === 'ccavenue_audit') {
      const app = AIMA_APPLICATIONS.find((a) => a.id === 'case-league') || AIMA_APPLICATIONS[2];
      setSelectedApp(app);
      setSelectedApplicant(app.sampleApplicants[0]);
      setActiveOrderId(generateOrderId(app.code));
      setSelectedGateway('CCAVENUE');
      setCheckoutSubView('form');
      setActiveTab('checkout');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const app = AIMA_APPLICATIONS.find((a) => a.id === 'cme') || AIMA_APPLICATIONS[1];
      setSelectedApp(app);
      setSelectedApplicant(app.sampleApplicants[0]);
      setActiveOrderId(generateOrderId(app.code));
      setSelectedGateway('DEMO_SIMULATOR');
      setCheckoutSubView('form');
      setActiveTab('checkout');
      setIsSimulatorOpen(true);
    }
  };

  const currentTxnForDisplay = lastTransaction || transactions[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Institutional Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onResetData={handleResetData}
        hasActiveOrder={checkoutSubView === 'form'}
      />

      {/* Initiation Error Banner if any */}
      {initiationError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-900">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span><strong>Gateway Initiation Notice:</strong> {initiationError}</span>
            </div>
            <button
              onClick={() => setInitiationError(null)}
              className="text-rose-700 hover:text-rose-900 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab 1: Applications Dashboard */}
        {activeTab === 'applications' && (
          <ApplicationSelector onInitiatePayment={handleInitiatePayment} />
        )}

        {/* Tab 2: Centralized Payment Page & Result */}
        {activeTab === 'checkout' && (
          <>
            {checkoutSubView === 'form' ? (
              <CentralizedPaymentPage
                application={selectedApp}
                applicant={selectedApplicant}
                orderId={activeOrderId}
                selectedGateway={selectedGateway}
                gatewayStatuses={gatewayStatuses}
                onSelectGateway={setSelectedGateway}
                onProceedToPay={handleProceedToPay}
                onBackToApps={() => setActiveTab('applications')}
              />
            ) : (
              currentTxnForDisplay && (
                <PaymentResult
                  transaction={currentTxnForDisplay}
                  sessionReturnUrl={sessionReturnUrl}
                  autoReturnSeconds={2}
                  onReturnToOriginatingApp={() => {
                    if (sessionReturnUrl && currentTxnForDisplay) {
                      try {
                        const target = new URL(sessionReturnUrl);
                        target.searchParams.set('orderId', currentTxnForDisplay.orderId);
                        target.searchParams.set('reference', currentTxnForDisplay.applicationRef || currentTxnForDisplay.orderId);
                        target.searchParams.set('status', currentTxnForDisplay.status);
                        target.searchParams.set('amount', String(currentTxnForDisplay.totalAmount));
                        target.searchParams.set('currency', currentTxnForDisplay.currency || 'INR');
                        target.searchParams.set('gateway', currentTxnForDisplay.gateway);
                        target.searchParams.set('authCode', currentTxnForDisplay.bankReference || ('AUTH_' + Math.floor(100000 + Math.random() * 900000)));
                        window.location.href = target.toString();
                        return;
                      } catch (err) {
                        console.warn('Invalid session return URL:', err);
                      }
                    }
                    setActiveTab('sync');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onRetryPayment={() => {
                    setCheckoutSubView('form');
                    setActiveOrderId(generateOrderId(selectedApp.code));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onRecheckPendingStatus={async (id) => {
                    try {
                      const res = await fetch(`/api/payments/status/${id}`);
                      const data = await res.json();
                      if (data?.transaction) {
                        setLastTransaction(data.transaction);
                      }
                    } catch {}
                  }}
                />
              )
            )}
          </>
        )}

        {/* Tab 3: Admin Dashboard */}
        {activeTab === 'admin' && (
          <AdminDashboard
            transactions={transactions}
            onResetData={handleResetData}
            onViewReceipt={(txn) => {
              setLastTransaction(txn);
              setSelectedApp(
                AIMA_APPLICATIONS.find((a) => a.id === txn.applicationId) || AIMA_APPLICATIONS[0]
              );
              setCheckoutSubView('result');
              setActiveTab('checkout');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onViewSync={(txn) => {
              setLastTransaction(txn);
              setSelectedApp(
                AIMA_APPLICATIONS.find((a) => a.id === txn.applicationId) || AIMA_APPLICATIONS[0]
              );
              setActiveTab('sync');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Tab 4: Originating App Return Sync Demo */}
        {activeTab === 'sync' && currentTxnForDisplay && (
          <OriginatingAppSyncDemo
            transaction={currentTxnForDisplay}
            application={
              AIMA_APPLICATIONS.find((a) => a.id === currentTxnForDisplay.applicationId) ||
              AIMA_APPLICATIONS[0]
            }
            onInitiateNewPayment={() => setActiveTab('applications')}
            onRetryPayment={() => {
              const app =
                AIMA_APPLICATIONS.find((a) => a.id === currentTxnForDisplay.applicationId) ||
                AIMA_APPLICATIONS[0];
              setSelectedApp(app);
              setCheckoutSubView('form');
              setActiveOrderId(generateOrderId(app.code));
              setActiveTab('checkout');
            }}
          />
        )}

        {/* Tab 5: Stakeholder Demo Guide */}
        {activeTab === 'guide' && (
          <StakeholderDemoGuide
            onLaunchScenario={handleLaunchScenario}
            onOpenAdmin={() => setActiveTab('admin')}
            onOpenApps={() => setActiveTab('applications')}
          />
        )}

        {/* Tab 6: Phase 3 Application Registry (Admin) */}
        {activeTab === 'registry' && (
          <AppRegistry />
        )}
      </main>

      {/* Worldline Genuine Sandbox Modal */}
      {currentTxnForDisplay && (
        <WorldlineSandboxModal
          transaction={currentTxnForDisplay}
          checkoutPayload={worldlinePayload}
          isOpen={isWorldlineModalOpen}
          onClose={() => setIsWorldlineModalOpen(false)}
          onSandboxResponse={handleWorldlineSandboxResponse}
        />
      )}

      {/* CCAvenue Live Kit Test Gateway Modal */}
      {currentTxnForDisplay && (
        <CCAvenueCheckoutModal
          transaction={currentTxnForDisplay}
          checkoutPayload={ccavenuePayload}
          isOpen={isCCAvenueModalOpen}
          onClose={() => setIsCCAvenueModalOpen(false)}
          onCCAvenueResponse={handleCCAvenueResponse}
        />
      )}

      {/* Phase 1 Demo Simulator Modal */}
      <PaymentSimulatorModal
        application={selectedApp}
        applicant={selectedApplicant}
        orderId={activeOrderId}
        gateway={selectedGateway}
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onCompleteSimulation={handleCompleteSimulation}
      />

      {/* Institutional Footer */}
      <footer className="bg-[#00223b] text-slate-300 border-t border-[#093557] mt-12 py-10 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-700/60">
            <div className="flex items-center gap-4">
              <AimaLogo size="sm" variant="light" />
              <div>
                <span className="font-bold text-white text-sm block">
                  ALL INDIA MANAGEMENT ASSOCIATION
                </span>
                <span className="text-xs text-slate-400">
                  Apex Body for Management in India · Established in 1957
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="font-mono text-emerald-400">Worldline Sandbox: T945221</span>
              <span>·</span>
              <span className="font-mono text-amber-400">CCAvenue: Config Required</span>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
            <div>
              Management House, 14, Institutional Area, Lodi Road, New Delhi - 110003, India
            </div>
            <div className="flex items-center gap-4">
              <span>GSTIN: 07AAATA0865F1Z2</span>
              <span>·</span>
              <span>SAC: 999293</span>
              <span>·</span>
              <span className="text-emerald-400 font-semibold">Phase 2 Sandbox Enabled</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
