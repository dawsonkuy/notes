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
    throw new Error('Select a valid BestPad JSON backup created with Export all.');
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
  const folderIdMap = new Map<string, string>();
  // Folder ID clashes can be remapped because folder IDs are not used as
  // encryption associated data. Protected note IDs cannot be remapped.
  const reservedFolderIds = new Set([...existingFolders, ...importedFolders.map(folder => folder.id)]);
  for (const folder of importedFolders) {
    if (!existingFolders.has(folder.id)) { folderIdMap.set(folder.id, folder.id); continue; }
    let next = newId();
    while (reservedFolderIds.has(next) || existingNotes.has(next)) next = newId();
    reservedFolderIds.add(next);
    folderIdMap.set(folder.id, next);
  }
  const folders: Folder[] = importedFolders.map(folder => ({
    ...folder,
    id: folderIdMap.get(folder.id)!,
    parentId: folder.parentId ? folderIdMap.get(folder.parentId) || null : null,
  }));
  const notes: Note[] = []; let skipped = 0;
  for (const note of imported.tabs) {
    if (existingNotes.has(note.id)) { skipped++; continue; }
    // Empty guest starter notes do not need to be imported.
    if (!note.text && !note.sealed && !note.deletedAt && !note.customName && note.filename === 'Untitled') { skipped++; continue; }
    notes.push({ ...note, folderId: note.folderId ? folderIdMap.get(note.folderId) || null : null });
    existingNotes.add(note.id);
  }
  // Never replace existing note contents or the current editor selection.
  return {
    workspace: { ...current, folders: [...(current.folders || []), ...folders], tabs: [...current.tabs, ...notes] },
    added: notes.length, skipped, foldersAdded: folders.length,
  };
}
