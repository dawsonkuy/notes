import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { saveWorkspaceBackup } from '../../backup';
import { parseWorkspaceBackup } from '../../backupData';
import { router } from 'expo-router';
import { builtInThemes, defaults, saveTheme, type Colors } from '../../appearance';
import { useBestpad } from '../../context';
import { supabase } from '../../supabase';
import { ColorEditor } from '../../components/ColorEditor';
import { Button, Icon, IconButton, SaveStatus, ui } from '../../components/ui';
function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useBestpad();
  return <View style={{ marginBottom: 24 }}>
    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 14, textAlign: 'center' }}>{title.toUpperCase()}</Text>
    {children}
  </View>;
}
export default function Settings() {
  const { appearance, appearanceReady, appearanceError, setAppearance, colors, session, snapshot, store } = useBestpad();
  const [part, setPart] = useState<keyof Colors | null>(null), [name, setName] = useState(''), [customOpen, setCustomOpen] = useState(false), [busy, setBusy] = useState(false), [deleting, setDeleting] = useState(false), [importing, setImporting] = useState(false), [exporting, setExporting] = useState(false);
  const names = { font: 'Font', primary: 'Primary', secondary: 'Secondary' };
  const selectedSavedTheme = appearance.themes.find(theme => theme.id === appearance.selected);
  const selectedThemeMatches = (theme: { mode: string; colors: Colors }) => appearance.mode === theme.mode && (['font', 'primary', 'secondary'] as const).every(key => appearance.colors[key] === theme.colors[key]);
  const legalLinks = [
    { title: 'Privacy Policy', description: 'How your notes and account data are handled', url: 'https://bestpad.app/privacy.html' },
    { title: 'Terms of Service', description: 'Rules for using Bestpad', url: 'https://bestpad.app/terms.html' },
    { title: 'Account Deletion', description: 'What is removed and how to delete your account', url: 'https://bestpad.app/delete-account.html' },
    { title: 'Help & support', description: 'Troubleshooting, account help and support', url: 'https://bestpad.app/support.html' },
  ] as const;
  function openLegalPage(url: string) {
    void Linking.openURL(url).catch(() => Alert.alert('Unable to open page', 'Check your internet connection and try again.'));
  }
  async function exportBackup() {
    if (exporting || snapshot.loading) return;
    setExporting(true);
    try {
      await saveWorkspaceBackup(store.getSnapshot().workspace);
      Alert.alert('Backup saved', Platform.OS === 'ios' && Constants.appOwnership !== 'expo'
        ? 'A JSON backup of all notes, including Trash, was saved to Files → On My iPhone → Bestpad. Keep another copy outside the app.'
        : 'Your complete JSON backup was created. Save a copy using the share sheet to recover it later.');
    } catch (error) {
      Alert.alert('Backup failed', error instanceof Error ? error.message : 'Could not export your notes.');
    } finally { setExporting(false); }
  }
  async function importFromBackup() {
    if (importing || snapshot.loading) return;
    setImporting(true);
    try {
      const selected = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain'] });
      if (selected.canceled) return;
      const file = selected.result;
      if (file.size > 12_000_000) throw new Error('Backup is too large.');
      const imported = parseWorkspaceBackup(await file.text());
      Alert.alert('Import BestPad backup?', 'This adds notes and folders from your backup. Existing notes are never overwritten, and notes with duplicate IDs are skipped. Save your current notes before importing.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import notes', onPress: () => {
          try {
            const result = store.importWorkspace(imported);
            Alert.alert('Import complete', `${result.added} notes added, ${result.skipped} skipped, and ${result.foldersAdded} folders added. Wait for Saved to cloud before switching devices.`);
          } catch (error) { Alert.alert('Import failed', error instanceof Error ? error.message : 'Your existing notes were kept.'); }
        } },
      ]);
    } catch (error) { Alert.alert('Could not open backup', error instanceof Error ? error.message : 'Select a BestPad JSON backup.'); }
    finally { setImporting(false); }
  }
  function confirmGuestImport() {
    Alert.alert('Import guest notes?', 'Add guest notes from this iPhone to your signed-in account? Existing account notes are kept, and the original guest notes remain on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import', onPress: () => {
        void store.importGuestNotes().then(result => {
          Alert.alert('Guest import complete', `${result.added} notes added and ${result.skipped} skipped. Wait for Saved to cloud before signing out.`);
        }).catch(error => Alert.alert('Import failed', error instanceof Error ? error.message : 'Guest notes were not imported.'));
      } },
    ]);
  }
  async function completeSignOut() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch (error) {
      Alert.alert('Sign out failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }
  async function signOut() {
    if (busy || deleting || snapshot.loading) return;
    setBusy(true);
    try {
      await store.flush();
      // A best-effort flush can return while another write is running, or
      // because the device is offline. Never treat that as a cloud confirmation.
      const current = store.getSnapshot();
      if (current.user && current.status !== 'saved') {
        setBusy(false);
        Alert.alert('Notes are not synced yet', 'Your latest notes have not been confirmed in the cloud. Stay signed in and retry syncing, or sign out anyway if you already have a backup.', [
          { text: 'Stay signed in', style: 'cancel' },
          { text: 'Sign out anyway', style: 'destructive', onPress: () => { void completeSignOut(); } },
        ]);
        return;
      }
      await completeSignOut();
    } catch (error) {
      Alert.alert('Sign out failed', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }
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
    <Text style={[ui.title, { color: colors.font, marginBottom: 8, textAlign: 'center', fontSize: 38 }]}>Settings</Text>
    <SettingsSection title="Account">{session ? <View style={{ gap: 12 }}><Text style={{ color: colors.font, textAlign: 'center' }}>{session.user.email}</Text><View style={{ alignItems: 'center' }}><SaveStatus status={snapshot.status} /></View><Button label={busy ? 'Signing out…' : 'Sign out'} disabled={busy || deleting} onPress={() => { void signOut(); }} /></View> : <Button label="Login / Create account" icon="person-outline" onPress={() => router.push('/login')} />}<Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 10, textAlign: 'center' }}>{session ? 'Notes sync with your Bestpad account.' : 'Notes stay on this device until you use an account. Guest and account workspaces are separate.'}</Text>
      <Pressable accessibilityRole="link" accessibilityLabel="Open Bestpad on the web at bestpad.app" onPress={() => openLegalPage('https://bestpad.app')} style={({ pressed }) => ({ marginTop: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.secondary, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? .7 : 1 })}>
        <Icon name="globe-outline" size={20} color={colors.font} />
        <View style={{ flex: 1, gap: 4, alignItems: 'center' }}>
          <Text style={{ color: colors.font, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>Use Bestpad on any device</Text>
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>bestpad.app · Sign in to access your synced notes.</Text>
        </View>
        <Icon name="open-outline" size={17} color={colors.muted} />
      </Pressable>
    </SettingsSection>
    <SettingsSection title="Themes">
      <View style={{ gap: 9 }}>
        {builtInThemes.map(theme => <Pressable key={theme.id} accessibilityRole="button" accessibilityLabel={`Apply ${theme.name} theme`} accessibilityState={{ selected: selectedThemeMatches(theme) }} disabled={!appearanceReady} onPress={() => { setAppearance(current => ({ ...current, mode: theme.mode, colors: { ...theme.colors }, selected: theme.id })); setName(''); }} style={{ minHeight: 54, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.secondary, borderWidth: 1, borderColor: selectedThemeMatches(theme) ? colors.font : colors.border }}>
          <View style={{ flexDirection: 'row' }}>{(['primary', 'secondary', 'font'] as const).map(key => <View key={key} style={{ width: 18, height: 24, backgroundColor: theme.colors[key], borderWidth: .5, borderColor: colors.border }} />)}</View>
          <Text style={{ color: colors.font, flex: 1, fontSize: 14, textAlign: 'center', fontWeight: selectedThemeMatches(theme) ? '700' : '500' }}>{theme.name}</Text>
          {selectedThemeMatches(theme) && <Icon name="checkmark" size={19} color={colors.font} />}
        </Pressable>)}
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 10, marginBottom: 2, textAlign: 'center' }}>{`SAVED THEMES · ${appearance.themes.length}/4`}</Text>
        {appearance.themes.length === 0 && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>Themes you save in Custom theme appear here.</Text>}
        {appearance.themes.map(theme => <View key={theme.id} style={ui.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Apply ${theme.name}`} accessibilityState={{ selected: selectedThemeMatches(theme) }} onPress={() => { setAppearance(current => ({ ...current, mode: theme.mode, colors: { ...theme.colors }, selected: theme.id })); setName(theme.name); }} style={{ flex: 1, minHeight: 54, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.secondary, borderWidth: 1, borderColor: selectedThemeMatches(theme) ? colors.font : colors.border }}>
            <View style={{ flexDirection: 'row' }}>{(['primary', 'secondary', 'font'] as const).map(key => <View key={key} style={{ width: 18, height: 24, backgroundColor: theme.colors[key], borderWidth: .5, borderColor: colors.border }} />)}</View>
            <Text numberOfLines={1} style={{ color: colors.font, flex: 1, fontSize: 14, textAlign: 'center' }}>{theme.name}</Text>
            {selectedThemeMatches(theme) && <Icon name="checkmark" size={19} color={colors.font} />}
          </Pressable>
          <IconButton label={`Delete theme ${theme.name}`} name="close" onPress={() => setAppearance(current => ({ ...current, themes: current.themes.filter(t => t.id !== theme.id), selected: current.selected === theme.id ? null : current.selected }))} />
        </View>)}
      </View>
    </SettingsSection>
    <SettingsSection title="Custom theme">
      <Pressable accessibilityRole="button" accessibilityLabel="Custom theme" accessibilityState={{ expanded: customOpen }} onPress={() => { setCustomOpen(value => !value); if (customOpen) setPart(null); }} style={{ minHeight: 58, padding: 14, borderRadius: 13, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, gap: 4, alignItems: 'center' }}>
          <Text style={{ color: colors.font, fontWeight: '700', fontSize: 14, textAlign: 'center' }}>Customize your colors</Text>
          <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>Pick colors and save your own theme</Text>
        </View>
        <Icon name={customOpen ? 'chevron-up' : 'chevron-down'} size={21} />
      </Pressable>
      {customOpen && <View style={{ marginTop: 12, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>STARTING COLORS</Text>
        <View style={ui.row}>{(['light', 'dark'] as const).map(mode => <View key={mode} style={{ flex: 1 }}><Button disabled={!appearanceReady} label={mode === 'light' ? 'Light' : 'Dark'} primary={appearance.mode === mode} icon={mode === 'light' ? 'sunny-outline' : 'moon-outline'} onPress={() => { setAppearance(current => ({ ...current, mode, colors: { ...defaults[mode] }, selected: mode === 'light' ? 'preset-paper' : 'preset-midnight' })); setName(''); }} /></View>)}</View>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' }}>CUSTOMIZE COLORS</Text>
        <View style={ui.row}>{(['font', 'primary', 'secondary'] as const).map(key => <Pressable key={key} accessibilityRole="button" accessibilityLabel={`Edit ${names[key]} color`} accessibilityState={{ selected: part === key }} disabled={!appearanceReady} onPress={() => setPart(key)} style={{ flex: 1, padding: 12, minHeight: 95, borderRadius: 13, backgroundColor: colors.secondary, borderWidth: 1, borderColor: part === key ? colors.font : colors.border, alignItems: 'center' }}><View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: appearance.colors[key], borderWidth: 1, borderColor: colors.muted, marginBottom: 12 }} /><Text style={{ color: colors.font, fontSize: 12, textAlign: 'center' }}>{names[key]}</Text></Pressable>)}</View>
        {part && <ColorEditor key={part} value={appearance.colors[part]} label={names[part]} onClose={() => setPart(null)} onChange={value => setAppearance(current => ({ ...current, selected: builtInThemes.some(theme => theme.id === current.selected) ? null : current.selected, colors: { ...current.colors, [part]: value } }))} />}
        <TextInput accessibilityLabel="Theme name" placeholder="Name your theme" placeholderTextColor={colors.muted} maxLength={24} value={name} onChangeText={setName} style={[ui.input, { color: colors.font, backgroundColor: colors.secondary, borderColor: colors.border, textAlign: 'center' }]} />
        <Button label="Save theme" primary disabled={!appearanceReady || appearance.themes.length >= 4} onPress={() => setAppearance(current => saveTheme(current, name, randomUUID()))} />
        {selectedSavedTheme && <Button label="Update selected theme" onPress={() => setAppearance(current => ({ ...current, themes: current.themes.map(t => t.id === current.selected ? { ...t, name: name.trim().slice(0, 24) || t.name, mode: current.mode, colors: { ...current.colors } } : t) }))} />}
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>{appearance.themes.length >= 4 ? 'Four themes saved. Delete one above to save another, or update the selected theme.' : 'Save up to four custom themes. Saved themes appear above with the built-in choices.'}</Text>
      </View>}
    </SettingsSection>
    <SettingsSection title="Backups & recovery">
      <View style={{ gap: 10 }}>
        <Button label={exporting ? 'Exporting backup…' : 'Export JSON backup'} icon="download-outline" disabled={exporting || snapshot.loading} onPress={() => { void exportBackup(); }} />
        <Button label={importing ? 'Opening backup…' : 'Import JSON backup'} icon="document-attach-outline" disabled={importing || snapshot.loading || snapshot.status === 'conflict'} onPress={() => { void importFromBackup(); }} />
        {session && <Button label="Import guest notes into account" icon="person-add-outline" disabled={snapshot.loading || snapshot.status === 'conflict'} onPress={confirmGuestImport} />}
      </View>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 8, textAlign: 'center' }}>Imports add missing notes; they never replace existing notes. Protected notes keep their original IDs so passwords still work. Export a backup here before major recovery operations.</Text>
    </SettingsSection>
    <SettingsSection title="Note font"><View style={{ gap: 8 }}>{([{ key: 'sans', name: 'Clean', family: undefined }, { key: 'serif', name: 'Book', family: Platform.OS === 'ios' ? 'Georgia' : 'serif' }, { key: 'mono', name: 'Typewriter', family: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }, { key: 'rounded', name: 'Rounded', family: Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif' }] as const).map(font => <Pressable key={font.key} accessibilityRole="radio" accessibilityState={{ checked: appearance.font === font.key }} onPress={() => setAppearance(current => ({ ...current, font: font.key }))} style={{ padding: 14, borderRadius: 12, borderWidth: 1, backgroundColor: colors.secondary, borderColor: appearance.font === font.key ? colors.font : colors.border, alignItems: 'center' }}><Text style={{ color: colors.font, fontFamily: font.family, fontSize: 16, textAlign: 'center' }}>{font.name}</Text></Pressable>)}</View></SettingsSection>
    <SettingsSection title="Text size"><View style={ui.row}>{([{ size: 16, label: 'Small' }, { size: 18, label: 'Medium' }, { size: 22, label: 'Large' }] as const).map(item => <View key={item.size} style={{ flex: 1 }}><Button label={item.label} primary={appearance.size === item.size} onPress={() => setAppearance(current => ({ ...current, size: item.size }))} /></View>)}</View></SettingsSection>
    <SettingsSection title="Legal & privacy"><View style={{ gap: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.secondary, overflow: 'hidden' }}>{legalLinks.map((item, index) => <Pressable key={item.url} accessibilityRole="link" accessibilityLabel={item.title} onPress={() => openLegalPage(item.url)} style={({ pressed }) => ({ padding: 15, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index === legalLinks.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? .7 : 1 })}><View style={{ flex: 1, gap: 4, alignItems: 'center' }}><Text style={{ color: colors.font, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>{item.title}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' }}>{item.description}</Text></View><Icon name="open-outline" size={17} color={colors.muted} /></Pressable>)}</View><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 9, textAlign: 'center' }}>These pages open on bestpad.app. Account deletion itself happens inside Bestpad.</Text></SettingsSection>
    {!!appearanceError && <Text style={{ color: colors.muted, textAlign: 'center' }}>{appearanceError}</Text>}
    <SettingsSection title="Account deletion"><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 10, textAlign: 'center' }}>Deleting your account permanently removes its cloud notes, including Trash. Export anything important first.</Text>{session ? <Button label={deleting ? 'Deleting account…' : 'Delete account'} icon="trash-outline" danger disabled={busy || deleting} onPress={confirmDelete} /> : <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>Sign in to delete an account. Guest notes are stored on this device.</Text>}</SettingsSection>
  </ScrollView></SafeAreaView>;
}
