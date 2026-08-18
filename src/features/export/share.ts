import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

/**
 * Writes `content` to the cache and hands it to the Android share sheet.
 *
 * The cache directory is deliberate: the OS reclaims it, and the file only
 * needs to survive long enough for the receiving app to read it. Nothing is
 * uploaded — the share sheet is the user's own choice of destination.
 */
export async function shareExport(
  content: string,
  filename: string,
  mimeType: string
): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device");
  }

  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType });
}
