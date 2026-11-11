import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { Workspace } from './model';
import { backupFilename, serializeWorkspaceBackup } from './backupData';

// Create the file before displaying a share sheet. Dismissing Share does not
// remove the on-device backup, which remains in Bestpad's Documents folder.
export async function saveWorkspaceBackup(workspace: Workspace): Promise<string> {
  const now = new Date();
  const json = serializeWorkspaceBackup(workspace, now);
  const file = new File(Paths.document, backupFilename(now));
  file.create();
  await file.write(json);
  if (Platform.OS === 'ios') {
    // React Native's Share API accepts a local file URL on iOS.
    await Share.share({ url: file.uri, title: 'Bestpad notes backup' }).catch(() => undefined);
  } else {
    // Android uses the system file preview when an app can open JSON.
    // Fallback shares the backup data as text without changing the saved file.
    try {
      await file.preview({ title: 'Bestpad notes backup', mimeType: 'application/json' });
    } catch {
      await Share.share({ message: json, title: 'Bestpad notes backup' }).catch(() => undefined);
    }
  }
  return file.uri;
}
