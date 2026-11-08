import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import type { Session } from '@supabase/supabase-js';
import { supabase, remote } from './supabase';
import { WorkspaceStore } from './workspace';
import { initialAppearance, palette, restoreAppearance, type Appearance } from './appearance';
function useBestpadValue() {
  const systemMode = useColorScheme() === 'light' ? 'light' : 'dark';
  const store = useMemo(() => new WorkspaceStore(AsyncStorage, remote, randomUUID), []);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [session, setSession] = useState<Session | null>(null), [authReady, setAuthReady] = useState(false);
  const [appearance, setAppearance] = useState<Appearance>(() => initialAppearance(systemMode));
  const [appearanceReady, setAppearanceReady] = useState(false), [appearanceError, setAppearanceError] = useState('');
  const appearanceWrites = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem('bestpad:mobile:appearance').then(raw => { if (alive && raw) setAppearance(restoreAppearance(JSON.parse(raw), systemMode)); }).catch(() => { if (alive) setAppearanceError('Could not restore appearance.'); }).finally(() => { if (alive) setAppearanceReady(true); });
    return () => { alive = false; };
    // The system mode is the initial fallback; saved/user settings take precedence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!appearanceReady) return;
    const value = JSON.stringify(appearance);
    appearanceWrites.current = appearanceWrites.current.then(async () => { try { await AsyncStorage.setItem('bestpad:mobile:appearance', value); setAppearanceError(''); } catch { setAppearanceError('Appearance applied but could not be saved.'); } });
  }, [appearance, appearanceReady]);
  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => { if (alive) { setSession(value); setAuthReady(true); } });
    supabase.auth.getSession().then(({ data, error }) => { if (alive) { setSession(error ? null : data.session); setAuthReady(true); } }).catch(() => { if (alive) setAuthReady(true); });
    if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') { supabase.auth.startAutoRefresh(); void store.retry(); }
      else { supabase.auth.stopAutoRefresh(); void store.flush(); }
    });
    return () => { alive = false; subscription.unsubscribe(); listener.remove(); supabase.auth.stopAutoRefresh(); };
  }, [store]);
  const userId = session?.user.id || null;
  useEffect(() => { if (authReady) void store.connect(userId); }, [authReady, userId, store]);
  useEffect(() => {
    if (!authReady || !userId) return;
    const refresh = () => { if (AppState.currentState === 'active') void store.refresh(); };
    const channel = supabase.channel(`mobile-notes:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'note_workspaces', filter: `user_id=eq.${userId}` }, refresh).subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const timer = setInterval(refresh, 3000);
    return () => { clearInterval(timer); void supabase.removeChannel(channel); };
  }, [authReady, userId, store]);
  return { store, snapshot, session, authReady, appearance, appearanceReady, appearanceError, setAppearance, colors: palette(appearance) };
}
type Value = ReturnType<typeof useBestpadValue>;
const Context = createContext<Value | null>(null);
export function BestpadProvider({ children }: { children: React.ReactNode }) { const value = useBestpadValue(); return <Context.Provider value={value}>{children}</Context.Provider>; }
export function useBestpad() { const value = useContext(Context); if (!value) throw new Error('BestpadProvider missing'); return value; }
