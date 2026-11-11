import { validWorkspace, type Workspace } from './model';
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
