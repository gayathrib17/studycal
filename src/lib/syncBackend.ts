import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL, syncConfigured } from '../config';
import { SyncServerError, type SyncBackend, type SyncData } from './sync';

let client: SupabaseClient | null = null;

/** The shared Supabase client, or null when sync isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (!syncConfigured) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'studycal-auth' },
  });
  return client;
}

/**
 * PostgREST errors carry a code (e.g. 42501 = permission denied): the server answered and refused.
 * Errors without one are network failures, which the sync engine treats as "offline".
 */
function raise(error: { message: string; code?: string }): never {
  if (error.code) throw new SyncServerError(error.message);
  throw new Error(error.message);
}

/** Stores one person's planner as a single row in `planner_state`. */
export function supabaseBackend(sb: SupabaseClient, userId: string): SyncBackend {
  const table = () => sb.from('planner_state');
  return {
    async load() {
      const { data, error } = await table().select('data, version').eq('user_id', userId).maybeSingle();
      if (error) raise(error);
      return data ? { data: data.data as SyncData, version: data.version as number } : null;
    },
    async create(data) {
      const { data: row, error } = await table().insert({ user_id: userId, data, version: 1 }).select('version').single();
      if (error) {
        if (error.code === '23505') return 'conflict'; // row already exists (created by another device)
        raise(error);
      }
      return row.version as number;
    },
    async update(data, expected) {
      // Only succeeds if nobody else saved since we last read version `expected`.
      const { data: rows, error } = await table()
        .update({ data, version: expected + 1, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('version', expected)
        .select('version');
      if (error) raise(error);
      return rows && rows.length > 0 ? (rows[0].version as number) : 'conflict';
    },
  };
}
