import React, { useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform, PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useBestpad } from '../context';
import { entries, treeEntries, canMove, type Entry, type TreeEntry } from '../organization';
import { isTrashed, noteName } from '../model';
import { Button, Icon, IconButton, ui } from './ui';
type Props = { trash: boolean; bottomSpace: boolean; onOpen: (id: string) => void; onRename: (id: string) => void; onRemove: (id: string) => void; onDelete: (id: string) => void };
export function OrganizedLibrary(props: Props) {
  const { snapshot, store, colors } = useBestpad(); const workspace = snapshot.workspace;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggle(id: string) { setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  const data: TreeEntry[] = props.trash ? workspace.tabs.filter(isTrashed).map(note => ({ id: note.id, kind: 'note', name: noteName(note), pinned: false, order: 0, depth: 0, parentId: null })) : treeEntries(workspace, expanded);
  const [menu, setMenu] = useState<Entry | null>(null), [moving, setMoving] = useState<Entry | null>(null), [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null), [hover, setHover] = useState<string | null>(null);
  const claimed = useRef(false);
  const drag = useRef<string | null>(null), target = useRef<{ parent: string | null; before?: string } | null>(null);
  const rows = useRef<Record<string, React.ComponentRef<typeof View> | null>>({});
  const measured = useRef<Record<string, { y: number; height: number }>>({});
  const list = useRef<React.ComponentRef<typeof FlatList<TreeEntry>>>(null), offset = useRef(0);
  const latest = useRef({ data, props, store });
  React.useEffect(() => { latest.current = { data, props, store }; }, [data, props, store]);
  function measure() { Object.entries(rows.current).forEach(([id, row]) => row?.measureInWindow((_x, y, _w, height) => { measured.current[id] = { y, height }; })); }
  // PanResponder registers these event callbacks; it does not execute them during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onPanResponderGrant: () => { claimed.current = true; },
    onMoveShouldSetPanResponder: () => Boolean(drag.current),
    onPanResponderMove: (_event, gesture) => {
      measure(); const { data } = latest.current;
      const found = Object.entries(measured.current).filter(([id]) => id === '__root' || data.some(item => item.id === id)).find(([, box]) => gesture.moveY >= box.y && gesture.moveY <= box.y + box.height);
      if (!found) return;
      const [id, box] = found; if (id === drag.current) { target.current = null; setHover(null); return; } const entry = data.find(item => item.id === id);
      if (id === '__root') target.current = { parent: null };
      else if (entry?.kind === 'folder' && gesture.moveY > box.y + box.height * .25 && gesture.moveY < box.y + box.height * .75) target.current = { parent: id };
      else {
        const parent = entry?.parentId || null, siblings = entries(latest.current.store.getSnapshot().workspace, parent), index = siblings.findIndex(item => item.id === id);
        target.current = { parent, before: gesture.moveY > box.y + box.height / 2 ? siblings[index + 1]?.id : id };
      }
      setHover(id);
      const boxes = Object.values(measured.current); const top = Math.min(...boxes.map(item => item.y)), bottom = Math.min(Dimensions.get('window').height - 90, Math.max(...boxes.map(item => item.y + item.height)));
      if (gesture.moveY < top + 25 || gesture.moveY > bottom - 25) { offset.current = Math.max(0, offset.current + (gesture.moveY < top + 25 ? -14 : 14)); list.current?.scrollToOffset({ offset: offset.current, animated: false }); }
    },
    onPanResponderRelease: () => { claimed.current = false; if (drag.current && target.current) { latest.current.store.move(drag.current, target.current.parent, target.current.before); const parent = target.current.parent; if (parent) setExpanded(current => new Set([...current, parent])); } drag.current = null; target.current = null; setDragId(null); setHover(null); },
    onPanResponderTerminate: () => { claimed.current = false; drag.current = null; target.current = null; setDragId(null); setHover(null); },
  }), []);
  function endLongPress(id: string) { if (drag.current !== id) return; requestAnimationFrame(() => { if (!claimed.current && drag.current === id) { drag.current = null; target.current = null; setDragId(null); setHover(null); } }); }
  function startDrag(id: string) { if (props.trash) return; measure(); claimed.current = false; drag.current = id; setDragId(id); }
  function saveFolder() { if (!editing?.name.trim()) return; if (editing.id) store.renameFolder(editing.id, editing.name); else store.addFolder(editing.name); setEditing(null); }
  const sheet = (content: React.ReactNode, close: () => void) => <Modal transparent animationType="fade" visible onRequestClose={close}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable onPress={close} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' }}><Pressable onPress={() => undefined} style={{ borderRadius: 20, padding: 20, gap: 12, backgroundColor: colors.secondary, maxHeight: '85%' }}>{content}</Pressable></Pressable></KeyboardAvoidingView></Modal>;
  return <View style={{ flex: 1 }} {...responder.panHandlers}>
    <FlatList<TreeEntry> ref={list} data={data} keyExtractor={item => item.id} scrollEnabled={!dragId} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} contentContainerStyle={{ padding: 24, paddingTop: 12, gap: 12, flexGrow: 1, paddingBottom: props.bottomSpace ? 100 : 32 }} ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}><Icon name={props.trash ? 'trash-outline' : 'folder-open-outline'} size={32} /><Text style={{ color: colors.muted }}>{props.trash ? 'Trash is empty' : 'This folder is empty'}</Text></View>} renderItem={({ item }) => {
      const note = item.kind === 'note' ? workspace.tabs.find(value => value.id === item.id)! : null;
      return <View ref={value => { rows.current[item.id] = value; }} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: hover === item.id ? colors.font : colors.border, opacity: dragId === item.id ? .5 : 1, backgroundColor: colors.secondary, marginLeft: item.depth * 18 }}>
        {item.kind === 'folder' && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded.has(item.id) ? 'Collapse' : 'Expand'} folder ${item.name}`} accessibilityState={{ expanded: expanded.has(item.id) }} onPress={() => toggle(item.id)} onLongPress={() => startDrag(item.id)} onPressOut={() => endLongPress(item.id)} delayLongPress={250} style={{ minWidth: 48, minHeight: 64, justifyContent: 'center', alignItems: 'center' }}><Icon name={expanded.has(item.id) ? 'chevron-down' : 'chevron-forward'} size={28} /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.kind === 'folder' ? 'Toggle folder' : props.trash ? 'Restore' : 'Open'} ${item.name}`} onLongPress={() => startDrag(item.id)} onPressOut={() => endLongPress(item.id)} delayLongPress={250} accessibilityHint="Hold to drag this item" onPress={() => item.kind === 'folder' ? toggle(item.id) : props.trash ? store.restore(item.id) : props.onOpen(item.id)} style={{ flex: 1, padding: 16, paddingLeft: item.kind === 'folder' ? 2 : 16 }}><View style={ui.row}>{item.pinned && <Icon name="pin" size={15} />}{note?.sealed && <Icon name="lock-closed-outline" size={15} />}<Text numberOfLines={1} style={{ flex: 1, color: colors.font, fontWeight: '600', fontSize: 16 }}>{item.name}</Text></View>{note && <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{note.sealed ? 'Password protected' : note.text.trim() || 'Empty note'}</Text>}</Pressable>
        {props.trash ? <View><IconButton label={`Restore ${item.name}`} name="arrow-undo-outline" onPress={() => store.restore(item.id)} /><IconButton label={`Permanently delete ${item.name}`} name="trash-outline" onPress={() => props.onDelete(item.id)} /></View> : <IconButton label={`Options for ${item.name}`} name="ellipsis-horizontal" onPress={() => setMenu(item)} />}
      </View>;
    }} />
    {dragId && <View ref={value => { rows.current.__root = value; }} style={{ margin: 16, padding: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.font }}><Text style={{ color: colors.font }}>Move out of folder</Text></View>}
    {menu && sheet(<><Text style={{ color: colors.font, fontSize: 18, fontWeight: '600' }}>{menu.name}</Text>{menu.kind === 'note' && <Button label={menu.pinned ? 'Unpin note' : 'Pin note'} onPress={() => { store.pin(menu.id); setMenu(null); }} />}<Button label="Rename" onPress={() => { if (menu.kind === 'folder') setEditing({ id: menu.id, name: menu.name }); else if (workspace.tabs.find(note => note.id === menu.id)?.sealed) Alert.alert('Protected note', 'Remove password protection in the editor before renaming.'); else props.onRename(menu.id); setMenu(null); }} /><Button label="Move…" onPress={() => { setMoving(menu); setMenu(null); }} /><View style={ui.row}><View style={{ flex: 1 }}><Button label="Move up" onPress={() => { const parent = workspace.folders?.find(item => item.id === menu.id)?.parentId || workspace.tabs.find(item => item.id === menu.id)?.folderId || null, siblings = data.filter(item => item.parentId === parent && item.pinned === menu.pinned), index = siblings.findIndex(item => item.id === menu.id); if (index > 0) store.move(menu.id, parent, siblings[index - 1].id); setMenu(null); }} /></View><View style={{ flex: 1 }}><Button label="Move down" onPress={() => { const parent = workspace.folders?.find(item => item.id === menu.id)?.parentId || workspace.tabs.find(item => item.id === menu.id)?.folderId || null, siblings = data.filter(item => item.parentId === parent && item.pinned === menu.pinned), index = siblings.findIndex(item => item.id === menu.id); if (index >= 0 && index < siblings.length - 1) store.move(menu.id, parent, siblings[index + 2]?.id); setMenu(null); }} /></View></View><Button label={menu.kind === 'folder' ? 'Delete folder' : 'Move to Trash'} onPress={() => { if (menu.kind === 'folder') Alert.alert('Delete folder?', 'Notes and subfolders will move to the parent folder.', [{ text: 'Cancel' }, { text: 'Delete folder', onPress: () => store.removeFolder(menu.id) }]); else props.onRemove(menu.id); setMenu(null); }} /><Button label="Cancel" onPress={() => setMenu(null)} /></>, () => setMenu(null))}
    {moving && sheet(<><Text style={{ color: colors.font, fontSize: 18 }}>Move to folder</Text><ScrollView><Button label="All notes" onPress={() => { store.move(moving.id, null); setMoving(null); }} />{(workspace.folders || []).filter(folder => canMove(workspace, moving.id, folder.id)).map(folder => <View key={folder.id} style={{ marginTop: 8 }}><Button label={folder.name} onPress={() => { store.move(moving.id, folder.id); setMoving(null); }} /></View>)}</ScrollView><Button label="Cancel" onPress={() => setMoving(null)} /></>, () => setMoving(null))}
    {editing && sheet(<><Text style={{ color: colors.font, fontSize: 18 }}>{editing.id ? 'Rename folder' : 'New folder'}</Text><TextInput accessibilityLabel="Folder name" returnKeyType="done" onSubmitEditing={saveFolder} autoFocus maxLength={80} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} style={[ui.input, { color: colors.font, borderColor: colors.border }]} /><Button label="Save folder" disabled={!editing.name.trim()} onPress={saveFolder} /><Button label="Cancel" onPress={() => setEditing(null)} /></>, () => setEditing(null))}
  </View>;
}
