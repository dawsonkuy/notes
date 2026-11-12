import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useBestpad } from '../../context';
import { saveWorkspaceBackup } from '../../backup';
import { isTrashed, noteName } from '../../model';
import { Icon, IconButton, SaveStatus, ui } from '../../components/ui';

export default function Notes() {
  const { colors, snapshot, store, authReady } = useBestpad();
  const [showTrash, setShowTrash] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [exporting, setExporting] = useState(false);
  const trashCount = snapshot.workspace.tabs.filter(isTrashed).length;
  const notes = snapshot.workspace.tabs.filter(note => isTrashed(note) === showTrash);
  const canUndo = lastRemoved && snapshot.workspace.tabs.some(note => note.id === lastRemoved && isTrashed(note));
  function open(id: string) {
    store.activate(id);
    router.push({ pathname: '/editor/[id]', params: { id } });
  }
  function beginRename(id: string) {
    const note = snapshot.workspace.tabs.find(item => item.id === id && !isTrashed(item));
    if (!note) return;
    setRenameId(id);
    setRenameDraft(note.customName || noteName(note));
  }
  function finishRename(automatic = false) {
    if (!renameId) return;
    store.rename(renameId, automatic ? null : renameDraft);
    setRenameId(null);
  }
  async function exportNotes() {
    if (snapshot.loading || exporting) return;
    setExporting(true);
    try {
      await saveWorkspaceBackup(store.getSnapshot().workspace);
      Alert.alert('Backup saved', Platform.OS === 'ios' && Constants.appOwnership !== 'expo'
        ? 'A JSON copy of all notes, including Trash, was saved in Files → On My iPhone → Bestpad. Keep an external copy too.'
        : 'A complete JSON backup was created. Save a separate copy with the share sheet so you can recover it outside this app.');
    } catch (error) {
      Alert.alert('Backup failed', error instanceof Error ? error.message : 'Could not save your notes. Try again before replacing anything.');
    } finally {
      setExporting(false);
    }
  }
  async function backupThenUseCloud() {
    if (snapshot.loading || exporting) return;
    setExporting(true);
    try {
      await saveWorkspaceBackup(store.getSnapshot().workspace, true);
      Alert.alert('Backup saved', 'Your complete local workspace was saved as JSON. The next action replaces this device\'s notes with the current cloud version. Make sure you want the cloud copy.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use cloud copy', style: 'destructive', onPress: () => {
          void store.useCloudCopy().catch(error => Alert.alert('Could not load cloud notes', error instanceof Error ? error.message : 'Local changes were kept.'));
        } },
      ]);
    } catch (error) {
      Alert.alert('Recovery cancelled', error instanceof Error ? error.message : 'Could not save a local backup; no notes were replaced.');
    } finally {
      setExporting(false);
    }
  }
  function remove(id: string) { store.remove(id); setLastRemoved(id); }
  function permanentlyDelete(id: string) {
    Alert.alert('Permanently delete note?', 'This removes the note from Trash on all synced devices. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete permanently', style: 'destructive', onPress: () => store.deletePermanently(id) },
    ]);
  }
  return <SafeAreaView edges={['top', 'left', 'right']} style={[ui.container, { backgroundColor: colors.primary }]}>
    <View style={styles.header}>
      <View style={[ui.row, { justifyContent: 'center' }]}>
        <Image source={require('../../../assets/icon.png')} style={{ width: 26, height: 26, tintColor: colors.font }} />
        <Text style={{ color: colors.font, fontWeight: '700', fontSize: 18 }}>bestpad</Text>
      </View>
      <View style={[ui.row, { marginTop: 26, justifyContent: 'space-between' }]}>
        <Text style={[ui.title, { color: colors.font }]}>{showTrash ? 'Trash' : 'Notes'}</Text>
        <Pressable disabled={snapshot.loading} accessibilityRole="button" accessibilityLabel="New note" onPress={() => { setShowTrash(false); open(store.add()); }} style={({ pressed }) => [styles.new, { backgroundColor: colors.font, opacity: snapshot.loading ? .4 : pressed ? .7 : 1, transform: [{ scale: pressed ? .95 : 1 }] }]}>
          <Icon name="add" size={25} color={colors.primary} />
        </Pressable>
      </View>
      <View style={[ui.row, { justifyContent: 'space-between', marginTop: 16 }]}>
        <SaveStatus status={snapshot.status} />
        <Text style={{ color: colors.muted, fontSize: 11 }}>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</Text>
      </View>
      <View style={[ui.row, { justifyContent: 'space-between', marginTop: 16 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={showTrash ? 'Back to notes' : 'Open Trash'} onPress={() => setShowTrash(value => !value)} style={({ pressed }) => [styles.utility, { backgroundColor: pressed ? colors.selected : colors.secondary }]}>
          <Icon name={showTrash ? 'chevron-back' : 'trash-outline'} size={16} /><Text style={{ color: colors.font, fontSize: 13 }}>{showTrash ? 'Back to notes' : `Trash (${trashCount})`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Export all notes as JSON backup" disabled={snapshot.loading || exporting} onPress={() => { void exportNotes(); }} style={[ui.row, { minHeight: 44, opacity: snapshot.loading || exporting ? .5 : 1 }]}>
          <Icon name="download-outline" size={18} /><Text style={{ color: colors.font, fontSize: 13 }}>{exporting ? 'Exporting…' : 'Export all'}</Text>
        </Pressable>
      </View>
      {['offline', 'conflict', 'cache-error'].includes(snapshot.status) && <Pressable onPress={() => { void store.retry(); }} accessibilityRole="button" style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.font, fontSize: 12 }}>Retry sync</Text></Pressable>}
      {snapshot.status === 'conflict' && <Pressable accessibilityRole="button" disabled={exporting} onPress={() => { void backupThenUseCloud(); }} style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.font, fontSize: 12 }}>Back up local notes, then use cloud copy…</Text></Pressable>}
    </View>
    {snapshot.loading || !authReady ? <ActivityIndicator style={{ marginTop: 45 }} color={colors.font} /> : <FlatList data={notes} keyExtractor={note => note.id} contentContainerStyle={{ padding: 24, paddingTop: 16, paddingBottom: canUndo ? 100 : 32, gap: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled" ListEmptyComponent={<View style={styles.empty}><Icon name={showTrash ? 'trash-outline' : 'document-text-outline'} size={32} color={colors.muted} /><Text style={{ color: colors.font, fontWeight: '600', fontSize: 17 }}>{showTrash ? 'Trash is empty' : 'No notes'}</Text><Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{showTrash ? 'Deleted notes will appear here.' : 'Tap + to create a note.'}</Text></View>} renderItem={({ item }) =>
      <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={showTrash ? `Restore note ${noteName(item)}` : `Open ${noteName(item)}`} onPress={() => showTrash ? store.restore(item.id) : open(item.id)} style={({ pressed }) => ({ flex: 1, padding: 18, paddingRight: 6, opacity: pressed ? .6 : 1 })}>
          <Text numberOfLines={1} style={{ color: colors.font, fontSize: 17, fontWeight: '600', marginBottom: 9 }}>{noteName(item)}</Text>
          <Text numberOfLines={3} style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{item.text.trim() || 'Empty note'}</Text>
        </Pressable>
        {showTrash ? <View>
          <IconButton label={`Restore ${noteName(item)}`} name="arrow-undo-outline" onPress={() => store.restore(item.id)} />
          <IconButton label={`Permanently delete ${noteName(item)}`} name="trash-outline" onPress={() => permanentlyDelete(item.id)} />
        </View> : <View>
          <IconButton label={`Rename ${noteName(item)}`} name="create-outline" onPress={() => beginRename(item.id)} />
          <IconButton label={`Move ${noteName(item)} to Trash`} name="trash-outline" onPress={() => remove(item.id)} />
        </View>}
      </View>} />}
    {canUndo && <View accessibilityLiveRegion="polite" style={[styles.undo, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Text style={{ color: colors.font, flex: 1, fontSize: 14 }}>Moved to Trash</Text><Pressable accessibilityRole="button" accessibilityLabel="Undo move to Trash" onPress={() => { if (lastRemoved) store.restore(lastRemoved); setLastRemoved(null); }} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: colors.font, fontWeight: '700', fontSize: 14 }}>Undo</Text></Pressable><IconButton name="close" label="Dismiss undo" onPress={() => setLastRemoved(null)} /></View>}
    <Modal visible={renameId !== null} animationType="fade" transparent onRequestClose={() => setRenameId(null)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => setRenameId(null)} style={styles.modalBackdrop}>
          <Pressable onPress={() => undefined} style={[styles.modalPanel, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Text style={{ color: colors.font, fontSize: 19, fontWeight: '700' }}>Rename note</Text>
            <TextInput accessibilityLabel="New note title" autoFocus selectTextOnFocus value={renameDraft} onChangeText={setRenameDraft} maxLength={80} returnKeyType="done" onSubmitEditing={() => finishRename()} style={[ui.input, { color: colors.font, backgroundColor: colors.primary, borderColor: colors.border }]} />
            <View style={[ui.row, { justifyContent: 'flex-end' }]}>
              <Pressable accessibilityRole="button" onPress={() => finishRename(true)} style={{ padding: 10, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: 12 }}>Automatic title</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => finishRename()} style={{ padding: 10, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.font, fontSize: 15, fontWeight: '700' }}>Save</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  header: { padding: 24, paddingBottom: 6 },
  new: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 18, borderWidth: 1, paddingRight: 5, paddingTop: 4 },
  utility: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  undo: { position: 'absolute', bottom: 16, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingLeft: 16, paddingRight: 4, paddingVertical: 4, boxShadow: '0px 4px 18px rgba(0,0,0,0.12)' },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 22 },
  modalPanel: { borderRadius: 18, padding: 22, borderWidth: 1, gap: 18 },
});
