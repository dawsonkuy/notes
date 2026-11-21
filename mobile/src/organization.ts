import { noteName, isTrashed, type Workspace, type Note, type Folder } from './model';
export type Entry = { id: string; kind: 'note' | 'folder'; name: string; order: number; pinned: boolean };
export function entries(workspace: Workspace, parentId: string | null): Entry[] {
  // Legacy, imported, or partially synced folder references must not make notes
  // disappear from the library. Show orphaned items at the root, preserving data.
  const folders = workspace.folders || [], folderIds = new Set(folders.map(folder => folder.id));
  const visibleParent = (id?: string | null) => id && folderIds.has(id) ? id : null;
  return [
    ...folders.filter(folder => visibleParent(folder.parentId) === parentId).map(folder => ({ id: folder.id, kind: 'folder' as const, name: folder.name, order: Number(folder.order) || 0, pinned: Boolean(folder.pinned) })),
    ...workspace.tabs.filter(note => !isTrashed(note) && visibleParent(note.folderId) === parentId).map(note => ({ id: note.id, kind: 'note' as const, name: noteName(note), order: Number(note.order) || 0, pinned: Boolean(note.pinned) })),
  ].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
}
export function canMove(workspace: Workspace, id: string, parentId: string | null) {
  if (!parentId) return true;
  const folders = workspace.folders || []; let current = folders.find(folder => folder.id === parentId); const visited = new Set<string>();
  if (!current) return false;
  while (current) { if (current.id === id || visited.has(current.id)) return false; visited.add(current.id); current = folders.find(folder => folder.id === current!.parentId); }
  return true;
}
export function moveEntry(workspace: Workspace, id: string, parentId: string | null, beforeId?: string): Workspace {
  if (beforeId === id) return workspace;
  if (!workspace.tabs.some(note => note.id === id && !isTrashed(note)) && !workspace.folders?.some(folder => folder.id === id)) return workspace;
  if (!canMove(workspace, id, parentId)) return workspace;
  const siblings = entries(workspace, parentId).filter(entry => entry.id !== id); const at = beforeId ? siblings.findIndex(entry => entry.id === beforeId) : -1;
  const ids = siblings.map(entry => entry.id); ids.splice(at < 0 ? ids.length : at, 0, id);
  const order = (entryId: string) => ids.indexOf(entryId);
  const tabs = workspace.tabs.map(note => note.id === id ? { ...note, folderId: parentId, order: order(id) } : order(note.id) >= 0 ? { ...note, order: order(note.id) } : note);
  const folders = (workspace.folders || []).map(folder => folder.id === id ? { ...folder, parentId, order: order(id) } : order(folder.id) >= 0 ? { ...folder, order: order(folder.id) } : folder);
  return { ...workspace, tabs, folders };
}
export function removeFolder(workspace: Workspace, id: string): Workspace {
  const folder = workspace.folders?.find(item => item.id === id); if (!folder) return workspace;
  return { ...workspace, folders: workspace.folders!.filter(item => item.id !== id).map(item => item.parentId === id ? { ...item, parentId: folder.parentId || null } : item), tabs: workspace.tabs.map(note => note.folderId === id ? { ...note, folderId: folder.parentId || null } : note) };
}
export type { Note, Folder };

export type TreeEntry = Entry & { depth: number; parentId: string | null };
export function treeEntries(workspace: Workspace, expanded: ReadonlySet<string>): TreeEntry[] {
  const result: TreeEntry[] = [], visited = new Set<string>();
  function walk(parentId: string | null, depth: number) {
    for (const item of entries(workspace, parentId)) {
      if (visited.has(item.id)) continue;
      visited.add(item.id); result.push({ ...item, depth, parentId });
      if (item.kind === 'folder' && expanded.has(item.id)) walk(item.id, depth + 1);
    }
  }
  walk(null, 0);
  // Malformed folder cycles can hide entire subtrees. Surface their first folder
  // at the top level, then let the user open it and move its contents normally.
  for (const folder of workspace.folders || []) {
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    result.push({ id: folder.id, kind: 'folder', name: folder.name, order: Number(folder.order) || 0,
      pinned: Boolean(folder.pinned), depth: 0, parentId: null });
    if (expanded.has(folder.id)) walk(folder.id, 1);
  }
  return result;
}
