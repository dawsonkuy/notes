import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { router } from 'expo-router';
import { defaults, saveTheme, type Colors } from '../../appearance';
import { useBestpad } from '../../context';
import { supabase } from '../../supabase';
import { ColorEditor } from '../../components/ColorEditor';
import { Button, Icon, IconButton, SaveStatus, Section, ui } from '../../components/ui';
export default function Settings() {
  const { appearance, appearanceReady, appearanceError, setAppearance, colors, session, snapshot, store } = useBestpad();
  const [part, setPart] = useState<keyof Colors | null>(null), [name, setName] = useState(''), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState(false);
  const names = { font: 'Font', primary: 'Primary', secondary: 'Secondary' };
  const legalLinks = [
    { title: 'Privacy Policy', description: 'How your notes and account data are handled', url: 'https://bestpad.app/privacy.html' },
    { title: 'Terms of Service', description: 'Rules for using Bestpad', url: 'https://bestpad.app/terms.html' },
    { title: 'Account Deletion', description: 'What is removed and how to delete your account', url: 'https://bestpad.app/delete-account.html' },
  ] as const;
  function openLegalPage(url: string) {
    void Linking.openURL(url).catch(() => Alert.alert('Unable to open page', 'Check your internet connection and try again.'));
  }
  async function signOut() { setBusy(true); try { await store.flush(); const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) throw error; } catch (error) { Alert.alert('Sign out failed', error instanceof Error ? error.message : 'Please try again.'); } finally { setBusy(false); } }
  function confirmDelete() {
    Alert.alert('Delete your account?', 'This permanently deletes your Bestpad account and all cloud notes. This cannot be undone. Guest notes and appearance settings on this device are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: () => { void deleteAccount(); } },
    ]);
  }
  async function deleteAccount() {
    if (!session || busy || deleting) return;
    const userId = session.user.id; setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } });
      if (error || data?.deleted !== true) throw new Error('Could not delete your account. Check your connection and try again.');
    } catch (error) {
      Alert.alert('Account deletion failed', error instanceof Error ? error.message : 'Please try again.'); setDeleting(false); return;
    }
    let cleared = true;
    try { await store.forgetAccount(userId); } catch { cleared = false; }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    setDeleting(false);
    Alert.alert('Account deleted', cleared ? 'Your account and cloud notes have been permanently deleted.' : 'Your account and cloud notes were deleted. A local recovery copy could not be removed from this device.');
  }
  return <SafeAreaView edges={['top', 'left', 'right']} style={[ui.container, { backgroundColor: colors.primary }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
    <Text style={[ui.title, { color: colors.font, marginBottom: 8 }]}>Settings</Text>
    <Section title="Account">{session ? <View style={{ gap: 12 }}><Text style={{ color: colors.font }}>{session.user.email}</Text><SaveStatus status={snapshot.status} /><Button label={busy ? 'Signing out…' : 'Sign out'} disabled={busy || deleting} onPress={() => { void signOut(); }} /></View> : <Button label="Login / Create account" icon="person-outline" onPress={() => router.push('/login')} />}<Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 10 }}>{session ? 'Notes sync with your Bestpad account.' : 'Notes stay on this device until you use an account. Guest and account workspaces are separate.'}</Text></Section>
    <Section title="Mode"><View style={ui.row}>{(['light', 'dark'] as const).map(mode => <View key={mode} style={{ flex: 1 }}><Button disabled={!appearanceReady} label={mode === 'light' ? 'Light' : 'Dark'} primary={appearance.mode === mode} icon={mode === 'light' ? 'sunny-outline' : 'moon-outline'} onPress={() => { setAppearance(current => ({ ...current, mode, colors: { ...defaults[mode] }, selected: null })); setName(''); }} /></View>)}</View></Section>
    <Section title="Customize colors"><View style={ui.row}>{(['font', 'primary', 'secondary'] as const).map(key => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Edit ${names[key]} color`} accessibilityState={{ selected: part === key }} disabled={!appearanceReady} onPress={() => setPart(key)} style={{ flex: 1, padding: 12, minHeight: 95, borderRadius: 13, backgroundColor: colors.secondary, borderWidth: 1, borderColor: part === key ? colors.font : colors.border }}><View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: appearance.colors[key], borderWidth: 1, borderColor: colors.muted, marginBottom: 12 }} /><Text style={{ color: colors.font, fontSize: 12 }}>{names[key]}</Text></Pressable>)}</View>{part && <ColorEditor key={part} value={appearance.colors[part]} label={names[part]} onClose={() => setPart(null)} onChange={value => setAppearance(current => ({ ...current, colors: { ...current.colors, [part]: value } }))} />}</Section>
    <Section title={`Your themes · ${appearance.themes.length}/4`}><View style={{ gap: 9 }}>{appearance.themes.length === 0 && <Text style={{ color: colors.muted, fontSize: 12 }}>No saved themes.</Text>}{appearance.themes.map(theme => <View key={theme.id} style={ui.row}><Pressable accessibilityRole="button" accessibilityLabel={`Apply ${theme.name}`} accessibilityState={{ selected: appearance.selected === theme.id }} onPress={() => { setAppearance(current => ({ ...current, mode: theme.mode, colors: { ...theme.colors }, selected: theme.id })); setName(theme.name); }} style={{ flex: 1, minHeight: 48, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.secondary, borderWidth: 1, borderColor: appearance.selected === theme.id ? colors.font : colors.border }}><View style={{ flexDirection: 'row' }}>{(['primary', 'secondary', 'font'] as const).map(key => <View key={key} style={{ width: 14, height: 22, backgroundColor: theme.colors[key], borderWidth: .5, borderColor: colors.border }} />)}</View><Text numberOfLines={1} style={{ color: colors.font, flex: 1, fontSize: 13 }}>{theme.name}</Text></Pressable><IconButton label={`Delete theme ${theme.name}`} name="close" onPress={() => setAppearance(current => ({ ...current, themes: current.themes.filter(t => t.id !== theme.id), selected: current.selected === theme.id ? null : current.selected }))} /></View>)}</View>
      <TextInput accessibilityLabel="Theme name" placeholder="Name your theme" placeholderTextColor={colors.muted} maxLength={24} value={name} onChangeText={setName} style={[ui.input, { marginTop: 14, marginBottom: 10, color: colors.font, backgroundColor: colors.secondary, borderColor: colors.border }]} />
      <Button label="Save theme" primary disabled={!appearanceReady || appearance.themes.length >= 4} onPress={() => setAppearance(current => saveTheme(current, name, randomUUID()))} />
      {appearance.selected && <View style={{ marginTop: 10 }}><Button label="Update selected theme" onPress={() => setAppearance(current => ({ ...current, themes: current.themes.map(t => t.id === current.selected ? { ...t, name: name.trim().slice(0, 24) || t.name, mode: current.mode, colors: { ...current.colors } } : t) }))} /></View>}
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 10 }}>{appearance.themes.length >= 4 ? 'Delete a theme to save another, or update a selected theme.' : 'Save up to four custom themes on this device.'}</Text>
    </Section>
    <Section title="Note font"><View style={{ gap: 8 }}>{([{ key: 'sans', name: 'Clean', family: undefined }, { key: 'serif', name: 'Book', family: Platform.OS === 'ios' ? 'Georgia' : 'serif' }, { key: 'mono', name: 'Typewriter', family: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, { key: 'rounded', name: 'Rounded', family: Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif' }] as const).map(font => <Pressable key={font.key} accessibilityRole="radio" accessibilityState={{ checked: appearance.font === font.key }} onPress={() => setAppearance(current => ({ ...current, font: font.key }))} style={{ padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: colors.secondary, borderColor: appearance.font === font.key ? colors.font : colors.border }}><Text style={{ color: colors.font, fontFamily: font.family, fontSize: 16 }}>{font.name}</Text></Pressable>)}</View></Section>
    <Section title="Text size"><View style={ui.row}>{([{ size: 16, label: 'Small' }, { size: 18, label: 'Medium' }, { size: 22, label: 'Large' }] as const).map(item => <View key={item.size} style={{ flex: 1 }}><Button label={item.label} primary={appearance.size === item.size} onPress={() => setAppearance(current => ({ ...current, size: item.size }))} /></View>)}</View></Section>
    <Section title="Legal & privacy"><View style={{ gap: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.secondary, overflow: 'hidden' }}>{legalLinks.map((item, index) => <Pressable key={item.url} accessibilityRole="link" accessibilityLabel={item.title} onPress={() => openLegalPage(item.url)} style={({ pressed }) => ({ padding: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index === legalLinks.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? .7 : 1 })}><View style={{ flex: 1, gap: 4 }}><Text style={{ color: colors.font, fontSize: 14, fontWeight: '600' }}>{item.title}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>{item.description}</Text></View><Icon name="open-outline" size={17} color={colors.muted} /></Pressable>)}</View><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 9 }}>These pages open on bestpad.app. Account deletion itself happens inside Bestpad.</Text></Section>
    {!!appearanceError && <Text style={{ color: colors.muted }}>{appearanceError}</Text>}
    <Section title="Account deletion"><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 10 }}>Deleting your account permanently removes its cloud notes, including Trash. Export anything important first.</Text>{session ? <Pressable accessibilityRole="button" accessibilityLabel="Delete account" disabled={busy || deleting} onPress={confirmDelete} style={{ minHeight: 46, justifyContent: 'center', opacity: busy || deleting ? .4 : 1 }}><Text style={{ color: '#d75353', fontSize: 14, fontWeight: '600' }}>{deleting ? 'Deleting account…' : 'Delete account'}</Text></Pressable> : <Text style={{ color: colors.muted, fontSize: 12 }}>Sign in to delete an account. Guest notes are stored on this device.</Text>}</Section>
  </ScrollView></SafeAreaView>;
}
