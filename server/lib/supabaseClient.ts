/**
 * AIMA Payments Hub — Supabase Database Client
 * Shared singleton for server-side Supabase access
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://setjjgjhuslevgnqcnhj.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_RDIbw6a-RZItDzeY80ylwA_-7XGzb5V';

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
