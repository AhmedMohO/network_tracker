import { getLastUpdateTimeAsync } from 'expo-application';
import { File, Paths } from 'expo-file-system';

export async function removeInstalledApk(): Promise<void> {
  const file = new File(Paths.cache, 'update.apk');
  if (!file.exists) return;
  const modified = file.info().modificationTime;
  const installed = await getLastUpdateTimeAsync();
  // Keep pending installers: Android may still need to read the shared file.
  if (modified != null && modified < installed.getTime()) file.delete();
}
