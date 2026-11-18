import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useBestpad } from '../context';
import { currentBackgroundEpoch, faceIdEnabled, loadFaceIdKey } from '../biometric';
import { Button, Icon, ui } from './ui';

export function NotePassword({ id, onCancel }: { id: string; onCancel: () => void }) {
  const { colors, store, snapshot } = useBestpad();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [faceId, setFaceId] = useState<'checking' | 'enabled' | 'disabled'>('checking');
  const [passwordFallback, setPasswordFallback] = useState(false);
  const autoPrompted = useRef(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const unlockWithFaceId = useCallback(async () => {
    if (busyRef.current) return;
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
  }, [id, onCancel, snapshot.user, store]);

  useEffect(() => {
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
  }, [id, snapshot.user, unlockWithFaceId]);

  useEffect(() => {
    if (!busy && (faceId === 'disabled' || passwordFallback)) input.current?.focus();
  }, [busy, faceId, passwordFallback]);

  async function submit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError('');
    try {
      await store.unlock(id, password);
      setPassword(''); onCancel();
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
        <Text style={{ color: colors.font, fontSize: 23, fontWeight: '700' }}>Locked note</Text>
        <Text style={{ color: colors.muted, lineHeight: 21 }}>
          Use Face ID if you enabled it for this note, or enter the note’s password to unlock.
        </Text>
        {faceId === 'enabled' && <Button
          label={busy ? 'Checking Face ID…' : 'Unlock with Face ID'}
          icon="scan-outline" primary disabled={busy} onPress={() => { void unlockWithFaceId(); }}
        />}
        <TextInput ref={input} accessibilityLabel="Note password" secureTextEntry
          autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword}
          editable={!busy} placeholder="Use note password instead"
          placeholderTextColor={colors.muted}
          style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary, textAlign: 'center', textAlignVertical: 'center' }]} />
        {!!error && <Text accessibilityLiveRegion="polite" style={{ color: colors.font }}>{error}</Text>}
        {busy && <ActivityIndicator color={colors.font} />}
        <Button disabled={busy} label={busy ? 'Please wait…' : 'Unlock with password'}
          primary={faceId !== 'enabled'} onPress={() => { void submit(); }} />
        <Button label="Cancel" disabled={busy} onPress={onCancel} />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
