import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { ConflictError, type Remote } from './workspace';
import { validWorkspace } from './model';
// Publishable browser/mobile key only. Never put a service-role key here.
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://pskrlifkffcpggcarnon.supabase.co',
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ljaQZSpqqx6yFp_GdoaKuQ_gL_bujL6',
  { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock } }
);
export const remote: Remote = {
  async read(user) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    let result; try { result = await supabase.from('note_workspaces').select('*').eq('user_id', user).abortSignal(controller.signal).maybeSingle(); } finally { clearTimeout(timer); }
    const { data, error } = result;
    if (error) throw error; if (!data) return null;
    const workspace = { tabs: data.tabs, activeId: data.active_id };
    if (!validWorkspace(workspace) || !Number.isInteger(data.revision)) throw new Error('Invalid cloud workspace');
    return { workspace, revision: data.revision };
  },
  async write(user, workspace, revision) {
    const row = { user_id: user, tabs: workspace.tabs, active_id: workspace.activeId, revision: (revision ?? 0) + 1, updated_at: new Date().toISOString() };
    const query = revision === null ? supabase.from('note_workspaces').insert(row) : supabase.from('note_workspaces').update(row).eq('user_id', user).eq('revision', revision);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
    let result; try { result = await query.select('revision').abortSignal(controller.signal); } finally { clearTimeout(timer); }
    const { data, error } = result;
    if (error?.code === '23505' || (!error && !data?.length)) throw new ConflictError('Cloud notes changed on another device. Local changes are kept.');
    if (error) throw error; return data![0].revision;
  }
};
