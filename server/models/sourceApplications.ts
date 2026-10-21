/**
 * AIMA Payment Hub — Source Application Registry (Phase 3 + Automatic Gateway Routing)
 *
 * Each AIMA application (AMIACRC, CME Admission, MAT B School, UGAT, LMA, VLC, etc.)
 * must be registered here before it can initiate payments through the hub.
 *
 * Automatic Gateway Routing Matrix:
 *   - AMIACRC                     -> CME -> HDFC / CCAvenue
 *   - CME Admission – PGDM PGCM   -> CME -> HDFC / CCAvenue
 *   - CME AMD DNC                 -> CME -> HDFC / CCAvenue
 *   - AMT                         -> CMS -> HDFC / CCAvenue
 *   - MAT B School                -> CMS -> HDFC / CCAvenue
 *   - UGAT                        -> CMS -> HDFC / CCAvenue
 *   - LMA                         -> LMA -> Worldline / Paynimo
 *   - VLC                         -> VLC -> Worldline / Paynimo
 *   - All other unmapped sources  -> HDFC / CCAvenue (Default)
 *
 * Administrators can change gateway assignments and register new applications
 * dynamically without code changes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GatewayType } from '../gateways/gatewayTypes';
import { supabaseAdmin } from '../lib/supabaseClient';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const APPS_FILE_PATH = path.join(DATA_DIR, 'source_applications.json');

export type AmountValidationMode = 'FIXED' | 'VARIABLE' | 'RANGE';
export type GatewayRoutingMode = 'AUTO' | 'USER_SELECTABLE';

export interface AmountRule {
  paymentPurpose: string;         // e.g. 'EXAM_FEE', 'SEMESTER_FEE'
  description: string;
  mode: AmountValidationMode;
  fixedAmountPaise?: number;      // For FIXED mode — exact expected amount
  minAmountPaise?: number;        // For VARIABLE/RANGE
  maxAmountPaise?: number;        // For VARIABLE/RANGE
  currency: 'INR';
  gstApplicable: boolean;
}

export interface SourceCredential {
  credentialId: string;           // e.g. 'CRED-MAT-01'
  sourceCode: string;
  /** HMAC-SHA256 of the raw API key — never store plaintext */
  keyHash: string;
  /** First 6 chars of raw key for identification without exposing secret */
  keyPrefix: string;
  /** Whether this credential is the active (primary) one */
  isActive: boolean;
  createdAt: string;
  rotatedAt?: string;
  revokedAt?: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  detail: string;
  performedBy: string;
}

export interface SourceApplication {
  id: string;                     // Internal UUID
  sourceCode: string;             // e.g. 'AMIACRC', 'MAT B School', 'LMA'
  aliases?: string[];             // Alternative match strings e.g. ['MAT', 'MAT_BSCHOOL']
  name: string;
  department?: string;            // Department e.g. 'CME', 'CMS', 'LMA', 'VLC'
  description: string;
  isActive: boolean;
  assignedGateway?: GatewayType;   // Resolved gateway: 'CCAVENUE' | 'WORLDLINE_PAYNIMO'
  routingMode?: GatewayRoutingMode; // 'AUTO' (automatic routing) | 'USER_SELECTABLE'

  /** Registered return URL prefix (allowlist); exact origin match enforced */
  allowedReturnUrls: string[];
  /** Registered server-to-server notification endpoint */
  notificationUrl: string;

  /** Payment purposes this application is permitted to use */
  allowedPaymentPurposes: string[];
  /** Amount validation rules keyed by paymentPurpose */
  amountRules: AmountRule[];

  /** Which gateways this application may use */
  allowedGateways: GatewayType[];

  /** Credential metadata (secrets NOT stored here) */
  credentials: SourceCredential[];

  createdAt: string;
  updatedAt: string;
  auditHistory: AuditEntry[];
}

// ─── HMAC helpers ────────────────────────────────────────────────────────────

/** Hash a raw API key for storage. The key itself is never persisted. */
export function hashApiKey(rawKey: string): string {
  return crypto.createHmac('sha256', 'AIMA_KEY_HASH_PEPPER_2026').update(rawKey).digest('hex');
}

/** Verify a raw API key against a stored hash. */
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  const computed = hashApiKey(rawKey);
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'));
}

/** Generate a cryptographically random API key. */
export function generateApiKey(): string {
  return `aima_${crypto.randomBytes(24).toString('hex')}`;
}

// ─── Registry Store ───────────────────────────────────────────────────────────

export class SourceApplicationRegistry {
  private applications: Map<string, SourceApplication> = new Map();

  constructor() {
    this.initStore();
  }

  private initStore() {
    const isTest = process.env.NODE_ENV === 'test' || process.argv.some((a) => a.includes('.test.'));
    if (isTest) {
      this.seedDemoApplications();
      return;
    }

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {}

    let loaded = false;
    try {
      if (fs.existsSync(APPS_FILE_PATH)) {
        const raw = fs.readFileSync(APPS_FILE_PATH, 'utf-8');
        const list: SourceApplication[] = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          list.forEach((app) => this.applications.set(app.sourceCode.toUpperCase(), app));
          loaded = true;
          console.log(`[SourceApplicationRegistry] Loaded ${list.length} platforms from disk: ${APPS_FILE_PATH}`);
        }
      }
    } catch (err) {
      console.warn('[SourceApplicationRegistry] Disk read error:', err);
    }

