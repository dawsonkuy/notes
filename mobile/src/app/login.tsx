import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useBestpad } from '../context';
import { supabase } from '../supabase';
import { Button, IconButton, ui } from '../components/ui';
export default function Login() {
  const { colors } = useBestpad(); const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false);
  async function authenticate(signUp: boolean) {
    if (!email.trim() || !password || (signUp && password.length < 8)) { Alert.alert('Check your details', signUp ? 'Enter your email and a password with at least 8 characters.' : 'Enter your email and password.'); return; }
    setBusy(true);
    try {
      const credentials = { email: email.trim(), password };
      const { data, error } = signUp ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: 'https://bestpad.app/' } }) : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      setPassword('');
      if (!data.session) Alert.alert('Confirm your email', 'Open the confirmation email, then return here to sign in.');
      else if (router.canGoBack()) router.back(); else router.replace('/');
    } catch (error) { Alert.alert('Could not sign in', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function requestPasswordReset() {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      Alert.alert('Email needed', 'Enter your account email above to request a reset link.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: 'https://bestpad.app/',
      });
      if (error) throw error;
      Alert.alert('Check your email', 'If the address has a Bestpad account, a reset link will arrive. Open it in your browser, set a new password, then sign in here.');
    } catch (error) {
      Alert.alert('Reset failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }
  return <SafeAreaView style={[ui.container, { backgroundColor: colors.primary }]}><KeyboardAvoidingView style={ui.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[ui.content, { gap: 20 }]}><View style={[ui.row, { justifyContent: 'space-between' }]}><Text style={[ui.title, { color: colors.font }]}>Login</Text><IconButton label="Close login" name="close" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} /></View><TextInput accessibilityLabel="Email" placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary }]} /><TextInput accessibilityLabel="Password" placeholder="Password" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} style={[ui.input, { color: colors.font, borderColor: colors.border, backgroundColor: colors.secondary }]} /><Button label={busy ? 'Please wait…' : 'Sign in'} primary disabled={busy} onPress={() => { void authenticate(false); }} /><Button label="Create account" disabled={busy} onPress={() => { void authenticate(true); }} /><Button label="Forgot password?" disabled={busy} onPress={() => { void requestPasswordReset(); }} /></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
