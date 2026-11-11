import { createBrowserSupabase } from "@/lib/supabase-browser";

/** Where one photo goes: a signed upload URL the server made for it. */
export interface PhotoTarget {
  path: string;
  token: string;
}

/** Browsers often do not know the type of HEIC files. Storage needs one. */
export function contentType(file: File): string {
  if (file.type) return file.type;
  return /\.hei[cf]$/i.test(file.name) ? "image/heic" : "image/jpeg";
}

/**
 * Uploads each photo to its target (`targets[i]` for `files[i]`) straight from the
 * browser to Storage, three at a time: fast, without choking a phone's connection with a
 * whole gallery. `onProgress` gets the number done after each one. A failed upload
 * throws, its photo named by `label` ("Foto 3", or the file's name).
 */
export async function uploadPhotos(
  targets: PhotoTarget[],
  files: File[],
  onProgress: (done: number) => void,
  label: (file: File, at: number) => string,
): Promise<void> {
  const bucket = createBrowserSupabase().storage.from("recipe-photos");
  let next = 0;
  let count = 0;
  const worker = async () => {
    while (next < files.length) {
      const at = next++;
      const target = targets[at];
      const file = files[at];
      const result = await bucket.uploadToSignedUrl(target.path, target.token, file, {
        contentType: contentType(file),
      });
      if (result.error) throw new Error(`${label(file, at)}: ${result.error.message}`);
      onProgress(++count);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
