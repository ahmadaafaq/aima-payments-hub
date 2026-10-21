-- ===========================================================
-- AIMA CENTRALIZED PAYMENTS HUB
-- Supabase PostgreSQL Schema
-- Project: setjjgjhuslevgnqcnhj.supabase.co
-- Run this in the Supabase SQL Editor
-- ===========================================================

-- ===========================================================
-- TABLE 1: aima_payment_transactions
-- Persistent ledger of every payment attempt
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.aima_payment_transactions (
  id                    TEXT PRIMARY KEY,
  order_id              TEXT NOT NULL UNIQUE,
  application_id        TEXT NOT NULL,
  application_code      TEXT NOT NULL,
  application_name      TEXT NOT NULL,
  application_ref       TEXT,
  applicant_name        TEXT NOT NULL,
  applicant_email       TEXT NOT NULL,
  applicant_phone       TEXT,
  course_or_event       TEXT,
  fee_description       TEXT,
  base_amount           NUMERIC(12,2) NOT NULL,
  gst_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount          NUMERIC(12,2) NOT NULL,
  gateway_amount        NUMERIC(12,2),
  currency              TEXT NOT NULL DEFAULT 'INR',
  gateway               TEXT NOT NULL,
  gateway_display_name  TEXT,
  gateway_environment   TEXT NOT NULL DEFAULT 'sandbox',
  is_simulated          BOOLEAN NOT NULL DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'PENDING',
  status_reason         TEXT,
  bank_reference        TEXT,
  auth_code             TEXT,
  payment_mode          TEXT,
  bank_name             TEXT,
  gateway_transaction_id TEXT,
  gateway_status_code   TEXT,
  idempotency_key       TEXT,
  verification_method   TEXT,
  callback_delivered    BOOLEAN NOT NULL DEFAULT FALSE,
  callback_response     JSONB,
  audit_trail           JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  verified_at           TIMESTAMPTZ,
  session_token         TEXT,
  return_url            TEXT,
  external_order_id     TEXT,
  payment_purpose       TEXT
);

CREATE INDEX IF NOT EXISTS idx_apt_application_code ON public.aima_payment_transactions(application_code);
CREATE INDEX IF NOT EXISTS idx_apt_gateway           ON public.aima_payment_transactions(gateway);
CREATE INDEX IF NOT EXISTS idx_apt_status            ON public.aima_payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_apt_created_at        ON public.aima_payment_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apt_applicant_email   ON public.aima_payment_transactions(applicant_email);
CREATE INDEX IF NOT EXISTS idx_apt_bank_ref          ON public.aima_payment_transactions(bank_reference);
CREATE INDEX IF NOT EXISTS idx_apt_gateway_txn_id    ON public.aima_payment_transactions(gateway_transaction_id);

ALTER TABLE public.aima_payment_transactions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.aima_payment_transactions TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "Allow hub service access" ON public.aima_payment_transactions;
CREATE POLICY "Allow hub service access"
  ON public.aima_payment_transactions FOR ALL USING (true) WITH CHECK (true);

-- ===========================================================
-- TABLE 2: aima_source_applications
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.aima_source_applications (
  id                        TEXT PRIMARY KEY,
  source_code               TEXT NOT NULL UNIQUE,
  aliases                   TEXT[] DEFAULT '{}',
  name                      TEXT NOT NULL,
  department                TEXT,
  description               TEXT,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_gateway          TEXT NOT NULL DEFAULT 'CCAVENUE',
  routing_mode              TEXT NOT NULL DEFAULT 'AUTO',
  allowed_return_urls       TEXT[] DEFAULT '{}',
  notification_url          TEXT,
  allowed_payment_purposes  TEXT[] DEFAULT '{}',
  allowed_gateways          TEXT[] DEFAULT '{CCAVENUE,WORLDLINE_PAYNIMO,DEMO_SIMULATOR}',
  amount_rules              JSONB DEFAULT '[]'::JSONB,
  credentials               JSONB DEFAULT '[]'::JSONB,
  audit_history             JSONB DEFAULT '[]'::JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asa_source_code  ON public.aima_source_applications(source_code);
CREATE INDEX IF NOT EXISTS idx_asa_department   ON public.aima_source_applications(department);
CREATE INDEX IF NOT EXISTS idx_asa_gateway      ON public.aima_source_applications(assigned_gateway);
CREATE INDEX IF NOT EXISTS idx_asa_is_active    ON public.aima_source_applications(is_active);

ALTER TABLE public.aima_source_applications ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.aima_source_applications TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "Allow hub admin access" ON public.aima_source_applications;
CREATE POLICY "Allow hub admin access"
  ON public.aima_source_applications FOR ALL USING (true) WITH CHECK (true);

-- ===========================================================
-- TABLE 3: aima_hub_admin_users
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.aima_hub_admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  role          TEXT NOT NULL DEFAULT 'admin',
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.aima_hub_admin_users ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.aima_hub_admin_users TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "Allow hub admin users access" ON public.aima_hub_admin_users;
CREATE POLICY "Allow hub admin users access"
  ON public.aima_hub_admin_users FOR ALL USING (true) WITH CHECK (true);

-- Default admin (password: AimaAdmin@2026)
INSERT INTO public.aima_hub_admin_users (username, email, password_hash, full_name, role)
VALUES (
  'admin',
  'tech@aima.in',
  '$2b$10$YKj2fCvxkr1V9c3eEZfnHuN8X5nQ7sLxAbrD2.RWr0pjD0h3GdqGe',
  'AIMA Payments Admin',
  'superadmin'
) ON CONFLICT (username) DO NOTHING;

-- ===========================================================
-- TABLE 4: aima_admin_audit_log
-- ===========================================================
CREATE TABLE IF NOT EXISTS public.aima_admin_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user    TEXT NOT NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  detail        JSONB,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aal_action       ON public.aima_admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_aal_admin_user   ON public.aima_admin_audit_log(admin_user);
CREATE INDEX IF NOT EXISTS idx_aal_performed_at ON public.aima_admin_audit_log(performed_at DESC);

ALTER TABLE public.aima_admin_audit_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.aima_admin_audit_log TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "Allow admin audit log access" ON public.aima_admin_audit_log;
CREATE POLICY "Allow admin audit log access"
  ON public.aima_admin_audit_log FOR ALL USING (true) WITH CHECK (true);
