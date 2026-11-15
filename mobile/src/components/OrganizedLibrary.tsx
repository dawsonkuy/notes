import React, { useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform, PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useBestpad } from '../context';
import { entries, canMove, type Entry } from '../organization';
import { isTrashed, noteName } from '../model';
import { Button, Icon, IconButton, ui } from './ui';
type Props = { folderId: string | null; onFolder: (id: string | null) => void; trash: boolean; bottomSpace: boolean; onOpen: (id: string) => void; onRename: (id: string) => void; onRemove: (id: string) => void; onDelete: (id: string) => void };
export function OrganizedLibrary(props: Props) {
  const { snapshot, store, colors } = useBestpad(); const workspace = snapshot.workspace;
  const data: Entry[] = props.trash ? workspace.tabs.filter(isTrashed).map(note => ({ id: note.id, kind: 'note', name: noteName(note), pinned: false, order: 0 })) : entries(workspace, props.folderId);
  const current = workspace.folders?.find(folder => folder.id === props.folderId);
  const [menu, setMenu] = useState<Entry | null>(null), [moving, setMoving] = useState<Entry | null>(null), [editing, setEditing] = useState<{ id?: string; name: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null), [hover, setHover] = useState<string | null>(null);
  const drag = useRef<string | null>(null), target = useRef<{ parent: string | null; before?: string } | null>(null);
  const rows = useRef<Record<string, React.ComponentRef<typeof View> | null>>({});
  const measured = useRef<Record<string, { y: number; height: number }>>({});
  const list = useRef<React.ComponentRef<typeof FlatList<Entry>>>(null), offset = useRef(0);
  const latest = useRef({ data, props, store });
  React.useEffect(() => { latest.current = { data, props, store }; }, [data, props, store]);
  function measure() { Object.entries(rows.current).forEach(([id, row]) => row?.measureInWindow((_x, y, _w, height) => { measured.current[id] = { y, height }; })); }
  // PanResponder registers these event callbacks; it does not execute them during render.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => Boolean(drag.current),
    onPanResponderMove: (_event, gesture) => {
      measure(); const { data, props } = latest.current;
      const found = Object.entries(measured.current).filter(([id]) => id === '__parent' || data.some(item => item.id === id)).find(([, box]) => gesture.moveY >= box.y && gesture.moveY <= box.y + box.height);
      if (!found) return;
      const [id, box] = found; if (id === drag.current) { target.current = null; setHover(null); return; } const entry = data.find(item => item.id === id);
      if (id === '__parent') target.current = { parent: latest.current.store.getSnapshot().workspace.folders?.find(item => item.id === props.folderId)?.parentId || null };
      else if (entry?.kind === 'folder' && gesture.moveY > box.y + box.height * .25 && gesture.moveY < box.y + box.height * .75) target.current = { parent: id };
      else {
        const index = data.findIndex(item => item.id === id); const before = gesture.moveY > box.y + box.height / 2 ? data[index + 1]?.id : id;
        target.current = { parent: props.folderId, before };
      }
      setHover(id);
      const boxes = Object.values(measured.current); const top = Math.min(...boxes.map(item => item.y)), bottom = Math.min(Dimensions.get('window').height - 90, Math.max(...boxes.map(item => item.y + item.height)));
      if (gesture.moveY < top + 25 || gesture.moveY > bottom - 25) { offset.current = Math.max(0, offset.current + (gesture.moveY < top + 25 ? -14 : 14)); list.current?.scrollToOffset({ offset: offset.current, animated: false }); }
    },
    onPanResponderRelease: () => { if (drag.current && target.current) latest.current.store.move(drag.current, target.current.parent, target.current.before); drag.current = null; target.current = null; setDragId(null); setHover(null); },
    onPanResponderTerminate: () => { drag.current = null; target.current = null; setDragId(null); setHover(null); },
  }), []);
  function startDrag(id: string) { if (props.trash) return; measure(); drag.current = id; setDragId(id); }
  function saveFolder() { if (!editing?.name.trim()) return; if (editing.id) store.renameFolder(editing.id, editing.name); else store.addFolder(editing.name, props.folderId); setEditing(null); }
  const sheet = (content: React.ReactNode, close: () => void) => <Modal transparent animationType="fade" visible onRequestClose={close}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable onPress={close} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' }}><Pressable onPress={() => undefined} style={{ borderRadius: 20, padding: 20, gap: 12, backgroundColor: colors.secondary, maxHeight: '85%' }}>{content}</Pressable></Pressable></KeyboardAvoidingView></Modal>;
  return <View style={{ flex: 1 }} {...responder.panHandlers}>
    {!props.trash && <View ref={value => { rows.current.__parent = value; }} style={{ paddingHorizontal: 24, paddingBottom: 8 }}><View style={[ui.row, { justifyContent: 'space-between' }]}><Pressable accessibilityRole="button" onPress={() => props.onFolder(current?.parentId || null)} style={{ minHeight: 44, justifyContent: 'center', flex: 1 }}><Text style={{ color: colors.font }}>{current ? `‹ ${current.name}` : 'All notes'}</Text></Pressable><IconButton label="New folder" name="folder-open-outline" onPress={() => setEditing({ name: '' })} /></View><Text style={{ color: colors.muted, fontSize: 11 }}>Hold a drag handle to reorder. Drop in the middle of a folder to move inside.</Text></View>}
    <FlatList<Entry> ref={list} data={data} keyExtractor={item => item.id} scrollEnabled={!dragId} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16} contentContainerStyle={{ padding: 24, paddingTop: 12, gap: 12, flexGrow: 1, paddingBottom: props.bottomSpace ? 100 : 32 }} ListEmptyComponent={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}><Icon name={props.trash ? 'trash-outline' : 'folder-open-outline'} size={32} /><Text style={{ color: colors.muted }}>{props.trash ? 'Trash is empty' : 'This folder is empty'}</Text></View>} renderItem={({ item }) => {
      const note = item.kind === 'note' ? workspace.tabs.find(value => value.id === item.id)! : null;
      return <View ref={value => { rows.current[item.id] = value; }} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: hover === item.id ? colors.font : colors.border, opacity: dragId === item.id ? .5 : 1, backgroundColor: colors.secondary }}>
        {!props.trash && <Pressable accessibilityRole="button" accessibilityLabel={`Drag ${item.name}`} accessibilityHint="Hold, then drag to reorder or move into a folder" onLongPress={() => startDrag(item.id)} delayLongPress={250} style={{ minWidth: 40, minHeight: 64, justifyContent: 'center', alignItems: 'center' }}><Icon name="reorder-three-outline" size={20} color={colors.muted} /></Pressable>}
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.kind === 'folder' ? 'Open folder' : props.trash ? 'Restore' : 'Open'} ${item.name}`} onPress={() => item.kind === 'folder' ? props.onFolder(item.id) : props.trash ? store.restore(item.id) : props.onOpen(item.id)} style={{ flex: 1, padding: 16, paddingLeft: props.trash ? 16 : 2 }}><View style={ui.row}>{item.kind === 'folder' && <Icon name="folder-outline" />}{item.pinned && <Icon name="pin" size={15} />}{note?.sealed && <Icon name="lock-closed-outline" size={15} />}<Text numberOfLines={1} style={{ flex: 1, color: colors.font, fontWeight: '600', fontSize: 16 }}>{item.name}</Text></View>{note && <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{note.sealed ? 'Password protected' : note.text.trim() || 'Empty note'}</Text>}</Pressable>
        {props.trash ? <View><IconButton label={`Restore ${item.name}`} name="arrow-undo-outline" onPress={() => store.restore(item.id)} /><IconButton label={`Permanently delete ${item.name}`} name="trash-outline" onPress={() => props.onDelete(item.id)} /></View> : <IconButton label={`Options for ${item.name}`} name="ellipsis-horizontal" onPress={() => setMenu(item)} />}
      </View>;
    }} />
    {menu && sheet(<><Text style={{ color: colors.font, fontSize: 18, fontWeight: '600' }}>{menu.name}</Text>{menu.kind === 'note' && <Button label={menu.pinned ? 'Unpin note' : 'Pin note'} onPress={() => { store.pin(menu.id); setMenu(null); }} />}<Button label="Rename" onPress={() => { if (menu.kind === 'folder') setEditing({ id: menu.id, name: menu.name }); else if (workspace.tabs.find(note => note.id === menu.id)?.sealed) Alert.alert('Protected note', 'Remove password protection in the editor before renaming.'); else props.onRename(menu.id); setMenu(null); }} /><Button label="Move…" onPress={() => { setMoving(menu); setMenu(null); }} /><View style={ui.row}><View style={{ flex: 1 }}><Button label="Move up" onPress={() => { const siblings = data.filter(item => item.pinned === menu.pinned), index = siblings.findIndex(item => item.id === menu.id); if (index > 0) store.move(menu.id, props.folderId, siblings[index - 1].id); setMenu(null); }} /></View><View style={{ flex: 1 }}><Button label="Move down" onPress={() => { const siblings = data.filter(item => item.pinned === menu.pinned), index = siblings.findIndex(item => item.id === menu.id); if (index >= 0 && index < siblings.length - 1) store.move(menu.id, props.folderId, siblings[index + 2]?.id); setMenu(null); }} /></View></View><Button label={menu.kind === 'folder' ? 'Delete folder' : 'Move to Trash'} onPress={() => { if (menu.kind === 'folder') Alert.alert('Delete folder?', 'Notes and subfolders will move to the parent folder.', [{ text: 'Cancel' }, { text: 'Delete folder', onPress: () => store.removeFolder(menu.id) }]); else props.onRemove(menu.id); setMenu(null); }} /><Button label="Cancel" onPress={() => setMenu(null)} /></>, () => setMenu(null))}
    {moving && sheet(<><Text style={{ color: colors.font, fontSize: 18 }}>Move to folder</Text><ScrollView><Button label="All notes" onPress={() => { store.move(moving.id, null); setMoving(null); }} />{(workspace.folders || []).filter(folder => canMove(workspace, moving.id, folder.id)).map(folder => <View key={folder.id} style={{ marginTop: 8 }}><Button label={folder.name} onPress={() => { store.move(moving.id, folder.id); setMoving(null); }} /></View>)}</ScrollView><Button label="Cancel" onPress={() => setMoving(null)} /></>, () => setMoving(null))}
    {editing && sheet(<><Text style={{ color: colors.font, fontSize: 18 }}>{editing.id ? 'Rename folder' : 'New folder'}</Text><TextInput accessibilityLabel="Folder name" returnKeyType="done" onSubmitEditing={saveFolder} autoFocus maxLength={80} value={editing.name} onChangeText={name => setEditing({ ...editing, name })} style={[ui.input, { color: colors.font, borderColor: colors.border }]} /><Button label="Save folder" disabled={!editing.name.trim()} onPress={saveFolder} /><Button label="Cancel" onPress={() => setEditing(null)} /></>, () => setEditing(null))}
  </View>;
}
