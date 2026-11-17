import { validWorkspace, type Note, type Folder, type Workspace } from './model';
export type BackupPayload = { format: 'bestpad-workspace-backup'; version: 1; exportedAt: string; workspace: Workspace };
export function makeBackupPayload(workspace: Workspace, date = new Date()): BackupPayload {
  if (!validWorkspace(workspace)) throw new Error('Notes cannot be exported because the workspace is invalid.');
  return { format: 'bestpad-workspace-backup', version: 1, exportedAt: date.toISOString(), workspace };
}
export function backupFilename(date = new Date()): string {
  return `bestpad-notes-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}
export function serializeWorkspaceBackup(workspace: Workspace, date = new Date()): string {
  return JSON.stringify(makeBackupPayload(workspace, date), null, 2);
}

export function parseWorkspaceBackup(raw: string): Workspace {
  if (raw.length > 12_000_000) throw new Error('Backup is too large to import safely.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  const backup = parsed as Partial<BackupPayload> | null;
  if (!backup || backup.format !== 'bestpad-workspace-backup' || backup.version !== 1 || !validWorkspace(backup.workspace)) {
    throw new Error('Select a valid BestPad JSON backup created with Export JSON backup.');
  }
  if (backup.workspace.tabs.length > 10000 || (backup.workspace.folders?.length || 0) > 2000) throw new Error('Backup contains too many items.');
  return backup.workspace;
}
export type ImportResult = { workspace: Workspace; added: number; skipped: number; foldersAdded: number };
export function mergeWorkspaceNotes(current: Workspace, imported: Workspace, newId: () => string): ImportResult {
  if (!validWorkspace(current) || !validWorkspace(imported)) throw new Error('Unable to merge invalid notes.');
  const existingNotes = new Set(current.tabs.map(note => note.id));
  const existingFolders = new Set((current.folders || []).map(folder => folder.id));
  const importedFolders = imported.folders || [];

  // An exported backup is an explicit request to restore notes, including
  // untitled/empty ones. Only an existing note ID counts as a duplicate.
  // Protected note IDs must stay unchanged: encryption binds to the note ID.
  const notes: Note[] = imported.tabs
    .filter(note => !existingNotes.has(note.id))
    .map(note => ({ ...note }));
  const skipped = imported.tabs.length - notes.length;

  // A repeat import must reuse folders that already have the same ID. The
  // previous implementation remapped them on every import and created duplicates.
  // Remap only if a folder's ID collides with a note ID.
  const folderIdMap = new Map<string, string>();
  const reservedIds = new Set([
    ...existingFolders, ...existingNotes,
    ...importedFolders.map(folder => folder.id), ...imported.tabs.map(note => note.id),
  ]);
  const folders: Folder[] = [];
  for (const folder of importedFolders) {
    if (existingFolders.has(folder.id)) {
      folderIdMap.set(folder.id, folder.id);
      continue;
    }
    let id = folder.id;
    if (existingNotes.has(id)) {
      id = newId();
      while (reservedIds.has(id)) id = newId();
      reservedIds.add(id);
    }
    folderIdMap.set(folder.id, id);
  }
  for (const folder of importedFolders) {
    if (existingFolders.has(folder.id)) continue;
    folders.push({
      ...folder,
      id: folderIdMap.get(folder.id)!,
      parentId: folder.parentId
        ? folderIdMap.get(folder.parentId) || (existingFolders.has(folder.parentId) ? folder.parentId : null)
        : null,
    });
  }
  const mappedNotes = notes.map(note => ({
    ...note,
    folderId: note.folderId
      ? folderIdMap.get(note.folderId) || (existingFolders.has(note.folderId) ? note.folderId : null)
      : null,
  }));

  if (!mappedNotes.length && !folders.length) {
    return { workspace: current, added: 0, skipped, foldersAdded: 0 };
  }
  // Keep the original workspace and active editor untouched.
  return {
    workspace: {
      ...current,
      folders: [...(current.folders || []), ...folders],
      tabs: [...current.tabs, ...mappedNotes],
    },
    added: mappedNotes.length, skipped, foldersAdded: folders.length,
  };
}
