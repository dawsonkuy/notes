import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform, PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useBestpad } from '../context';
import { entries, treeEntries, canMove, type Entry, type TreeEntry } from '../organization';
import { isTrashed, noteName } from '../model';
import { Button, Icon, IconButton, ui } from './ui';
import { projectVerticalDrag } from '../dragGeometry';
import { AnimatedLibraryRow, LibraryCell, LiftedRow } from './AnimatedLibraryRow';
type Props = { trash: boolean; bottomSpace: boolean; onOpen: (id: string) => void; onRename: (id: string) => void; onRemove: (id: string) => void; onDelete: (id: string) => void };
export function OrganizedLibrary(props: Props) {
  const { snapshot, store, colors } = useBestpad(); const workspace = snapshot.workspace;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggle(id: string) { setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  const data: TreeEntry[] = props.trash ? workspace.tabs.filter(isTrashed).map(note => ({ id: note.id, kind: 'note', name: noteName(note), pinned: false, order: 0, depth: 0, parentId: null })) : treeEntries(workspace, expanded);
  const [menu, setMenu] = useState<Entry | null>(null), [moving, setMoving] = useState<Entry | null>(null), [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null), [hover, setHover] = useState<string | null>(null);
  const [dragY] = useState(() => new Animated.Value(0)), [shifts, setShifts] = useState<Record<string, number>>({});
  const root = useRef<React.ComponentRef<typeof View>>(null);
  const bounds = useRef({ top: 0, bottom: Dimensions.get('window').height - 90 });
  const settleOffset = useRef(0), startFingerY = useRef(0);
  const startOffset = useRef(0), previousShifts = useRef(''), restoreExpanded = useRef<string | null>(null);
  const claimed = useRef(false);
  const drag = useRef<string | null>(null), target = useRef<{ parent: string | null; before?: string } | null>(null);
  const rows = useRef<Record<string, React.ComponentRef<typeof View> | null>>({});
  const measured = useRef<Record<string, { y: number; height: number }>>({});
  const list = useRef<React.ComponentRef<typeof FlatList<TreeEntry>>>(null), offset = useRef(0);
  const latest = useRef({ data, props, store });
  React.useEffect(() => { latest.current = { data, props, store }; }, [data, props, store]);
  function measure() { Object.entries(rows.current).forEach(([id, row]) => row?.measureInWindow((_x, y, _w, height) => { measured.current[id] = { y, height }; })); }
  const finishDrag = useCallback((commit: boolean) => {
    const id = drag.current, destination = target.current, restore = restoreExpanded.current;
    drag.current = null; target.current = null; restoreExpanded.current = null;
    if (commit && id && destination) latest.current.store.move(id, destination.parent, destination.before);
    setExpanded(current => { const next = new Set(current); if (restore) next.add(restore); if (commit && destination?.parent) next.add(destination.parent); return next; });
    dragY.stopAnimation(); dragY.setValue(0); setShifts({}); previousShifts.current = ''; setDragId(null); setHover(null);
  }, [dragY]);
  // PanResponder registers these event callbacks; it does not execute them during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onPanResponderGrant: () => { claimed.current = true; },
    onMoveShouldSetPanResponder: () => Boolean(drag.current),
    onPanResponderMove: (_event, gesture) => {
      const { data } = latest.current, id = drag.current, box = id ? measured.current[id] : null; if (!id || !box) return;
      const scrollDelta = offset.current - startOffset.current;
      const slots = data.flatMap(item => { const value = measured.current[item.id]; return value ? [{ id: item.id, top: value.y - scrollDelta, height: value.height }] : []; });
      const source = { id, top: box.y - scrollDelta, height: box.height };
      const projection = projectVerticalDrag(source, gesture.moveY - startFingerY.current + scrollDelta, bounds.current, slots, 12);
      dragY.setValue(projection.delta);
      const center = projection.top + box.height / 2;
      const folder = data.find(item => { const value = measured.current[item.id]; return gesture.moveY > bounds.current.top + 12 && gesture.moveY < bounds.current.bottom - 12 && item.kind === 'folder' && item.id !== id && value && center > value.y - scrollDelta + value.height * .25 && center < value.y - scrollDelta + value.height * .75 && canMove(latest.current.store.getSnapshot().workspace, id, item.id); });
      let nextShifts = projection.shifts;
      if (folder) { target.current = { parent: folder.id }; setHover(folder.id); nextShifts = {}; const value = measured.current[folder.id]; settleOffset.current = Math.max(bounds.current.top, Math.min(value.y - scrollDelta + value.height / 2 - source.height / 2, bounds.current.bottom - source.height)) - source.top; }
      else {
        settleOffset.current = Math.max(bounds.current.top, Math.min(projection.settleTop, bounds.current.bottom - source.height)) - source.top;
        setHover(null); const entry = data.find(item => item.id === projection.over);
        if (entry) { const parent = entry.parentId, siblings = entries(latest.current.store.getSnapshot().workspace, parent), index = siblings.findIndex(item => item.id === entry.id); target.current = { parent, before: projection.direction > 0 ? siblings[index + 1]?.id : entry.id }; }
        else target.current = null;
      }
      const signature = JSON.stringify(nextShifts); if (signature !== previousShifts.current) { previousShifts.current = signature; setShifts(nextShifts); }
      if (gesture.moveY < bounds.current.top + 28 || gesture.moveY > bounds.current.bottom - 28) { offset.current = Math.max(0, offset.current + (gesture.moveY < bounds.current.top + 28 ? -10 : 10)); list.current?.scrollToOffset({ offset: offset.current, animated: false }); }
    },
    onPanResponderRelease: () => { if (!target.current) { claimed.current = false; finishDrag(false); return; } claimed.current = true; Animated.timing(dragY, { toValue: settleOffset.current, duration: 120, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => { claimed.current = false; if (finished) finishDrag(true); }); },
    onPanResponderTerminate: () => { claimed.current = false; finishDrag(false); },
  }), [dragY, finishDrag]);
  function endLongPress(id: string) { if (drag.current !== id) return; requestAnimationFrame(() => { if (!claimed.current && drag.current === id) finishDrag(false); }); }
  function startDrag(id: string, fingerY: number) {
    if (props.trash || drag.current) return; claimed.current = false; startFingerY.current = fingerY; startOffset.current = offset.current; dragY.setValue(0);
    if (expanded.has(id)) { restoreExpanded.current = id; setExpanded(current => { const next = new Set(current); next.delete(id); return next; }); }
    drag.current = id; setDragId(id);
    root.current?.measureInWindow((_x, y, _width, height) => { bounds.current = { top: y + 12, bottom: y + height - 12 }; });
    requestAnimationFrame(() => requestAnimationFrame(measure));
  }
  function saveFolder() { if (!editing?.name.trim()) return; if (editing.id) store.renameFolder(editing.id, editing.name); else store.addFolder(editing.name); setEditing(null); }
  const sheet = (content: React.ReactNode, close: () => void) => <Modal transparent animationType="fade" visible onRequestClose={close}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable onPress={close} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' }}><Pressable onPress={() => undefined} style={{ borderRadius: 20, padding: 20, gap: 12, backgroundColor: colors.secondary, maxHeight: '85%' }}>{content}</Pressable></Pressable></KeyboardAvoidingView></Modal>;
  return <View ref={root} style={{ flex: 1, overflow: 'hidden' }} {...responder.panHandlers}><LiftedRow.Provider value={dragId}>
    <FlatList<TreeEntry> CellRendererComponent={LibraryCell} removeClippedSubviews={false} ref={list} data={data} keyExtractor={item => item.id} scrollEnabled={!dragId} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} contentContainerStyle={{ padding: 24, paddingTop: 12, gap: 12, flexGrow: 1, paddingBottom: props.bottomSpace ? 100 : 32 }} ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}><Icon name={props.trash ? 'trash-outline' : 'folder-open-outline'} size={32} /><Text style={{ color: colors.muted }}>{props.trash ? 'Trash is empty' : 'This folder is empty'}</Text></View>} renderItem={({ item }) => {
      const note = item.kind === 'note' ? workspace.tabs.find(value => value.id === item.id)! : null;
      return <AnimatedLibraryRow active={dragId === item.id} dragY={dragY} offset={shifts[item.id] || 0} reordering={dragId !== null} rowRef={value => { rows.current[item.id] = value; }} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: hover === item.id ? colors.font : colors.border, backgroundColor: colors.secondary, marginLeft: 0 }}>
        {item.kind === 'folder' && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded.has(item.id) ? 'Collapse' : 'Expand'} folder ${item.name}`} accessibilityState={{ expanded: expanded.has(item.id) }} onPress={() => toggle(item.id)} onLongPress={event => startDrag(item.id, event.nativeEvent.pageY)} onPressOut={() => endLongPress(item.id)} delayLongPress={250} style={{ minWidth: 48, minHeight: 64, justifyContent: 'center', alignItems: 'center' }}><Icon name={expanded.has(item.id) ? 'folder-open-outline' : 'folder-outline'} size={26} /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.kind === 'folder' ? 'Toggle folder' : props.trash ? 'Restore' : 'Open'} ${item.name}`} onLongPress={event => startDrag(item.id, event.nativeEvent.pageY)} onPressOut={() => endLongPress(item.id)} delayLongPress={250} accessibilityHint="Hold to drag this item" onPress={() => item.kind === 'folder' ? toggle(item.id) : props.trash ? store.restore(item.id) : props.onOpen(item.id)} style={{ flex: 1, padding: 16, paddingLeft: item.kind === 'folder' ? 2 : 16 }}><View style={ui.row}>{item.pinned && <Icon name="pin" size={15} />}{note?.sealed && <Icon name="lock-closed-outline" size={15} />}<Text numberOfLines={1} style={{ flex: 1, color: colors.font, fontWeight: '600', fontSize: 16 }}>{item.name}</Text></View>{note && <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{note.sealed ? 'Password protected' : note.text.trim() || 'Empty note'}</Text>}</Pressable>
        {props.trash ? <View><IconButton label={`Restore ${item.name}`} name="arrow-undo-outline" onPress={() => store.restore(item.id)} /><IconButton label={`Permanently delete ${item.name}`} name="trash-outline" onPress={() => props.onDelete(item.id)} /></View> : <IconButton label={`Options for ${item.name}`} name="ellipsis-horizontal" onPress={() => setMenu(item)} />}
      </AnimatedLibraryRow>;
    }} />
    {menu && sheet(<><Text style={{ color: colors.font, fontSize: 18, fontWeight: '600' }}>{menu.name}</Text><Button label={menu.pinned ? (menu.kind === 'folder' ? 'Unpin folder' : 'Unpin note') : (menu.kind === 'folder' ? 'Pin folder' : 'Pin note')} onPress={() => { store.pin(menu.id); setMenu(null); }} /><Button label="Rename" onPress={() => { if (menu.kind === 'folder') setEditing({ id: menu.id, name: menu.name }); else if (workspace.tabs.find(note => note.id === menu.id)?.sealed) Alert.alert('Protected note', 'Remove password protection in the editor before renaming.'); else props.onRename(menu.id); setMenu(null); }} /><Button label="Move…" onPress={() => { setMoving(menu); setMenu(null); }} /><View style={ui.row}><View style={{ flex: 1 }}><Button label="Move up" onPress={() => { const parent = workspace.folders?.find(item => item.id === menu.id)?.parentId || workspace.tabs.find(item => item.id === menu.id)?.folderId || null, siblings = data.filter(item => item.parentId === parent && item.pinned === menu.pinned), index = siblings.findIndex(item => item.id === menu.id); if (index > 0) store.move(menu.id, parent, siblings[index - 1].id); setMenu(null); }} /></View><View style={{ flex: 1 }}><Button label="Move down" onPress={() => { const parent = workspace.folders?.find(item => item.id === menu.id)?.parentId || workspace.tabs.find(item => item.id === menu.id)?.folderId || null, siblings = data.filter(item => item.parentId === parent && item.pinned === menu.pinned), index = siblings.findIndex(item => item.id === menu.id); if (index >= 0 && index < siblings.length - 1) store.move(menu.id, parent, siblings[index + 2]?.id); setMenu(null); }} /></View></View><Button label={menu.kind === 'folder' ? 'Delete folder' : 'Move to Trash'} onPress={() => { if (menu.kind === 'folder') Alert.alert('Delete folder?', 'Notes and subfolders will move to the parent folder.', [{ text: 'Cancel' }, { text: 'Delete folder', onPress: () => store.removeFolder(menu.id) }]); else props.onRemove(menu.id); setMenu(null); }} /><Button label="Cancel" onPress={() => setMenu(null)} /></>, () => setMenu(null))}
    {moving && sheet(<><Text style={{ color: colors.font, fontSize: 18 }}>Move to folder</Text><ScrollView><Button label="All notes" onPress={() => { store.move(moving.id, null); setMoving(null); }} />{(workspace.folders || []).filter(folder => canMove(workspace, moving.id, folder.id)).map(folder => <View key={folder.id} style={{ marginTop: 8 }}><Button label={folder.name} onPress={() => { store.move(moving.id, folder.id); setMoving(null); }} /></View>)}</ScrollView><Button label="Cancel" onPress={() => setMoving(null)} /></>, () => setMoving(null))}
    {editing && sheet(<><Text style={{ color: colors.font, fontSize: 18 }}>{editing.id ? 'Rename folder' : 'New folder'}</Text><TextInput accessibilityLabel="Folder name" returnKeyType="done" onSubmitEditing={saveFolder} autoFocus maxLength={80} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} style={[ui.input, { color: colors.font, borderColor: colors.border }]} /><Button label="Save folder" disabled={!editing.name.trim()} onPress={saveFolder} /><Button label="Cancel" onPress={() => setEditing(null)} /></>, () => setEditing(null))}
  </LiftedRow.Provider></View>;
}
