import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useBestpad } from '../context';
import { Button, Icon, ui } from './ui';
export function NotePassword({ id, protect = false, onCancel }: { id: string; protect?: boolean; onCancel: () => void }) {
  const { colors, store, snapshot } = useBestpad();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (protect && (password.length < 8 || password !== confirm)) { setError('Use at least 8 characters and enter the same password twice.'); return; }
    setBusy(true); setError('');
    try { if (protect) await store.protect(id, password); else await store.unlock(id, password); setPassword(''); setConfirm(''); onCancel(); }
    catch (value) { setError(value instanceof Error ? value.message : 'Could not open note.'); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.primary }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}><View style={{ gap: 18 }}><Icon name="lock-closed-outline" size={32} /><Text style={{ color: colors.font, fontSize: 23, fontWeight: '700' }}>{protect ? 'Protect note' : 'Locked note'}</Text><Text style={{ color: colors.muted, lineHeight: 21 }}>{protect ? 'The title and contents will be encrypted. This password cannot be recovered. Use a unique password of at least 8 characters.' : 'Enter this note’s password. Your account password may be different.'}</Text>{protect && !snapshot.user && <Text style={{ color: colors.muted, lineHeight: 21 }}>You are signed out. This protected note is saved only on this device and will not sync or be recoverable if app data is cleared. Sign in first if you want a cloud backup.</Text>}<TextInput accessibilityLabel="Note password" autoFocus secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword} editable={!busy} style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary }]} />{protect && <TextInput accessibilityLabel="Confirm note password" returnKeyType="done" onSubmitEditing={() => { void submit(); }} secureTextEntry autoCapitalize="none" autoCorrect={false} value={confirm} onChangeText={setConfirm} editable={!busy} style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary }]} />}{!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.font }}>{error}</Text>}{busy && <ActivityIndicator color={colors.font} />}<Button disabled={busy} label={busy ? 'Please wait…' : protect ? 'Protect note' : 'Unlock note'} primary onPress={() => { void submit(); }} /><Button label="Cancel" disabled={busy} onPress={onCancel} /></View></ScrollView></KeyboardAvoidingView>;
}
