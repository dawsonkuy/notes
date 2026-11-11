import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { Workspace } from './model';
import { backupFilename, serializeWorkspaceBackup } from './backupData';

// Create the file before displaying a share sheet. Dismissing Share does not
// remove the on-device backup, which remains in Bestpad's Documents folder.
export async function saveWorkspaceBackup(workspace: Workspace, requireExternalCopy = false): Promise<string> {
  const now = new Date();
  const json = serializeWorkspaceBackup(workspace, now);
  const file = new File(Paths.document, backupFilename(now));
  file.create();
  await file.write(json);
  let shared = false;
  if (Platform.OS === 'ios') {
    // React Native's Share API accepts a local file URL on iOS.
    // Require a completed share before destructive conflict recovery.
    try {
      const result = await Share.share({ url: file.uri, title: 'Bestpad notes backup' });
      shared = result.action === Share.sharedAction;
    } catch (error) {
      if (requireExternalCopy) throw error;
    }
  } else {
    // Android can share the full JSON as text. The file stays on device too.
    try {
      const result = await Share.share({ message: json, title: 'Bestpad notes backup' });
      shared = result.action === Share.sharedAction;
    } catch (error) {
      if (requireExternalCopy) throw error;
    }
  }
  if (requireExternalCopy && !shared) {
    throw new Error('Save the backup through the share sheet before replacing local notes. Nothing was replaced.');
  }
  return file.uri;
}
