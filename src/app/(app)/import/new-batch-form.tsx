"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SourcePlacement } from "@/components/source-placement";
import { editionFromFolder, sourceLabel, type KnownSource } from "@/domain/library/source";
import { uploadPhotos } from "@/lib/upload-photos";
import { startBatch } from "./actions";

const PHOTO = /\.(heic|heif|jpe?g|png|webp)$/i;

/** Photos in the order they were taken: phones number them, so the file name sorts them. */
function inPageOrder(files: File[]): File[] {
  return [...files]
    .filter((file) => file.type.startsWith("image/") || PHOTO.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function NewBatchForm({
  sources,
  forMeal = null,
}: {
  /** The cookbooks and magazines there are, with their editions. */
  sources: KnownSource[];
  /** The meal of the week plan the upload is for: the recipe read from it is planned there. */
  forMeal?: { date: string; meal: string } | null;
}) {
  const router = useRouter();
  const [book, setBook] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function choose(list: FileList | null) {
    const chosen = inPageOrder(Array.from(list ?? []));
    setFiles(chosen);
    setError(chosen.length === 0 && list?.length ? "In der Auswahl sind keine Fotos." : null);
    // A folder named after the cookbook saves typing the name. In a magazine's stack, typed
    // above it or named in it, the folder is the edition: "EH 05-26".
    const folder = chosen[0]?.webkitRelativePath.split("/")[0];
    if (folder) {
      const found = editionFromFolder(folder, book, sources);
      setBook(sourceLabel(found.book, found.edition));
    }
  }

  async function upload() {
    setError(null);
    setUploaded(0);
    try {
      const started = await startBatch(
        book,
        files.map((file) => file.name),
        forMeal,
      );
      if ("error" in started) throw new Error(started.error);
      await uploadPhotos(started.targets, files, setUploaded, (file) => file.name);
      router.push(`/import/${started.batchId}`);
    } catch (cause) {
      setUploaded(null);
      setError(`Das Hochladen hat nicht geklappt. ${(cause as Error).message}`);
    }
  }

  const busy = uploaded !== null;
  return (
    <div className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="book">
          Kochbuch oder Heft
        </label>
        <input
          className="field"
          id="book"
          list="known-books"
          value={book}
          onChange={(event) => setBook(event.target.value)}
          placeholder="z. B. Speed Cooking"
          disabled={busy}
        />
        <datalist id="known-books">
          {sources.flatMap((source) =>
            [source.book, ...source.editions.map((e) => sourceLabel(source.book, e))].map(
              (name) => <option key={name} value={name} />,
            ),
          )}
        </datalist>
        <SourcePlacement text={book} sources={sources} />
      </div>

      <div>
        <span className="label">Fotos der Seiten, in der Reihenfolge des Buchs</span>
        <div className="flex flex-wrap gap-2">
          <label className="btn cursor-pointer">
            Fotos auswählen
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(event) => choose(event.target.files)}
            />
          </label>
          {/* A phone cannot pick a folder: its picker opened and led nowhere. */}
          <button
            type="button"
            className="btn pointer-coarse:hidden"
            disabled={busy}
            onClick={() => folderInput.current?.click()}
          >
            Ganzen Ordner auswählen
          </button>
          <input
            ref={(node) => {
              folderInput.current = node;
              // Not a standard attribute, so React has no prop for it.
              node?.setAttribute("webkitdirectory", "");
            }}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => choose(event.target.files)}
          />
        </div>
        {files.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            {files.length === 1 ? "1 Foto" : `${files.length} Fotos`}: {files[0].name}
            {files.length > 1 && ` bis ${files[files.length - 1].name}`}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={busy || files.length === 0}
        onClick={upload}
      >
        {busy ? `Lade hoch … ${uploaded} von ${files.length}` : "Hochladen und einlesen"}
      </button>
    </div>
  );
}
