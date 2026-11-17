import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useBestpad } from '../../context';
import { saveWorkspaceBackup } from '../../backup';
import { isTrashed, noteName } from '../../model';
import { Button, Icon, IconButton, SaveStatus, ui } from '../../components/ui';

import { OrganizedLibrary } from '../../components/OrganizedLibrary';
export default function Notes() {
  const { colors, snapshot, store, authReady } = useBestpad();
  const [showTrash, setShowTrash] = useState(false);
  const [homeRevision, setHomeRevision] = useState(0);
  const [lastRemoved, setLastRemoved] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState(false), [folderName, setFolderName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [exporting, setExporting] = useState(false);
  const trashCount = snapshot.workspace.tabs.filter(isTrashed).length;
  const notes = snapshot.workspace.tabs.filter(note => isTrashed(note) === showTrash);
  const canUndo = lastRemoved && snapshot.workspace.tabs.some(note => note.id === lastRemoved && isTrashed(note));
  function showAllNotes() {
    setShowTrash(false);
    // Remount the library to reset scrolling and folder expansion, like returning Home.
    setHomeRevision(version => version + 1);
  }
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
      <Pressable accessibilityRole="button" accessibilityLabel="BestPad home" accessibilityHint="Show all notes from the top of your library" onPress={showAllNotes} style={({ pressed }) => [ui.row, { alignSelf: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 12, borderRadius: 12, opacity: pressed ? .7 : 1 }]}>
        <Image source={require('../../../assets/icon.png')} style={{ width: 26, height: 26, tintColor: colors.font }} />
        <Text style={{ color: colors.font, fontWeight: '700', fontSize: 18 }}>bestpad</Text>
      </Pressable>
      <View style={{ marginTop: 18, marginBottom: 8 }}>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <SaveStatus status={snapshot.status} />
          <Text style={{ color: colors.muted, fontSize: 11 }}>{notes.length} {notes.length === 1 ? 'note' : 'notes'}</Text>
        </View>
      </View>
      <View style={[ui.row, { gap: 6, marginTop: 8, marginBottom: 5 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="New note" disabled={snapshot.loading} onPress={() => { setShowTrash(false); open(store.add()); }} style={({ pressed }) => [styles.action, { flex: 1, backgroundColor: colors.font, opacity: snapshot.loading ? .4 : pressed ? .7 : 1 }]}>
          <Icon name="add" size={17} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>New note</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="New folder" disabled={snapshot.loading} onPress={() => { setShowTrash(false); setFolderName(''); setNewFolder(true); }} style={({ pressed }) => [styles.action, { flex: 1, backgroundColor: pressed ? colors.selected : colors.secondary, opacity: snapshot.loading ? .4 : 1 }]}>
          <Icon name="folder-open-outline" size={16} /><Text numberOfLines={1} style={{ color: colors.font, fontSize: 12, fontWeight: '600' }}>New folder</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={showTrash ? 'Back to notes' : 'Open Trash'} onPress={() => setShowTrash(value => !value)} style={({ pressed }) => [styles.action, { flex: 1, backgroundColor: pressed ? colors.selected : colors.secondary }]}>
          <Icon name={showTrash ? 'chevron-back' : 'trash-outline'} size={16} /><Text numberOfLines={1} style={{ color: colors.font, fontSize: 12, fontWeight: '600' }}>{showTrash ? 'Back' : `Trash (${trashCount})`}</Text>
        </Pressable>
      </View>
      {['pending', 'offline'].includes(snapshot.status) && <Pressable onPress={() => { void store.retry(); }} accessibilityRole="button" style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.font, fontSize: 12 }}>Retry sync</Text></Pressable>}
      {snapshot.status === 'conflict' && <Pressable accessibilityRole="button" disabled={exporting} onPress={() => { void backupThenUseCloud(); }} style={{ paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.font, fontSize: 12 }}>Back up local notes, then use cloud copy…</Text></Pressable>}
    </View>
    {snapshot.loading || !authReady ? <ActivityIndicator style={{ marginTop: 45 }} color={colors.font} /> : <OrganizedLibrary key={`home-${homeRevision}-${showTrash ? 'trash' : 'notes'}`} trash={showTrash} bottomSpace={Boolean(canUndo)} onOpen={open} onRename={beginRename} onRemove={remove} onDelete={permanentlyDelete} />}
    {canUndo && <View accessibilityLiveRegion="polite" style={[styles.undo, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Text style={{ color: colors.font, flex: 1, fontSize: 14 }}>Moved to Trash</Text><Pressable accessibilityRole="button" accessibilityLabel="Undo move to Trash" onPress={() => { if (lastRemoved) store.restore(lastRemoved); setLastRemoved(null); }} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Text style={{ color: colors.font, fontWeight: '700', fontSize: 14 }}>Undo</Text></Pressable><IconButton name="close" label="Dismiss undo" onPress={() => setLastRemoved(null)} /></View>}
    <Modal visible={newFolder} transparent animationType="fade" onRequestClose={() => setNewFolder(false)}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.modalBackdrop}><View style={[styles.modalPanel, { backgroundColor: colors.secondary, borderColor: colors.border }]}><Text style={{ color: colors.font, fontSize: 20, fontWeight: '600' }}>New folder</Text><TextInput accessibilityLabel="Folder name" autoFocus maxLength={80} value={folderName} onChangeText={setFolderName} style={[ui.input, { color: colors.font, borderColor: colors.border }]} /><Button label="Save folder" disabled={!folderName.trim()} onPress={() => { store.addFolder(folderName); setNewFolder(false); }} /><Button label="Cancel" onPress={() => setNewFolder(false)} /></View></View></KeyboardAvoidingView></Modal>
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
  action: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 5 },
  card: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 18, borderWidth: 1, paddingRight: 5, paddingTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  undo: { position: 'absolute', bottom: 16, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingLeft: 16, paddingRight: 4, paddingVertical: 4, boxShadow: '0px 4px 18px rgba(0,0,0,0.12)' },
  modalBackdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 22 },
  modalPanel: { borderRadius: 18, padding: 22, borderWidth: 1, gap: 18 },
});
