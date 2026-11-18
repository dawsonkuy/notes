import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useBestpad } from '../context';
import { currentBackgroundEpoch, faceIdEnabled, loadFaceIdKey } from '../biometric';
import { Button, Icon, ui } from './ui';

export function NotePassword({ id, protect = false, onCancel }: { id: string; protect?: boolean; onCancel: () => void }) {
  const { colors, store, snapshot } = useBestpad();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [faceId, setFaceId] = useState<'checking' | 'enabled' | 'disabled'>(protect ? 'disabled' : 'checking');
  const [passwordFallback, setPasswordFallback] = useState(false);
  const autoPrompted = useRef(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const unlockWithFaceId = useCallback(async () => {
    if (busyRef.current || protect) return;
    busyRef.current = true;
    setPasswordFallback(false);
    setBusy(true); setError('');
    Keyboard.dismiss();
    let secret: Uint8Array | null = null;
    const startingBackgroundEpoch = currentBackgroundEpoch();
    try {
      const sealed = store.getSnapshot().workspace.tabs.find(note => note.id === id)?.sealed;
      if (!sealed) throw new Error('Note is no longer protected.');
      secret = await loadFaceIdKey(snapshot.user, id, sealed.salt);
      if (!secret) throw new Error('Face ID is no longer enabled. Use your note password.');
      // Backgrounding the app always invalidates this unlock, even if iOS
      // returns from the biometric sheet after the user comes back.
      if (currentBackgroundEpoch() !== startingBackgroundEpoch)
        throw new Error('Face ID unlock was interrupted. Use your note password or try again.');
      store.unlockWithKey(id, secret);
      onCancel();
    } catch (value) {
      const message = value instanceof Error ? value.message : '';
      // Cancelling the system biometric prompt is not a password failure.
      if (!/cancel|dismiss|user.fallback/i.test(message)) setError(
        message.startsWith('Face ID') || message.startsWith('Note ')
          ? message : 'Face ID was unavailable. Use your note password or retry.'
      );
      // Once the native sheet closes, bring up the keyboard for immediate
      // password entry rather than leaving a dead-looking unlock screen.
      setPasswordFallback(true);
      void faceIdEnabled(snapshot.user, id).then(enabled => setFaceId(enabled ? 'enabled' : 'disabled')).catch(() => setFaceId('disabled'));
    } finally {
      secret?.fill(0);
      busyRef.current = false; setBusy(false);
    }
  }, [id, onCancel, protect, snapshot.user, store]);

  useEffect(() => {
    if (protect) return;
    let active = true;
    void faceIdEnabled(snapshot.user, id).then(enabled => {
      if (!active) return;
      setFaceId(enabled ? 'enabled' : 'disabled');
      if (enabled && !autoPrompted.current) {
        autoPrompted.current = true;
        void unlockWithFaceId();
      }
    }).catch(() => { if (active) setFaceId('disabled'); });
    return () => { active = false; };
  }, [id, protect, snapshot.user, unlockWithFaceId]);

  useEffect(() => {
    if (!protect && !busy && (faceId === 'disabled' || passwordFallback)) input.current?.focus();
  }, [busy, faceId, passwordFallback, protect]);

  async function submit() {
    if (busyRef.current) return;
    if (protect && (password.length < 8 || password !== confirm)) {
      setError('Use at least 8 characters and enter the same password twice.');
      return;
    }
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      if (protect) await store.protect(id, password);
      else await store.unlock(id, password);
      setPassword(''); setConfirm(''); onCancel();
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Could not open note.');
    } finally {
      busyRef.current = false; setBusy(false);
    }
  }

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.primary }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
      <View style={{ gap: 18 }}>
        <Icon name="lock-closed-outline" size={32} />
        <Text style={{ color: colors.font, fontSize: 23, fontWeight: '700' }}>{protect ? 'Protect note' : 'Locked note'}</Text>
        <Text style={{ color: colors.muted, lineHeight: 21 }}>
          {protect
            ? 'The title and contents will be encrypted. This password cannot be recovered. Use a unique password of at least 8 characters.'
            : 'Use Face ID if you enabled it for this note, or enter the note’s password to unlock.'}
        </Text>
        {protect && !snapshot.user && <Text style={{ color: colors.muted, lineHeight: 21 }}>
          You are signed out. This protected note is saved only on this device and will not sync or be recoverable if app data is cleared. Sign in first if you want a cloud backup.
        </Text>}
        {!protect && faceId === 'enabled' && <Button
          label={busy ? 'Checking Face ID…' : 'Unlock with Face ID'}
          icon="scan-outline" primary disabled={busy} onPress={() => { void unlockWithFaceId(); }}
        />}
        <TextInput ref={input} accessibilityLabel="Note password" autoFocus={protect} secureTextEntry
          autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword}
          editable={!busy} placeholder={protect ? 'Create note password' : 'Use note password instead'}
          placeholderTextColor={colors.muted}
          style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary }]} />
        {protect && <TextInput accessibilityLabel="Confirm note password" returnKeyType="done"
          onSubmitEditing={() => { void submit(); }} secureTextEntry autoCapitalize="none" autoCorrect={false}
          value={confirm} onChangeText={setConfirm} editable={!busy} placeholder="Confirm note password"
          placeholderTextColor={colors.muted}
          style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary }]} />}
        {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.font }}>{error}</Text>}
        {busy && <ActivityIndicator color={colors.font} />}
        <Button disabled={busy} label={busy ? 'Please wait…' : protect ? 'Protect note' : 'Unlock with password'}
          primary={protect || faceId !== 'enabled'} onPress={() => { void submit(); }} />
        <Button label="Cancel" disabled={busy} onPress={onCancel} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
