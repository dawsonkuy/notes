import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useBestpad } from '../../context';
import { breakParagraph, fromBlocks, isTrashed, noteName, toBlocks, type Block, type Note } from '../../model';
import { Button, Icon, IconButton, SaveStatus, ui } from '../../components/ui';
type Cursor = { id: string; start: number; end: number };
type InsertKind = 'heading-1' | 'heading-2' | 'heading-3' | 'bullet-list' | 'numbered-list' | 'checklist' | 'time' | 'date';
function orderedNumber(blocks: Block[], index: number) {
  let number = 1;
  for (let i = index - 1; i >= 0 && blocks[i].list === 'ordered'; i--) number++;
  return number;
}
function NoteEditor({ note }: { note: Note }) {
  const { colors, appearance, snapshot, store } = useBestpad(), insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState(() => toBlocks(note, randomUUID)), [insertOpen, setInsertOpen] = useState(false);
  const blocksRef = useRef(blocks); const noteRef = useRef(note);
  const displayed = useRef(JSON.stringify([note.text, note.content]));
  useLayoutEffect(() => {
    noteRef.current = note;
    const signature = JSON.stringify([note.text, note.content]);
    if (signature !== displayed.current) { const next = toBlocks(note, randomUUID); blocksRef.current = next; setBlocks(next); displayed.current = signature; }
  }, [note]);
  const inputs = useRef<Record<string, React.ComponentRef<typeof TextInput> | null>>({});
  const cursor = useRef<Cursor>({ id: blocks[0].id, start: 0, end: 0 });
  const slash = useRef<Cursor | null>(null), dismissedSlash = useRef<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<Cursor | null>(null);
  const fontFamily = appearance.font === 'serif' ? Platform.OS === 'ios' ? 'Georgia' : 'serif' : appearance.font === 'mono' ? Platform.OS === 'ios' ? 'Menlo' : 'monospace' : appearance.font === 'rounded' ? Platform.OS === 'ios' ? 'Avenir Next' : 'sans-serif' : undefined;
  function emit(next: Block[]) { blocksRef.current = next; setBlocks(next); const updated = fromBlocks(noteRef.current, next); displayed.current = JSON.stringify([updated.text, updated.content]); store.updateNote(updated); }
  useEffect(() => {
    if (!pendingFocus) return;
    let frame: number;
    let tries = 0;
    const focus = () => {
      const input = inputs.current[pendingFocus.id];
      if (!input && tries++ < 3) { frame = requestAnimationFrame(focus); return; }
      if (input) {
        input.focus();
        input.setNativeProps({ selection: { start: pendingFocus.start, end: pendingFocus.end } });
        cursor.current = pendingFocus;
      }
      setPendingFocus(current => current === pendingFocus ? null : current);
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [pendingFocus]);
  function checkSlash(selection: Cursor) {
    const block = blocksRef.current.find(item => item.id === selection.id); if (!block || selection.start !== selection.end || !inputs.current[selection.id]?.isFocused()) return;
    const match = /(?:^|\s)(\/insert)$/.exec(block.text.slice(0, selection.start));
    if (!match) { if (slash.current) { slash.current = null; setInsertOpen(false); } dismissedSlash.current = null; return; }
    const range = { id: block.id, start: selection.start - 7, end: selection.start };
    if (`${range.id}:${range.start}` !== dismissedSlash.current) { slash.current = range; setInsertOpen(true); }
  }
  function change(block: Block, text: string) {
    const index = blocksRef.current.findIndex(item => item.id === block.id); if (index < 0) return;
    if (!text.includes('\n')) { const next = blocksRef.current.map(item => item.id === block.id ? { ...item, text } : item); emit(next); return; }
    let prefix = 0, suffix = 0; while (prefix < block.text.length && prefix < text.length && block.text[prefix] === text[prefix]) prefix++;
    while (suffix < block.text.length - prefix && suffix < text.length - prefix && block.text.at(-1 - suffix) === text.at(-1 - suffix)) suffix++;
    const target = text.slice(0, text.length - suffix).split('\n');
    const replacements: Block[] = text.split('\n').map((line, i) => i === 0 ? { ...block, text: line } : { id: randomUUID(), text: line, list: block.list === 'checked' ? 'unchecked' : block.list });
    const next = [...blocksRef.current.slice(0, index), ...replacements, ...blocksRef.current.slice(index + 1)]; emit(next);
    const focus = replacements[Math.min(target.length - 1, replacements.length - 1)]; setPendingFocus({ id: focus.id, start: target.at(-1)!.length, end: target.at(-1)!.length });
  }
  function returnFromParagraph(block: Block) {
    const selection = cursor.current.id === block.id ? cursor.current : { id: block.id, start: block.text.length, end: block.text.length };
    const result = breakParagraph(blocksRef.current, block.id, selection, randomUUID);
    if (!result) return;
    if (result.blocks !== blocksRef.current) emit(result.blocks);
    setPendingFocus(result.focus);
  }
  function backspace(block: Block) {
    const selection = cursor.current, index = blocksRef.current.findIndex(item => item.id === block.id);
    if (selection.id !== block.id || selection.start || selection.end || index <= 0) return;
    const previous = blocksRef.current[index - 1];
    if (previous.divider) { emit(blocksRef.current.filter(item => item.id !== previous.id)); return; }
    const length = previous.text.length; const next = blocksRef.current.filter(item => item.id !== block.id).map(item => item.id === previous.id ? { ...previous, text: previous.text + block.text } : item); emit(next); setPendingFocus({ id: previous.id, start: length, end: length });
  }
  function dismissInsert() { if (slash.current) dismissedSlash.current = `${slash.current.id}:${slash.current.start}`; slash.current = null; setInsertOpen(false); }
  function insert(kind: InsertKind) {
    const range = slash.current || cursor.current, list = blocksRef.current; let index = list.findIndex(item => item.id === range.id && !item.divider);
    if (index < 0) index = list.findLastIndex(item => !item.divider);
    if (index < 0) return;
    const block = list[index], start = Math.min(range.start, block.text.length), end = Math.min(range.end, block.text.length), before = block.text.slice(0, start), after = block.text.slice(end);
    dismissInsert();
    if (kind !== 'time' && kind !== 'date') {
      const heading = kind.startsWith('heading-') ? Number(kind.slice(-1)) as 1 | 2 | 3 : undefined;
      const listStyle: Block['list'] = kind === 'bullet-list' ? 'bullet' : kind === 'numbered-list' ? 'ordered' : kind === 'checklist' ? 'unchecked' : undefined;
      // On an empty paragraph, apply formatting in place to avoid extra blank lines.
      if (!block.text && !block.heading && !block.list && !before && !after) {
        emit(list.map(item => item.id === block.id ? { ...item, heading, list: listStyle } : item));
        setPendingFocus({ id: block.id, start: 0, end: 0 });
      } else {
        const inserted: Block = { id: randomUUID(), text: '', heading, list: listStyle };
        const replacement: Block[] = [
          ...(before ? [{ ...block, text: before }] : []),
          inserted,
          { id: randomUUID(), text: after, ...(after ? { heading: block.heading, list: block.list } : {}) },
        ];
        emit([...list.slice(0, index), ...replacement, ...list.slice(index + 1)]);
        setPendingFocus({ id: inserted.id, start: 0, end: 0 });
      }
    } else {
      const text = new Intl.DateTimeFormat(undefined, kind === 'time' ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
      emit(list.map(item => item.id === block.id ? { ...block, text: before + text + after } : item)); setPendingFocus({ id: block.id, start: start + text.length, end: start + text.length });
    }
  }
  const close = () => { void store.flush(); if (router.canGoBack()) router.back(); else router.replace('/'); };
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[ui.container, { backgroundColor: colors.primary }]}><KeyboardAvoidingView style={ui.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[ui.row, { justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 }]}><Pressable accessibilityRole="button" accessibilityLabel="Notes" onPress={close} style={[ui.row, { minHeight: 44 }]}><Icon name="chevron-back" /><Text style={{ color: colors.font, fontSize: 15 }}>Notes</Text></Pressable><IconButton name="share-outline" label="Share note" onPress={() => { void Share.share({ title: noteName(note), message: `${noteName(note)}\n\n${note.text}` }).catch(() => undefined); }} /></View>
    <ScrollView keyboardShouldPersistTaps="always" keyboardDismissMode="none" contentContainerStyle={{ padding: 24, paddingTop: 20, paddingBottom: 50 }}>
      {blocks.map((block, index) => block.divider ? <View key={block.id} style={[ui.row, { marginVertical: 10 }]}><View style={{ height: 1, flex: 1, backgroundColor: colors.border }} /><IconButton name="close" label="Remove divider" onPress={() => { const next = blocks.filter(item => item.id !== block.id); emit(next.length ? next : [{ id: randomUUID(), text: '' }]); }} /></View> : <View key={block.id} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>{(block.list === 'checked' || block.list === 'unchecked') ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: block.list === 'checked' }} accessibilityLabel={block.text || 'Task'} onPress={() => emit(blocks.map(item => item.id === block.id ? { ...item, list: item.list === 'checked' ? 'unchecked' : 'checked' } : item))} style={{ minWidth: 38, minHeight: 40, paddingTop: 4 }}><Icon name={block.list === 'checked' ? 'checkbox-outline' : 'square-outline'} /></Pressable> : (block.list === 'bullet' || block.list === 'ordered') ? <View accessible={false} style={{ width: 38, paddingTop: 2, alignItems: 'flex-start' }}><Text style={{ color: colors.font, fontSize: appearance.size, lineHeight: appearance.size * 1.55 }}>{block.list === 'bullet' ? '•' : `${orderedNumber(blocks, index)}.`}</Text></View> : null}
      <TextInput ref={input => { inputs.current[block.id] = input; }} accessibilityLabel={block.heading ? `Heading ${block.heading}` : block.list === 'bullet' ? `Bulleted list item ${index + 1}` : block.list === 'ordered' ? `Numbered list item ${orderedNumber(blocks, index)}` : block.list ? `Checklist item ${index + 1}` : `Note paragraph ${index + 1}`} multiline scrollEnabled={false} submitBehavior="submit" returnKeyType="default" placeholder={block.heading ? 'Heading' : blocks.length === 1 ? 'Start writing…' : ''} placeholderTextColor={colors.muted} value={block.text} onChangeText={text => change(block, text)} onSubmitEditing={() => returnFromParagraph(block)} onSelectionChange={event => { if (!inputs.current[block.id]?.isFocused()) return; const next = { id: block.id, ...event.nativeEvent.selection }; cursor.current = next; checkSlash(next); }} onKeyPress={event => { if (event.nativeEvent.key === 'Backspace') backspace(block); }} style={{ flex: 1, padding: 0, margin: 0, color: colors.font, fontFamily, fontSize: appearance.size * (block.heading === 1 ? 1.6 : block.heading === 2 ? 1.35 : block.heading === 3 ? 1.15 : 1), lineHeight: appearance.size * (block.heading === 1 ? 2.1 : block.heading === 2 ? 1.85 : block.heading === 3 ? 1.65 : 1.55), minHeight: appearance.size * 1.55, fontWeight: block.heading ? '700' : '400', textDecorationLine: block.list === 'checked' ? 'line-through' : 'none', textAlignVertical: 'top' }} /></View>)}
    </ScrollView>
    <View style={{ padding: 16, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.border }}><View style={[ui.row, { justifyContent: 'space-between', marginBottom: 12 }]}><SaveStatus status={snapshot.status} /><Text style={{ color: colors.muted, fontSize: 10 }}>{note.text.trim().split(/\s+/).filter(Boolean).length} words</Text></View><View style={[ui.row, { justifyContent: 'space-between' }]}><Button label="Insert" icon="add" onPress={() => setInsertOpen(true)} /></View></View>
    <Modal visible={insertOpen} transparent animationType="fade" onRequestClose={dismissInsert}><Pressable accessibilityRole="button" accessibilityLabel="Close Insert menu" onPress={dismissInsert} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}><Pressable accessibilityRole="none" onPress={() => undefined} style={{ padding: 20, paddingBottom: Math.max(insets.bottom, 20), maxHeight: '78%', backgroundColor: colors.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={{ color: colors.muted, marginBottom: 10 }}>Insert</Text><ScrollView keyboardShouldPersistTaps="always">{([{ kind: 'heading-1', label: 'Large heading (H1)', icon: 'text-outline' }, { kind: 'heading-2', label: 'Medium heading (H2)', icon: 'text-outline' }, { kind: 'heading-3', label: 'Small heading (H3)', icon: 'text-outline' }, { kind: 'bullet-list', label: 'Bulleted list', icon: 'list-outline' }, { kind: 'numbered-list', label: 'Numbered list', icon: 'list-outline' }, { kind: 'checklist', label: 'Checklist', icon: 'checkbox-outline' }, { kind: 'time', label: 'Current time', icon: 'time-outline' }, { kind: 'date', label: 'Current date', icon: 'calendar-outline' }] as const).map(item => <Pressable key={item.kind} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => insert(item.kind)} style={[ui.row, { minHeight: 54 }]}><Icon name={item.icon} /><Text style={{ color: colors.font, fontSize: 16 }}>{item.label}</Text></Pressable>)}</ScrollView></Pressable></Pressable></Modal>
  </KeyboardAvoidingView></SafeAreaView>;
}
export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { snapshot, colors } = useBestpad();
  const note = snapshot.workspace.tabs.find(item => item.id === id && !isTrashed(item));
  if (snapshot.loading) return <View style={[ui.container, { backgroundColor: colors.primary, justifyContent: 'center' }]}><ActivityIndicator color={colors.font} /></View>;
  if (!note) return <View style={[ui.container, { padding: 24, justifyContent: 'center', backgroundColor: colors.primary }]}><Button label="Back to notes" onPress={() => router.replace('/')} /></View>;
  return <NoteEditor key={`${snapshot.user || 'guest'}:${note.id}`} note={note} />;
}
