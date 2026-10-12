import "server-only";
import { createAdminClient } from "../supabase/admin";

/**
 * The private photo bucket. It has no storage policies, so the browser can reach a file only
 * through a signed URL that the server hands out after checking who is asking.
 * Every path starts with the household id.
 */
const BUCKET = "recipe-photos";

/** One hour: long enough to work through a review, short enough not to be a public link. */
const VIEW_SECONDS = 60 * 60;

export const originalPath = (
  household: string,
  batch: string,
  position: number,
  fileName: string,
) => `${household}/${batch}/original/${position}-${fileName.replace(/[^A-Za-z0-9._-]/g, "_")}`;

export const pagePhotoPath = (household: string, batch: string, position: number) =>
  `${household}/${batch}/pages/${String(position).padStart(4, "0")}.jpg`;

/** Clean full-size copy of a page photo, kept only until the recipes on it are read. */
export const fullPhotoPath = (household: string, batch: string, position: number) =>
  `${household}/${batch}/full/${String(position).padStart(4, "0")}.jpg`;

/** A one-time URL the browser uploads one photo to, straight into storage. */
export async function createUploadTarget(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new Error(`could not prepare the upload: ${error.message}`);
  return { path: data.path, token: data.token };
}

export async function downloadPhoto(path: string): Promise<Buffer> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(path);
  if (error) throw new Error(`could not read ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function storePhoto(path: string, jpeg: Buffer): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`could not store ${path}: ${error.message}`);
}

export async function removePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await createAdminClient().storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`could not remove photos: ${error.message}`);
}

/** Removes every file below a folder of the bucket. */
export async function removeFolder(prefix: string): Promise<void> {
  const bucket = createAdminClient().storage.from(BUCKET);
  const { data, error } = await bucket.list(prefix, { limit: 1000 });
  if (error) throw new Error(`could not list ${prefix}: ${error.message}`);
  const files: string[] = [];
  for (const entry of data) {
    // An entry without an id is a folder.
    if (entry.id === null) await removeFolder(`${prefix}/${entry.name}`);
    else files.push(`${prefix}/${entry.name}`);
  }
  await removePhotos(files);
}

/** Short-lived links for showing stored photos. Returns them by path. */
export async function viewUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrls(paths, VIEW_SECONDS);
  if (error) throw new Error(`could not create photo links: ${error.message}`);
  return Object.fromEntries(
    data.flatMap((entry) => (entry.path && entry.signedUrl ? [[entry.path, entry.signedUrl]] : [])),
  );
}

export { BUCKET as PHOTO_BUCKET };