    if (!loaded || this.applications.size === 0) {
      this.seedDemoApplications();
      this.persistToDisk();
    }

    this.syncFromSupabase().catch(() => {});
  }

  public persistToDisk() {
    if (process.env.VERCEL || process.env.NODE_ENV === 'test' || process.argv.some((a) => a.includes('.test.'))) return;
    try {
      const arr = Array.from(this.applications.values());
      fs.writeFileSync(APPS_FILE_PATH, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SourceApplicationRegistry] Disk write error:', err);
    }
  }

  private async syncFromSupabase() {
    try {
      const { data, error } = await supabaseAdmin.from('aima_source_applications').select('*');
      if (!error && Array.isArray(data) && data.length > 0) {
        for (const row of data) {
          const app: SourceApplication = {
            id: row.id,
            sourceCode: row.source_code,
            aliases: row.aliases || [],
            name: row.name,
            department: row.department || 'General',
            description: row.description || '',
            isActive: Boolean(row.is_active),
            assignedGateway: row.assigned_gateway,
            routingMode: row.routing_mode || 'AUTO',
            allowedReturnUrls: row.allowed_return_urls || [],
            notificationUrl: row.notification_url || '',
            allowedPaymentPurposes: row.allowed_payment_purposes || [],
            allowedGateways: row.allowed_gateways || ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
            amountRules: row.amount_rules || [],
            credentials: row.credentials || [],
            auditHistory: row.audit_history || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
          this.applications.set(app.sourceCode.toUpperCase(), app);
        }
        this.persistToDisk();
      }
    } catch (e) {}
  }

  public async upsertToSupabase(app: SourceApplication) {
    try {
      const row = {
        id: app.id,
        source_code: app.sourceCode,
        aliases: app.aliases || [],
        name: app.name,
        department: app.department || 'General',
        description: app.description || '',
        is_active: app.isActive,
        assigned_gateway: app.assignedGateway,
        routing_mode: app.routingMode,
        allowed_return_urls: app.allowedReturnUrls || [],
        notification_url: app.notificationUrl || '',
        allowed_payment_purposes: app.allowedPaymentPurposes || [],
        allowed_gateways: app.allowedGateways || [],
        amount_rules: app.amountRules || [],
        credentials: app.credentials || [],
        audit_history: app.auditHistory || [],
        created_at: app.createdAt,
        updated_at: app.updatedAt,
      };
      await supabaseAdmin.from('aima_source_applications').upsert(row, { onConflict: 'source_code' });
    } catch (e) {}
  }

  private seedDemoApplications() {
    const demoApps: Array<{ app: Omit<SourceApplication, 'credentials'>; rawKey: string }> = [
      // ── 1. AMIACRC (CME -> HDFC / CCAvenue) ──────────────────────────────
      {
        rawKey: 'aima_amiacrc_demo_key_2026',
        app: {
          id: 'src-amiacrc-001',
          sourceCode: 'AMIACRC',
          aliases: ['AMIACRC', 'AIMA_ICRC', 'CASE_LEAGUE', 'CASE-LEAGUE', 'AIMA_QUIZ', 'AIMA-QUIZ', 'RESEARCH_AIMA', 'AIMA_CASE_LEAGUE'],
          name: 'AIMA Centre for Research & Case Studies (AMIACRC)',
          department: 'CME',
          description: 'AIMA Centre for Management Research and Case Repository portal (Case League & Research)',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: [
            'https://amiacrc.aima.in',
            'https://example.com',
            'http://localhost:4010',
            'https://aima-quiz.vercel.app',
            'https://research.aima.in',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:5174',
            'http://127.0.0.1:3002',
            'http://0.0.0.0:3002',
            'http://0.0.0.0:3000',
          ],
          notificationUrl: 'https://amiacrc.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: [
            'CASE_STUDY_FEE',
            'RESEARCH_FEE',
            'REG123',
            'REGISTRATION_FEE',
            'BOOTCAMP_FEE',
            'TEAM_REGISTRATION',
            'INSTITUTE_REGISTRATION',
          ],
          amountRules: [
            {
              paymentPurpose: 'REGISTRATION_FEE',
              description: 'Case League & Research Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 1000,     // ₹10
              maxAmountPaise: 10000000, // ₹1,00,000
              currency: 'INR',
              gstApplicable: true,
            },
            {
              paymentPurpose: 'CASE_STUDY_FEE',
              description: 'Case Study Purchase Fee',
              mode: 'VARIABLE',
              minAmountPaise: 1000,    // ₹10
              maxAmountPaise: 10000000,  // ₹1,00,000
              currency: 'INR',
              gstApplicable: true,
            },
            {
              paymentPurpose: 'REG123',
              description: 'Research Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 1000,
              maxAmountPaise: 10000000,
              currency: 'INR',
              gstApplicable: false,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for CME -> CCAvenue', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 2. CME Admission – PGDM PGCM (CME -> HDFC / CCAvenue) ────────────
      {
        rawKey: 'aima_cme_admission_demo_key_2026',
        app: {
          id: 'src-cme-adm-001',
          sourceCode: 'CME Admission – PGDM PGCM',
          aliases: ['CME_ADMISSION', 'CME_PGDM', 'CME Admission', 'CME Admission - PGDM PGCM'],
          name: 'CME Admission – PGDM / PGCM',
          department: 'CME',
          description: 'AICTE Approved PGDM & PGCM Admissions Portal',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://cmeadmission.aima.in', 'https://cme.aima.in', 'http://localhost:4011'],
          notificationUrl: 'https://cmeadmission.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['ADMISSION_FEE', 'ENROLLMENT_FEE', 'SEMESTER_FEE'],
          amountRules: [
            {
              paymentPurpose: 'ADMISSION_FEE',
              description: 'Admission Processing & Enrollment Fee',
              mode: 'VARIABLE',
              minAmountPaise: 500000,   // ₹5,000
              maxAmountPaise: 3500000,  // ₹35,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for CME -> CCAvenue', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 3. CME AMD DNC (CME -> HDFC / CCAvenue) ──────────────────────────
      {
        rawKey: 'aima_cme_amd_dnc_demo_key_2026',
        app: {
          id: 'src-cme-amd-001',
          sourceCode: 'CME AMD DNC',
          aliases: ['CME_AMD_DNC', 'AMD_DNC', 'AMD DNC'],
          name: 'CME Advanced Management Diplomas (AMD/DNC)',
          department: 'CME',
          description: 'Diploma in Non-Profit & Advanced Management Certification Portal',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://cmeamd.aima.in', 'https://cme.aima.in', 'http://localhost:4012'],
          notificationUrl: 'https://cmeamd.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['DIPLOMA_FEE', 'EXAMINATION_FEE'],
          amountRules: [
            {
              paymentPurpose: 'DIPLOMA_FEE',
              description: 'AMD / DNC Course Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 500000,   // ₹5,000
              maxAmountPaise: 5000000,  // ₹50,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for CME -> CCAvenue', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 4. AMT (CMS -> HDFC / CCAvenue) ──────────────────────────────────
      {
        rawKey: 'aima_amt_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-amt-001',
          sourceCode: 'AMT',
          name: 'Advanced Management Training (AMT)',
          department: 'CMS',
          description: 'Advanced Management Training programs for corporate leaders (CMS)',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://amt.aima.in', 'http://localhost:4007'],
          notificationUrl: 'https://amt.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['PROGRAM_FEE', 'REGISTRATION_FEE'],
          amountRules: [
            {
              paymentPurpose: 'PROGRAM_FEE',
              description: 'AMT Program Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 2000000,  // ₹20,000
              maxAmountPaise: 20000000, // ₹2,00,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for CMS -> CCAvenue', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 5. MAT B School (CMS -> HDFC / CCAvenue) ─────────────────────────
      {
        rawKey: 'aima_mat_bschool_demo_key_2026',
        app: {
          id: 'src-mat-bschool-001',
          sourceCode: 'MAT B School',
          aliases: ['MAT_B_SCHOOL', 'MAT_BSCHOOL', 'MAT B-School', 'MAT BSCHOOL'],
          name: 'Management Aptitude Test — B-School Participation',
          department: 'CMS',
          description: 'Institutional MI / B-School participation in MAT scoring and candidate sourcing',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://matbschool.aima.in', 'https://mat.aima.in', 'http://localhost:4001'],
          notificationUrl: 'https://matbschool.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['PARTICIPATION_FEE', 'LISTING_FEE', 'EXAM_FEE'],
          amountRules: [
            {
              paymentPurpose: 'PARTICIPATION_FEE',
              description: 'MAT B-School Institutional Annual Participation Fee',
              mode: 'VARIABLE',
              minAmountPaise: 5000000,  // ₹50,000
              maxAmountPaise: 20000000, // ₹2,00,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for CMS -> CCAvenue', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 6. UGAT (CMS -> HDFC / CCAvenue) ─────────────────────────────────
      {
        rawKey: 'aima_ugat_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-ugat-001',
          sourceCode: 'UGAT',
          name: 'Undergraduate Aptitude Test (UGAT)',
          department: 'CMS',
          description: 'Undergraduate management entrance test for BBA/BHM/BCA (CMS)',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://ugat.aima.in', 'http://localhost:4004'],
          notificationUrl: 'https://ugat.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['EXAM_FEE', 'REGISTRATION_FEE'],
          amountRules: [
            {
              paymentPurpose: 'EXAM_FEE',
              description: 'UGAT Registration Fee',
              mode: 'FIXED',
              fixedAmountPaise: 65000,  // ₹650
              currency: 'INR',
              gstApplicable: false,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for CMS -> CCAvenue', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 7. LMA (LMA -> Worldline / Paynimo) ───────────────────────────────
      {
        rawKey: 'aima_lma_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-lma-001',
          sourceCode: 'LMA',
          name: 'Local Management Associations (LMA)',
          department: 'LMA',
          description: 'Federation of 67+ Local Management Associations across India',
          isActive: true,
          assignedGateway: 'WORLDLINE_PAYNIMO',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://lma.aima.in', 'http://localhost:4005'],
          notificationUrl: 'https://lma.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['SUBSCRIPTION_FEE', 'ANNUAL_SUBSCRIPTION'],
          amountRules: [
            {
              paymentPurpose: 'SUBSCRIPTION_FEE',
              description: 'LMA Annual Affiliation & Subscription Fee',
              mode: 'VARIABLE',
              minAmountPaise: 1500000,  // ₹15,000
              maxAmountPaise: 5000000,  // ₹50,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['WORLDLINE_PAYNIMO', 'CCAVENUE', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for LMA -> Worldline', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── 8. VLC (VLC -> Worldline / Paynimo) ───────────────────────────────
      {
        rawKey: 'aima_vlc_demo_key_2026',
        app: {
          id: 'src-vlc-001',
          sourceCode: 'VLC',
          aliases: ['VLC_CENTRE', 'VIRTUAL_LEARNING_CENTRE', 'AIMA_VLC'],
          name: 'Virtual Learning Centre (VLC)',
          department: 'VLC',
          description: 'AIMA Virtual Learning Centre & live interactive masterclasses',
          isActive: true,
          assignedGateway: 'WORLDLINE_PAYNIMO',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://vlc.aima.in', 'https://vcc.aima.in', 'http://localhost:4006'],
          notificationUrl: 'https://vlc.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['COURSE_FEE', 'WORKSHOP_FEE'],
          amountRules: [
            {
              paymentPurpose: 'COURSE_FEE',
              description: 'VLC Live Certificate Course Fee',
              mode: 'VARIABLE',
              minAmountPaise: 250000,   // ₹2,500
              maxAmountPaise: 1500000,  // ₹15,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['WORLDLINE_PAYNIMO', 'CCAVENUE', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Seed for VLC -> Worldline', performedBy: 'SYSTEM' },
          ],
        },
      },

      // ── Existing & Backward-Compatible Phase 3 Seeds ─────────────────────
      {
        rawKey: 'aima_mat_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-mat-001',
          sourceCode: 'MAT',
          aliases: ['MAT B School'],
          name: 'Management Aptitude Test',
          department: 'CMS',
          description: 'National Level MBA/PGDM Entrance Examination portal (mat.aima.in)',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://mat.aima.in', 'http://localhost:4001'],
          notificationUrl: 'https://mat.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['EXAM_FEE', 'ADMIT_CARD_FEE'],
          amountRules: [
            {
              paymentPurpose: 'EXAM_FEE',
              description: 'MAT Exam Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 210000,  // ₹2,100
              maxAmountPaise: 350000,  // ₹3,500
              currency: 'INR',
              gstApplicable: false,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Demo seed for Phase 3', performedBy: 'SYSTEM' },
          ],
        },
      },
      {
        rawKey: 'aima_cme_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-cme-001',
          sourceCode: 'CME',
          name: 'Centre for Management Education',
          department: 'CME',
          description: 'AICTE Approved PGDM & Executive programs portal (cme.aima.in)',
          isActive: true,
          assignedGateway: 'CCAVENUE',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://cme.aima.in', 'http://localhost:4002'],
          notificationUrl: 'https://cme.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['SEMESTER_FEE', 'ENROLLMENT_FEE', 'MATERIAL_FEE'],
          amountRules: [
            {
              paymentPurpose: 'SEMESTER_FEE',
              description: 'CME Semester Tuition & Examination Fee',
              mode: 'VARIABLE',
              minAmountPaise: 1000000,  // ₹10,000
              maxAmountPaise: 5000000,  // ₹50,000
              currency: 'INR',
              gstApplicable: true,
            },
            {
              paymentPurpose: 'ENROLLMENT_FEE',
              description: 'CME Admission Enrollment Fee',
              mode: 'VARIABLE',
              minAmountPaise: 500000,   // ₹5,000
              maxAmountPaise: 2000000,  // ₹20,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Demo seed for Phase 3', performedBy: 'SYSTEM' },
          ],
        },
      },
      {
        rawKey: 'aima_case_league_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-case-league-001',
          sourceCode: 'CASE_LEAGUE',
          aliases: ['CASE_LEAGUE', 'CASE-LEAGUE', 'AIMA_QUIZ', 'AIMA-QUIZ', 'RESEARCH_AIMA', 'AIMA_ICRC', 'CASELEAGUE', 'AMIACRC'],
          name: 'AIMA Case League & Olympiad',
          department: 'Events',
          description: 'National Management Olympiad & Corporate Case Championship (caseleague.aima.in / aima-quiz)',
          isActive: true,
          assignedGateway: 'CCAVENUE', // Unmapped in matrix -> CCAvenue
          routingMode: 'AUTO',
          allowedReturnUrls: [
            'https://caseleague.aima.in',
            'http://localhost:4003',
            'https://aima-quiz.vercel.app',
            'https://research.aima.in',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:5174',
            'http://127.0.0.1:3002',
            'http://0.0.0.0:3002',
            'http://0.0.0.0:3000',
          ],
          notificationUrl: 'https://caseleague.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: [
            'REGISTRATION_FEE',
            'BOOTCAMP_FEE',
            'TEAM_REGISTRATION',
            'INSTITUTE_REGISTRATION',
          ],
          amountRules: [
            {
              paymentPurpose: 'REGISTRATION_FEE',
              description: 'Case League Team Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 1000,     // ₹10
              maxAmountPaise: 10000000, // ₹1,00,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Demo seed for Phase 3', performedBy: 'SYSTEM' },
          ],
        },
      },
      {
        rawKey: 'aima_vcc_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-vcc-001',
          sourceCode: 'AIMA_VCC',
          aliases: ['VLC'],
          name: 'AIMA Virtual Competency Centre (VCC / VLC)',
          department: 'VLC',
          description: 'Virtual Competency Centre and professional micro-credentials',
          isActive: true,
          assignedGateway: 'WORLDLINE_PAYNIMO',
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://vcc.aima.in', 'https://vlc.aima.in', 'http://localhost:4006'],
          notificationUrl: 'https://vcc.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['CERTIFICATION_FEE'],
          amountRules: [
            {
              paymentPurpose: 'CERTIFICATION_FEE',
              description: 'VCC Micro-Credential Exam & Certification Fee',
              mode: 'VARIABLE',
              minAmountPaise: 150000,   // ₹1,500
              maxAmountPaise: 800000,   // ₹8,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['WORLDLINE_PAYNIMO', 'CCAVENUE', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Demo seed for Phase 3', performedBy: 'SYSTEM' },
          ],
        },
      },
      {
        rawKey: 'aima_events_demo_key_phase3_sandbox_2026',
        app: {
          id: 'src-events-001',
          sourceCode: 'AIMA_EVENTS',
          name: 'AIMA Events & Conferences',
          department: 'Events',
          description: 'National conferences, seminars and events registration',
          isActive: true,
          assignedGateway: 'CCAVENUE', // Unmapped in matrix -> CCAvenue
          routingMode: 'AUTO',
          allowedReturnUrls: ['https://events.aima.in', 'http://localhost:4008'],
          notificationUrl: 'https://events.aima.in/api/v1/payment-notification',
          allowedPaymentPurposes: ['EVENT_REGISTRATION', 'DELEGATE_FEE'],
          amountRules: [
            {
              paymentPurpose: 'EVENT_REGISTRATION',
              description: 'Conference/Event Registration Fee',
              mode: 'VARIABLE',
              minAmountPaise: 50000,    // ₹500
              maxAmountPaise: 10000000, // ₹1,00,000
              currency: 'INR',
              gstApplicable: true,
            },
          ],
          allowedGateways: ['CCAVENUE', 'WORLDLINE_PAYNIMO', 'DEMO_SIMULATOR'],
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          auditHistory: [
            { timestamp: '2026-10-01T00:00:00.000Z', action: 'REGISTERED', detail: 'Demo seed for Phase 3', performedBy: 'SYSTEM' },
          ],
        },
      },
    ];

    for (const { app, rawKey } of demoApps) {
      const credential: SourceCredential = {
        credentialId: `CRED-${app.sourceCode.replace(/[^A-Za-z0-9]/g, '')}-01`,
        sourceCode: app.sourceCode,
        keyHash: hashApiKey(rawKey),
        keyPrefix: rawKey.substring(0, 8),
        isActive: true,
        createdAt: app.createdAt,
      };

      const fullApp: SourceApplication = {
        ...app,
        credentials: [credential],
      };

      this.applications.set(app.sourceCode.toUpperCase(), fullApp);
    }
  }

  public getAll(): SourceApplication[] {
    return Array.from(this.applications.values());
  }

  /**
   * Find application by source code or project code.
   * Handles exact match, case-insensitivity, aliases, and stripped strings.
   */
  public getBySourceCode(sourceCode: string): SourceApplication | undefined {
    if (!sourceCode) return undefined;
    const clean = sourceCode.trim();
    const upper = clean.toUpperCase();

    // 1. Direct map lookup
    if (this.applications.has(upper)) {
      return this.applications.get(upper);
    }

    // 2. Case-insensitive match on sourceCode
    for (const [code, app] of this.applications.entries()) {
      if (code.toLowerCase() === clean.toLowerCase() || app.sourceCode.toLowerCase() === clean.toLowerCase()) {
        return app;
      }
    }

    // 3. Match against aliases
    for (const app of this.applications.values()) {
      if (app.aliases?.some((a) => a.toLowerCase() === clean.toLowerCase())) {
        return app;
      }
    }

    // 4. Normalized match (stripping spaces, underscores, hyphens, and em-dashes)
    const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_–—]/g, '');
    const cleanNormalized = normalize(clean);
    for (const app of this.applications.values()) {
      if (normalize(app.sourceCode) === cleanNormalized) {
        return app;
      }
      if (app.aliases?.some((a) => normalize(a) === cleanNormalized)) {
        return app;
      }
    }

    return undefined;
  }

  /**
   * Resolve default gateway for a source application.
   * Per business rules:
   *   - Specific 8 mappings configured in registry
   *   - Any unmapped application defaults to HDFC / CCAvenue
   */
  public resolveGatewayForSource(sourceCode: string): GatewayType {
    const app = this.getBySourceCode(sourceCode);
    if (app && app.assignedGateway) {
      return app.assignedGateway;
    }
    // "the one that are not in this matrix map them with HDFC/CCAvenue"
    return 'CCAVENUE';
  }

  /**
   * Normalize gateway string into standard GatewayType.
   */
  public normalizeGatewayName(name: string): GatewayType | null {
    if (!name) return null;
    const clean = name.trim().toUpperCase().replace(/[\s\-/]+/g, '_');
    if (clean.includes('WORLDLINE') || clean.includes('PAYNIMO')) return 'WORLDLINE_PAYNIMO';
    if (clean.includes('CCAVENUE') || clean.includes('HDFC')) return 'CCAVENUE';
    if (clean.includes('SIMULATOR') || clean.includes('DEMO')) return 'DEMO_SIMULATOR';
    return null;
  }

  /**
   * Validate optional gateway parameter against registered assignment.
   * Rules:
   *   1. Resolve gateway from registered application configuration.
   *   2. If gateway parameter supplied, validate against registered assignment;
   *      NEVER trust client to override the registry policy.
   *   3. If gateway parameter missing, automatically use assigned gateway.
   *   4. USER_SELECTABLE applications permit user choice within allowedGateways.
   */
  public validateAndResolveGateway(
    sourceCode: string,
    requestedGateway?: string | null
  ): {
    valid: boolean;
    resolvedGateway: GatewayType;
    routingMode: GatewayRoutingMode;
    reason?: string;
    sourceApp?: SourceApplication;
  } {
    const app = this.getBySourceCode(sourceCode);
    if (!app) {
      return {
        valid: false,
        resolvedGateway: 'CCAVENUE',
        routingMode: 'AUTO',
        reason: `Unknown or inactive source application: '${sourceCode}'`,
      };
    }

    const assigned = app.assignedGateway || 'CCAVENUE';
    const routingMode = app.routingMode || 'AUTO';

    // 1. Missing gateway parameter -> use assigned gateway automatically
    if (!requestedGateway || requestedGateway.trim() === '') {
      return {
        valid: true,
        resolvedGateway: assigned,
        routingMode,
        sourceApp: app,
      };
    }

    // 2. Gateway parameter provided: normalize it
    const normalized = this.normalizeGatewayName(requestedGateway);
    if (!normalized) {
      return {
        valid: false,
        resolvedGateway: assigned,
        routingMode,
        reason: `Unrecognized gateway parameter '${requestedGateway}'. Supported: CCAVENUE, WORLDLINE_PAYNIMO`,
        sourceApp: app,
      };
    }

    // 3. User-selectable application allows client choice within allowedGateways
    if (routingMode === 'USER_SELECTABLE') {
      if (app.allowedGateways.includes(normalized)) {
        return {
          valid: true,
          resolvedGateway: normalized,
          routingMode: 'USER_SELECTABLE',
          sourceApp: app,
        };
      }
      return {
        valid: false,
        resolvedGateway: assigned,
        routingMode: 'USER_SELECTABLE',
        reason: `Gateway '${requestedGateway}' is not permitted for ${app.sourceCode}. Allowed: ${app.allowedGateways.join(', ')}`,
        sourceApp: app,
      };
    }

    // 4. Automatic routing: Validate against registered assignment. NEVER trust client override!
    if (normalized !== assigned) {
      return {
        valid: false,
        resolvedGateway: assigned,
        routingMode: 'AUTO',
        reason: `Gateway conflict: source application '${app.sourceCode}' is configured for ${assigned}. Parameter '${requestedGateway}' conflicts with the registered gateway policy and cannot override it.`,
        sourceApp: app,
      };
    }

    return {
      valid: true,
      resolvedGateway: assigned,
      routingMode: 'AUTO',
      sourceApp: app,
    };
  }

  /**
   * Update gateway assignment dynamically (admin operation).
   * Modifies routing policy without requiring any code changes.
   */
  public updateGatewayAssignment(
    sourceCode: string,
    assignedGateway: GatewayType,
    routingMode?: GatewayRoutingMode,
    department?: string,
    performedBy: string = 'ADMIN'
  ): SourceApplication {
    const app = this.getBySourceCode(sourceCode);
    if (!app) throw new Error(`Application '${sourceCode}' not found`);

    const now = new Date().toISOString();
    const oldGateway = app.assignedGateway;
    app.assignedGateway = assignedGateway;
    if (routingMode) app.routingMode = routingMode;
    if (department) app.department = department;
    if (!app.allowedGateways.includes(assignedGateway)) {
      app.allowedGateways.push(assignedGateway);
    }
    app.updatedAt = now;
    app.auditHistory.push({
      timestamp: now,
      action: 'GATEWAY_ASSIGNMENT_UPDATED',
      detail: `Assigned gateway updated from ${oldGateway} to ${assignedGateway} (Mode: ${app.routingMode || 'AUTO'}, Dept: ${app.department || 'N/A'})`,
      performedBy,
    });

    this.persistToDisk();
    this.upsertToSupabase(app);

    return app;
  }

  /**
   * Update full platform config (admin-only): name, assignedGateway, return URLs, notification URL, department
   */
  public updateApplication(
    sourceCode: string,
    updates: {
      name?: string;
      assignedGateway?: GatewayType;
      allowedReturnUrls?: string[];
      notificationUrl?: string;
      department?: string;
    },
    performedBy: string = 'ADMIN'
  ): SourceApplication {
    const app = this.getBySourceCode(sourceCode);
    if (!app) throw new Error(`Application '${sourceCode}' not found`);

    const now = new Date().toISOString();
    if (updates.name && updates.name.trim()) app.name = updates.name.trim();
    if (updates.department && updates.department.trim()) app.department = updates.department.trim();
    if (updates.assignedGateway) {
      app.assignedGateway = updates.assignedGateway;
      if (!app.allowedGateways.includes(updates.assignedGateway)) {
        app.allowedGateways.push(updates.assignedGateway);
      }
    }
    if (updates.allowedReturnUrls && Array.isArray(updates.allowedReturnUrls)) {
      app.allowedReturnUrls = updates.allowedReturnUrls.map((u) => u.trim()).filter(Boolean);
    }
    if (updates.notificationUrl !== undefined) {
      app.notificationUrl = updates.notificationUrl.trim();
    }
    app.updatedAt = now;
    app.auditHistory.push({
      timestamp: now,
      action: 'APPLICATION_UPDATED',
      detail: `Configuration updated by ${performedBy}`,
      performedBy,
    });

    this.persistToDisk();
    this.upsertToSupabase(app);

    return app;
  }

  /**
   * Authenticate a source application request.
   * Returns the application if credentials are valid, otherwise null.
   */
  public authenticate(sourceCode: string, rawApiKey: string): SourceApplication | null {
    const app = this.getBySourceCode(sourceCode);
    if (!app || !app.isActive) return null;

    const activeCredential = app.credentials.find((c) => c.isActive && !c.revokedAt);
    if (!activeCredential) return null;

    try {
      if (verifyApiKey(rawApiKey, activeCredential.keyHash)) {
        return app;
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Validate that a return URL is in the application's allowlist.
   * Only origin (scheme + host + port) is compared, not path.
   */
  public validateReturnUrl(app: SourceApplication, returnUrl: string): boolean {
    try {
      const parsed = new URL(returnUrl);
      const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';

      return app.allowedReturnUrls.some((allowed) => {
        try {
          const allowedParsed = new URL(allowed);
          if (parsed.origin === allowedParsed.origin) {
            return true;
          }

          // Permit local loopback/bind interchange (localhost <-> 127.0.0.1 <-> 0.0.0.0) on matching ports
          if (
            isLocal(parsed.hostname) &&
            isLocal(allowedParsed.hostname) &&
            parsed.port === allowedParsed.port &&
            parsed.protocol === allowedParsed.protocol
          ) {
            return true;
          }

          return false;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  /**
   * Validate amount for a given payment purpose.
   * All amounts are in paise (integer).
   */
  public validateAmount(
    app: SourceApplication,
    paymentPurpose: string,
    amountPaise: number
  ): { valid: boolean; reason?: string; rule?: AmountRule } {
    const rule = app.amountRules.find((r) => r.paymentPurpose === paymentPurpose);
    if (!rule) {
      return { valid: false, reason: `No amount rule configured for purpose: ${paymentPurpose}` };
    }

    if (rule.mode === 'FIXED') {
      if (amountPaise !== rule.fixedAmountPaise) {
        return {
          valid: false,
          reason: `Amount mismatch: expected ₹${(rule.fixedAmountPaise! / 100).toFixed(2)}, got ₹${(amountPaise / 100).toFixed(2)}`,
        };
      }
    } else {
      const min = rule.minAmountPaise ?? 0;
      const max = rule.maxAmountPaise ?? Number.MAX_SAFE_INTEGER;
      if (amountPaise < min || amountPaise > max) {
        return {
          valid: false,
          reason: `Amount ₹${(amountPaise / 100).toFixed(2)} is outside permitted range [₹${(min / 100).toFixed(2)} – ₹${(max / 100).toFixed(2)}] for ${paymentPurpose}`,
        };
      }
    }

    return { valid: true, rule };
  }

  /**
   * Register a new source application (admin-only operation).
   * Returns the generated API key — shown ONCE, not stored.
   */
  public register(
    config: Omit<SourceApplication, 'id' | 'credentials' | 'createdAt' | 'updatedAt' | 'auditHistory'>,
    performedBy: string = 'ADMIN'
  ): { app: SourceApplication; rawApiKey: string } {
    const existing = this.getBySourceCode(config.sourceCode);
    if (existing) {
      throw new Error(`Source application with code '${config.sourceCode}' already exists`);
    }

    const rawApiKey = generateApiKey();
    const now = new Date().toISOString();

    const credential: SourceCredential = {
      credentialId: `CRED-${config.sourceCode.replace(/[^A-Za-z0-9]/g, '')}-01`,
      sourceCode: config.sourceCode,
      keyHash: hashApiKey(rawApiKey),
      keyPrefix: rawApiKey.substring(0, 8),
      isActive: true,
      createdAt: now,
    };

    const app: SourceApplication = {
      ...config,
      department: config.department || 'General',
      assignedGateway: config.assignedGateway || 'CCAVENUE',
      routingMode: config.routingMode || 'AUTO',
      id: `src-${config.sourceCode.toLowerCase().replace(/[^A-Za-z0-9]/g, '')}-${Date.now()}`,
      credentials: [credential],
      createdAt: now,
      updatedAt: now,
      auditHistory: [
        { timestamp: now, action: 'REGISTERED', detail: `Application registered with assigned gateway: ${config.assignedGateway || 'CCAVENUE'}`, performedBy },
      ],
    };

    this.applications.set(config.sourceCode.toUpperCase(), app);
    this.persistToDisk();
    this.upsertToSupabase(app);
    return { app, rawApiKey };
  }

  /** Toggle active status (admin-only). */
  public setActiveStatus(sourceCode: string, isActive: boolean, performedBy: string = 'ADMIN'): SourceApplication {
    const app = this.getBySourceCode(sourceCode);
    if (!app) throw new Error(`Application '${sourceCode}' not found`);

    const now = new Date().toISOString();
    app.isActive = isActive;
    app.updatedAt = now;
    app.auditHistory.push({
      timestamp: now,
      action: isActive ? 'ACTIVATED' : 'DEACTIVATED',
      detail: `Application ${isActive ? 'activated' : 'deactivated'} by admin`,
      performedBy,
    });

    this.persistToDisk();
    this.upsertToSupabase(app);

    return app;
  }

  /** Rotate API key for a source application (admin-only). Returns new raw key — shown once. */
  public rotateApiKey(sourceCode: string, performedBy: string = 'ADMIN'): { rawApiKey: string } {
    const app = this.getBySourceCode(sourceCode);
    if (!app) throw new Error(`Application '${sourceCode}' not found`);

    const now = new Date().toISOString();
    const rawApiKey = generateApiKey();
    const newCred: SourceCredential = {
      credentialId: `CRED-${sourceCode.replace(/[^A-Za-z0-9]/g, '')}-${Date.now()}`,
      sourceCode,
      keyHash: hashApiKey(rawApiKey),
      keyPrefix: rawApiKey.substring(0, 8),
      isActive: true,
      createdAt: now,
    };

    // Revoke all existing active credentials
    for (const cred of app.credentials) {
      if (cred.isActive) {
        cred.isActive = false;
        cred.revokedAt = now;
      }
    }

    app.credentials.push(newCred);
    app.updatedAt = now;
    app.auditHistory.push({
      timestamp: now,
      action: 'KEY_ROTATED',
      detail: `API key rotated. Old key revoked. New key prefix: ${rawApiKey.substring(0, 8)}`,
      performedBy,
    });

    this.persistToDisk();
    this.upsertToSupabase(app);

    return { rawApiKey };
  }

  /** Delete a source application (admin-only). */
  public deleteApplication(sourceCode: string, _performedBy: string = 'ADMIN'): boolean {
    const app = this.getBySourceCode(sourceCode);
    if (!app) return false;

    const deleted = this.applications.delete(app.sourceCode.toUpperCase());
    if (deleted) {
      this.persistToDisk();
      try {
        supabaseAdmin.from('aima_source_applications').delete().eq('source_code', app.sourceCode).then(() => {});
      } catch (e) {}
    }
    return deleted;
  }

  /** Returns a safe (no secrets) view of the application for API responses. */
  public toSafeView(app: SourceApplication): Omit<SourceApplication, 'credentials'> & { credentialSummary: object[] } {
    const { credentials: _creds, ...rest } = app;
    return {
      ...rest,
      credentialSummary: app.credentials.map((c) => ({
        credentialId: c.credentialId,
        keyPrefix: c.keyPrefix,
        isActive: c.isActive,
        createdAt: c.createdAt,
        revokedAt: c.revokedAt,
      })),
    };
  }
}

export const sourceApplicationRegistry = new SourceApplicationRegistry();
