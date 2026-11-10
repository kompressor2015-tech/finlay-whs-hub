/**
 * The Supabase project shared with the fleet app (Fleet Hub): same logins, same machine list.
 * WHS tables are prefixed `whs_` so they never clash with fleet tables.
 */

import { createClient } from '@supabase/supabase-js';

// The URL and anon key are public by design (access is enforced by the database's rules).
// They default to the fleet app's project; Vercel environment variables override them.
export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://gqrscnlvcxmlngtplisv.supabase.co';

export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxcnNjbmx2Y3htbG5ndHBsaXN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5NTU0MTYsImV4cCI6MjEwODUzMTQxNn0.W4cRPxz88mjH1_Vh2Amp_GcCtFwUGHYS1oFvg38_2AQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
