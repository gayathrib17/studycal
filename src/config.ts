/**
 * Cloud sync settings. These two values are public by design: they're shipped to every visitor's
 * browser. What keeps each person's data private is row-level security on the `planner_state` table
 * (see supabase/schema.sql). Never put a secret / service_role key here.
 *
 * To host your own copy with your own Supabase project, set VITE_SUPABASE_URL and VITE_SUPABASE_KEY
 * when building. Set both to an empty string to turn sign-in and sync off.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://vdwxovtwpwnwycyifkrb.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY ?? 'sb_publishable_eeBvPkHJkZG_iInD5GOWyg_uAqSlRQS';

export const syncConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
