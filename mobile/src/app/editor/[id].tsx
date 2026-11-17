import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useBestpad } from '../../context';
import { applyInlineStyle, inlineStyles, sliceInlineRuns, breakParagraph, joinBackward, replaceParagraphText, fromBlocks, isTrashed, noteName, toBlocks, type Block, type InlineStyle, type Note } from '../../model';
import { Button, Icon, IconButton, SaveStatus, ui } from '../../components/ui';
import { NotePassword } from '../../components/NotePassword';
type Cursor = { id: string; start: number; end: number };
type InsertKind = 'heading-1' | 'heading-2' | 'heading-3' | 'bullet-list' | 'numbered-list' | 'checklist' | 'time' | 'date';
function orderedNumber(blocks: Block[], index: number) {
  let number = 1;
  for (let i = index - 1; i >= 0 && blocks[i].list === 'ordered'; i--) number++;
  return number;
}
function NoteEditor({ note }: { note: Note }) {
  const { colors, appearance, snapshot, store } = useBestpad(), insets = useSafeAreaInsets();
  const [protectOpen, setProtectOpen] = useState(false);
  const [blocks, setBlocks] = useState(() => toBlocks(note, randomUUID)), [insertOpen, setInsertOpen] = useState(false);
  const blocksRef = useRef(blocks); const noteRef = useRef(note);
  const displayed = useRef(JSON.stringify([note.text, note.content]));
  useLayoutEffect(() => {
    noteRef.current = note;
    const signature = JSON.stringify([note.text, note.content]);
    if (signature !== displayed.current) { const next = toBlocks(note, randomUUID); blocksRef.current = next; setBlocks(next); displayed.current = signature; }
  }, [note]);
  const inputs = useRef<Record<string, React.ComponentRef<typeof TextInput> | null>>({});
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef({ height: 0, offset: 0 });
  const layouts = useRef<Record<string, { y: number; height: number }>>({});
  function keepCaretVisible() {
    const selection = cursor.current, block = blocksRef.current.find(item => item.id === selection.id), layout = layouts.current[selection.id];
    if (!block || !layout || !inputs.current[selection.id]?.isFocused() || selection.start !== selection.end || selection.end < block.text.length) return;
    const bottom = layout.y + layout.height + 24;
    if (viewport.current.height && bottom > viewport.current.offset + viewport.current.height) scroll.current?.scrollTo({ y: Math.max(0, bottom - viewport.current.height), animated: false });
  }
  const cursor = useRef<Cursor>({ id: blocks[0].id, start: 0, end: 0 });
  const slash = useRef<Cursor | null>(null), dismissedSlash = useRef<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<Cursor | null>(null);
  const typingStyle = useRef<{ id: string; flags: InlineStyle } | null>(null);
  const [, refreshToolbar] = useState(0);
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
        if (Platform.OS === 'web') {
          (input as unknown as { setSelectionRange?: (start: number, end: number) => void }).setSelectionRange?.(pendingFocus.start, pendingFocus.end);
        } else input.setNativeProps({ selection: { start: pendingFocus.start, end: pendingFocus.end } });
        cursor.current = pendingFocus;
      }
      setPendingFocus(current => current === pendingFocus ? null : current);
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [pendingFocus]);
  function checkSlash(selection: Cursor) {
    const block = blocksRef.current.find(item => item.id === selection.id); if (!block || selection.start !== selection.end || !inputs.current[selection.id]?.isFocused()) return;
    const match = /(?:^|\s)(\/(?:add|insert))$/.exec(block.text.slice(0, selection.start));
    if (!match) { if (slash.current) { slash.current = null; setInsertOpen(false); } dismissedSlash.current = null; return; }
    const range = { id: block.id, start: selection.start - match[1].length, end: selection.start };
    if (`${range.id}:${range.start}` !== dismissedSlash.current) { slash.current = range; setInsertOpen(true); }
  }
  function change(block: Block, text: string) {
    const result = replaceParagraphText(blocksRef.current, block.id, text, randomUUID, cursor.current.id === block.id ? cursor.current : undefined, typingStyle.current?.id === block.id ? typingStyle.current.flags : undefined);
    if (!result) return;
    emit(result.blocks);
    if (result.focus) setPendingFocus(result.focus);
  }
  function returnFromParagraph(block: Block) {
    const selection = cursor.current.id === block.id ? cursor.current : { id: block.id, start: block.text.length, end: block.text.length };
    const result = breakParagraph(blocksRef.current, block.id, selection, randomUUID);
    if (!result) return;
    if (result.blocks !== blocksRef.current) emit(result.blocks);
    setPendingFocus(result.focus);
  }
  function backspace(block: Block) {
    if (cursor.current.id !== block.id) return;
    const result = joinBackward(blocksRef.current, block.id, cursor.current);
    if (!result) return;
    emit(result.blocks); setPendingFocus(result.focus);
  }
  function dismissInsert() { if (slash.current) dismissedSlash.current = `${slash.current.id}:${slash.current.start}`; slash.current = null; setInsertOpen(false); }
  function setHeading(level: 1 | 2) {
    const selection = cursor.current;
    const block = blocksRef.current.find(item => item.id === selection.id && !item.divider);
    if (!block) return;
    const heading = block.heading === level ? undefined : level;
    emit(blocksRef.current.map(item => item.id === block.id ? { ...item, heading, list: undefined } : item));
    setPendingFocus(selection);
  }
  function toggleInline(kind: 'bold' | 'italic') {
    const selection = cursor.current;
    const block = blocksRef.current.find(item => item.id === selection.id && !item.divider);
    if (!block) return;
    if (selection.start !== selection.end) {
      const result = applyInlineStyle(blocksRef.current, block.id, selection, kind);
      if (result) emit(result.blocks);
      typingStyle.current = null;
    } else {
      const flags = typingStyle.current?.id === block.id ? typingStyle.current.flags : inlineStyles(block)[Math.max(0, selection.start - 1)] || {};
      typingStyle.current = { id: block.id, flags: { ...flags, [kind]: flags[kind] ? undefined : true } };
    }
    refreshToolbar(x => x + 1);
    setPendingFocus(selection);
  }
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
          ...(before ? [{ ...block, text: before, runs: sliceInlineRuns(block, 0, start) }] : []),
          inserted,
          { id: randomUUID(), text: after, runs: sliceInlineRuns(block, end, block.text.length), ...(after ? { heading: block.heading, list: block.list } : {}) },
        ];
        emit([...list.slice(0, index), ...replacement, ...list.slice(index + 1)]);
        setPendingFocus({ id: inserted.id, start: 0, end: 0 });
      }
    } else {
      const text = new Intl.DateTimeFormat(undefined, kind === 'time' ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
      const result = replaceParagraphText(list, block.id, before + text + after, randomUUID, { start, end }, typingStyle.current?.id === block.id ? typingStyle.current.flags : undefined);
      if (result) emit(result.blocks);
      setPendingFocus({ id: block.id, start: start + text.length, end: start + text.length });
    }
  }
  function securityOptions() {
    const secured = store.getSnapshot().workspace.tabs.find(item => item.id === note.id)?.sealed;
    if (!secured) { setProtectOpen(true); return; }
    Alert.alert('Protected note', 'Choose an action.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Lock now', onPress: () => store.lock(note.id) }, { text: 'Remove password', style: 'destructive', onPress: () => store.unprotect(note.id) }]);
  }
  const close = () => { void store.flush(); if (router.canGoBack()) router.back(); else router.replace('/'); };
  if (protectOpen) return <NotePassword id={note.id} protect onCancel={() => setProtectOpen(false)} />;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[ui.container, { backgroundColor: colors.primary }]}><KeyboardAvoidingView style={ui.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[ui.row, { justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6 }]}><Pressable accessibilityRole="button" accessibilityLabel="Notes" onPress={close} style={[ui.row, { minHeight: 44 }]}><Icon name="chevron-back" /><Text style={{ color: colors.font, fontSize: 15 }}>Notes</Text></Pressable><View style={ui.row}><IconButton name="lock-closed-outline" label="Note password protection" onPress={securityOptions} /><IconButton name="share-outline" label="Share note" onPress={() => { void Share.share({ title: noteName(note), message: `${noteName(note)}\n\n${note.text}` }).catch(() => undefined); }} /></View></View>
    <ScrollView ref={scroll} onLayout={event => { viewport.current.height = event.nativeEvent.layout.height; keepCaretVisible(); }} onScroll={event => { viewport.current.offset = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ padding: 24, paddingTop: 20, paddingBottom: 24, flexGrow: 1 }}>
      {blocks.map((block, index) => block.divider ? <View key={block.id} style={[ui.row, { marginVertical: 10 }]}><View style={{ height: 1, flex: 1, backgroundColor: colors.border }} /><IconButton name="close" label="Remove divider" onPress={() => { const next = blocks.filter(item => item.id !== block.id); emit(next.length ? next : [{ id: randomUUID(), text: '' }]); }} /></View> : <View key={block.id} onLayout={event => { layouts.current[block.id] = event.nativeEvent.layout; keepCaretVisible(); }} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>{(block.list === 'checked' || block.list === 'unchecked') ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: block.list === 'checked' }} accessibilityLabel={block.text || 'Task'} onPress={() => emit(blocks.map(item => item.id === block.id ? { ...item, list: item.list === 'checked' ? 'unchecked' : 'checked' } : item))} style={{ minWidth: 38, minHeight: 40, paddingTop: 4 }}><Icon name={block.list === 'checked' ? 'checkbox-outline' : 'square-outline'} /></Pressable> : (block.list === 'bullet' || block.list === 'ordered') ? <View accessible={false} style={{ width: 38, paddingTop: 2, alignItems: 'flex-start' }}><Text style={{ color: colors.font, fontSize: appearance.size, lineHeight: appearance.size * 1.55 }}>{block.list === 'bullet' ? '•' : `${orderedNumber(blocks, index)}.`}</Text></View> : null}
      <TextInput ref={input => { inputs.current[block.id] = input; }} accessibilityLabel={block.heading ? `Heading ${block.heading}` : block.list === 'bullet' ? `Bulleted list item ${index + 1}` : block.list === 'ordered' ? `Numbered list item ${orderedNumber(blocks, index)}` : block.list ? `Checklist item ${index + 1}` : `Note paragraph ${index + 1}`} multiline autoCorrect spellCheck autoCapitalize="sentences" keyboardAppearance={colors.dark ? 'dark' : 'light'} selectionColor={colors.font} scrollEnabled={false} submitBehavior="submit" returnKeyType="default" placeholder={block.heading ? 'Heading' : blocks.length === 1 ? 'Start writing…' : ''} placeholderTextColor={colors.muted} value={block.runs?.length && Platform.OS === 'ios' ? undefined : block.text} onChangeText={text => change(block, text)} onSubmitEditing={() => returnFromParagraph(block)} onSelectionChange={event => { if (!inputs.current[block.id]?.isFocused()) return; const next = { id: block.id, ...event.nativeEvent.selection }; cursor.current = next; if (typingStyle.current && (next.id !== typingStyle.current.id || next.start !== next.end)) typingStyle.current = null; refreshToolbar(x => x + 1); checkSlash(next); keepCaretVisible(); }} onKeyPress={event => { if (event.nativeEvent.key === 'Backspace') backspace(block); }} style={{ flex: 1, padding: 0, margin: 0, color: colors.font, fontFamily, fontSize: appearance.size * (block.heading === 1 ? 1.6 : block.heading === 2 ? 1.35 : block.heading === 3 ? 1.15 : 1), lineHeight: appearance.size * (block.heading === 1 ? 2.1 : block.heading === 2 ? 1.85 : block.heading === 3 ? 1.65 : 1.55), minHeight: appearance.size * 1.55, fontWeight: block.heading ? '700' : '400', textDecorationLine: block.list === 'checked' ? 'line-through' : 'none', textAlignVertical: 'top' }}>{Platform.OS === 'ios' && block.runs?.length ? <Text>{block.runs.map((run, i) => <Text key={i} style={{ fontWeight: run.bold ? '700' : block.heading ? '700' : '400', fontStyle: run.italic ? 'italic' : 'normal' }}>{run.text}</Text>)}</Text> : null}</TextInput></View>)}
      <Pressable accessibilityRole="button" accessibilityLabel="Continue writing" onPress={() => { const last = blocksRef.current.findLast(item => !item.divider); if (last) setPendingFocus({ id: last.id, start: last.text.length, end: last.text.length }); }} style={{ minHeight: 100, flexGrow: 1 }} />
    </ScrollView>
    <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={[ui.row, { justifyContent: 'space-between', marginBottom: 6 }]}><SaveStatus status={snapshot.status} /><Text style={{ color: colors.muted, fontSize: 10 }}>{note.text.trim().split(/\s+/).filter(Boolean).length} words</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 2 }}>
        {([
          { label: 'Add', action: () => setInsertOpen(true), active: false },
          { label: 'H1', action: () => setHeading(1), active: blocks.find(b => b.id === cursor.current.id)?.heading === 1 },
          { label: 'H2', action: () => setHeading(2), active: blocks.find(b => b.id === cursor.current.id)?.heading === 2 },
          { label: 'B', action: () => toggleInline('bold'), active: Boolean((typingStyle.current?.id === cursor.current.id ? typingStyle.current.flags : inlineStyles(blocks.find(b => b.id === cursor.current.id) || { id: '', text: '' })[Math.max(0, cursor.current.start - 1)])?.bold) },
          { label: 'I', action: () => toggleInline('italic'), active: Boolean((typingStyle.current?.id === cursor.current.id ? typingStyle.current.flags : inlineStyles(blocks.find(b => b.id === cursor.current.id) || { id: '', text: '' })[Math.max(0, cursor.current.start - 1)])?.italic) },
        ] as const).map(item => <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label === 'B' ? 'Bold' : item.label === 'I' ? 'Italic' : item.label === 'Add' ? 'Add formatting' : item.label + ' heading'} accessibilityState={{ selected: item.active }} onPress={item.action} style={{ minWidth: 45, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: item.active ? colors.font : colors.border, backgroundColor: item.active ? colors.selected : colors.secondary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.font, fontSize: 14, fontWeight: item.label === 'B' || item.label.startsWith('H') ? '700' : '500', fontStyle: item.label === 'I' ? 'italic' : 'normal' }}>{item.label}</Text>
        </Pressable>)}
        <IconButton label="Dismiss keyboard" name="checkmark" onPress={() => Keyboard.dismiss()} />
      </ScrollView>
    </View>
    <Modal visible={insertOpen} transparent animationType="fade" onRequestClose={dismissInsert}><Pressable accessibilityRole="button" accessibilityLabel="Close Add menu" onPress={dismissInsert} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' }}><Pressable accessibilityRole="none" onPress={() => undefined} style={{ padding: 20, paddingBottom: Math.max(insets.bottom, 20), maxHeight: '78%', backgroundColor: colors.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><Text style={{ color: colors.muted, marginBottom: 10 }}>Add</Text>
      <View style={[ui.row, { marginBottom: 10 }]}>
        <View style={{ flex: 1 }}><Button label="Bold" onPress={() => { dismissInsert(); toggleInline('bold'); }} /></View>
        <View style={{ flex: 1 }}><Button label="Italic" onPress={() => { dismissInsert(); toggleInline('italic'); }} /></View>
      </View>
      <ScrollView keyboardShouldPersistTaps="always">{([{ kind: 'heading-1', label: 'Large heading (H1)', icon: 'text-outline' }, { kind: 'heading-2', label: 'Medium heading (H2)', icon: 'text-outline' }, { kind: 'heading-3', label: 'Small heading (H3)', icon: 'text-outline' }, { kind: 'bullet-list', label: 'Bulleted list', icon: 'list-outline' }, { kind: 'numbered-list', label: 'Numbered list', icon: 'list-outline' }, { kind: 'checklist', label: 'Checklist', icon: 'checkbox-outline' }, { kind: 'time', label: 'Current time', icon: 'time-outline' }, { kind: 'date', label: 'Current date', icon: 'calendar-outline' }] as const).map(item => <Pressable key={item.kind} accessibilityRole="button" accessibilityLabel={item.label} onPress={() => insert(item.kind)} style={[ui.row, { minHeight: 54 }]}><Icon name={item.icon} /><Text style={{ color: colors.font, fontSize: 16 }}>{item.label}</Text></Pressable>)}</ScrollView></Pressable></Pressable></Modal>
  </KeyboardAvoidingView></SafeAreaView>;
}
export default function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { snapshot, colors } = useBestpad();
  const { store } = useBestpad();
  const note = store.visibleNote(id);
  if (snapshot.loading) return <View style={[ui.container, { backgroundColor: colors.primary, justifyContent: 'center' }]}><ActivityIndicator color={colors.font} /></View>;
  if (!note || isTrashed(note)) return <View style={[ui.container, { padding: 24, justifyContent: 'center', backgroundColor: colors.primary }]}><Button label="Back to notes" onPress={() => router.replace('/')} /></View>;
  if (note.sealed) return <NotePassword id={note.id} onCancel={() => { if (store.visibleNote(note.id)?.sealed) router.replace('/'); }} />;
  return <NoteEditor key={`${snapshot.user || 'guest'}:${note.id}`} note={note} />;
}
