"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { startBatch } from "@/app/(app)/import/actions";
import { sourceLabel, type KnownSource } from "@/domain/library/source";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { CameraIcon, CloseIcon, NoteIcon, PenIcon, PhotosIcon, PlusIcon, TickIcon } from "./icons";
import { SourcePlacement } from "./source-placement";

/** The meal of the week plan the recipe is for, when it was added from there. */
export interface AddForMeal {
  date: string;
  meal: string;
  /** The week's Monday, for the way back. */
  week: string;
  /** "Donnerstag Abend". */
  when: string;
}

interface Photo {
  file: File;
  url: string;
}

/** Browsers often do not know the type of HEIC files. Storage needs one. */
function contentType(file: File): string {
  if (file.type) return file.type;
  return /\.hei[cf]$/i.test(file.name) ? "image/heic" : "image/jpeg";
}

/**
 * Adding recipes: photos of pages, pasted text, or typed in. "Foto aufnehmen" opens the
 * camera itself (`capture`), "Fotos wählen" the gallery for many at once; the photo, any further page, and the cookbook or the
 * magazine with its edition, and "Fertig" uploads them and has the server read them
 * (`/api/import/[batchId]/run`). The phone can be put away then. A recipe read without
 * doubts goes into the library, and onto its meal when it was added from one; anything
 * unclear waits under Import → Prüfen.
 */
export function AddRecipe({
  sources,
  forMeal,
  textHref,
  typeHref,
}: {
  sources: KnownSource[];
  forMeal: AddForMeal | null;
  textHref: string;
  typeHref: string;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [book, setBook] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const kept = useRef<Photo[]>([]);
  useEffect(() => {
    kept.current = photos;
  }, [photos]);

  // The previews are the browser's until the page goes.
  useEffect(() => () => kept.current.forEach((photo) => URL.revokeObjectURL(photo.url)), []);

  function add(list: FileList | null) {
    const files = Array.from(list ?? []).filter(
      (file) => file.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name),
    );
    if (files.length === 0) return;
    setError(null);
    setPhotos((before) => [
      ...before,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }

  function remove(at: number) {
    setPhotos((before) => {
      URL.revokeObjectURL(before[at].url);
      return before.filter((_, index) => index !== at);
    });
  }

  async function finish() {
    setError(null);
    setSent(0);
    try {
      const started = await startBatch(
        book,
        photos.map((photo, index) => photo.file.name || `seite-${index + 1}.jpg`),
        forMeal && { date: forMeal.date, meal: forMeal.meal },
      );
      if ("error" in started) throw new Error(started.error);
      const bucket = createBrowserSupabase().storage.from("recipe-photos");
      let next = 0;
      let count = 0;
      // Three at a time: fast, without choking a phone's connection with a whole gallery.
      const worker = async () => {
        while (next < photos.length) {
          const at = next++;
          const target = started.targets[at];
          const photo = photos[at].file;
          const result = await bucket.uploadToSignedUrl(target.path, target.token, photo, {
            contentType: contentType(photo),
          });
          if (result.error) throw new Error(`Foto ${at + 1}: ${result.error.message}`);
          setSent(++count);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      // Read on the server from here on: the answer comes at once, the reading after it.
      const run = await fetch(`/api/import/${started.batchId}/run`, {
        method: "POST",
        keepalive: true,
      });
      if (!run.ok) throw new Error(`Einlesen: ${run.status}`);
      setBatchId(started.batchId);
    } catch (cause) {
      setSent(null);
      setError(`Das hat nicht geklappt. ${(cause as Error).message}`);
    }
  }

  const many = photos.length > 1;
  if (batchId) {
    return (
      <div className="card mt-5 p-5" role="status">
        <span className="badge kind-vegetarian h-11 w-11 text-(--kind-ink)">
          <TickIcon />
        </span>
        <h2 className="mt-3 text-xl font-bold tracking-tight">
          {many
            ? `Fertig. ${photos.length} Fotos werden eingelesen.`
            : "Fertig. Das Rezept wird eingelesen."}
        </h2>
        <p className="mt-2 text-muted">
          {forMeal
            ? `Sobald es gelesen ist, steht es im Wochenplan am ${forMeal.when}. `
            : many
              ? "Was sicher gelesen ist, steht nach und nach bei den Rezepten. Du kannst das Handy weglegen. "
              : "Sobald es gelesen ist, steht es bei den Rezepten. "}
          Ist etwas unklar, findest du es unter Import → Prüfen.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {forMeal ? (
            <Link href={`/woche?w=${forMeal.week}#tag-${forMeal.date}`} className="btn btn-primary">
              Zum Wochenplan
            </Link>
          ) : (
            <Link href="/rezepte/hinzufuegen" className="btn btn-primary">
              Noch ein Rezept
            </Link>
          )}
          <Link href={`/import/${batchId}`} className="btn">
            Einlesen ansehen
          </Link>
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label className="card lift flex cursor-pointer flex-col gap-2 p-4">
          <Badge>
            <CameraIcon />
          </Badge>
          <span className="text-lg leading-tight font-semibold">Foto aufnehmen</span>
          <span className="text-sm text-muted">Die Seite im Kochbuch oder Heft.</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Foto aufnehmen"
            onChange={(event) => add(event.target.files)}
          />
        </label>
        <label className="card lift flex cursor-pointer flex-col gap-2 p-4">
          <Badge>
            <PhotosIcon />
          </Badge>
          <span className="text-lg leading-tight font-semibold">Fotos wählen</span>
          <span className="text-sm text-muted">Aus der Mediathek, gern viele auf einmal.</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            aria-label="Fotos wählen"
            onChange={(event) => add(event.target.files)}
          />
        </label>
        <Link href={textHref} className="card lift flex flex-col gap-2 p-4">
          <Badge>
            <NoteIcon />
          </Badge>
          <span className="text-lg leading-tight font-semibold">Text einfügen</span>
          <span className="text-sm text-muted">Von einer Webseite oder aus einer Nachricht.</span>
        </Link>
        <Link href={typeHref} className="card lift flex flex-col gap-2 p-4">
          <Badge>
            <PenIcon />
          </Badge>
          <span className="text-lg leading-tight font-semibold">Eintippen</span>
          <span className="text-sm text-muted">Zutaten Zeile für Zeile.</span>
        </Link>
      </div>
    );
  }

  const busy = sent !== null;
  return (
    <div className="mt-5 space-y-5">
      <section aria-label="Fotos">
        <p className="font-semibold">
          {photos.length === 1 ? "1 Foto" : `${photos.length} Fotos`}, in dieser Reihenfolge
        </p>
        <p className="text-sm text-muted">
          Ein Rezept über zwei Seiten wird zusammengesetzt, mehrere Rezepte werden einzeln gelesen.
        </p>
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, at) => (
            <li key={photo.url} className="relative">
              {/* A preview of what the camera took: a picture of the browser's own, no route. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`Seite ${at + 1}`}
                className="aspect-[3/4] w-full rounded-lg border border-line object-cover"
              />
              {!busy && (
                <button
                  type="button"
                  onClick={() => remove(at)}
                  className="icon-button absolute top-1 right-1 bg-surface/85 text-ink"
                  aria-label={`Seite ${at + 1} entfernen`}
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          ))}
          {!busy && (
            <li>
              <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-center text-sm font-semibold text-accent">
                <PlusIcon />
                Foto aufnehmen
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label="Weitere Seite fotografieren"
                  onChange={(event) => add(event.target.files)}
                />
              </label>
            </li>
          )}
          {!busy && (
            <li>
              <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-center text-sm font-semibold text-accent">
                <PhotosIcon />
                Aus Fotos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  aria-label="Weitere Fotos wählen"
                  onChange={(event) => add(event.target.files)}
                />
              </label>
            </li>
          )}
        </ul>
      </section>

      <div>
        <label className="label" htmlFor="add-book">
          Kochbuch oder Heft
        </label>
        <input
          className="field"
          id="add-book"
          list="add-known-books"
          value={book}
          onChange={(event) => setBook(event.target.value)}
          placeholder="z. B. Speed Cooking oder Einfach Hausgemacht 06/2020"
          autoComplete="off"
          disabled={busy}
        />
        <datalist id="add-known-books">
          {sources.flatMap((source) =>
            [source.book, ...source.editions.map((e) => sourceLabel(source.book, e))].map(
              (name) => <option key={name} value={name} />,
            ),
          )}
        </datalist>
        {book.trim() ? (
          <SourcePlacement text={book} sources={sources} />
        ) : (
          <p className="mt-1 text-sm text-muted">
            Ein Heft mit seiner Ausgabe: „Einfach Hausgemacht 06/2020“.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
          {error}
        </p>
      )}

      {/* Above the sections at the foot of a phone's screen, where a thumb finds it. */}
      <div className="add-recipe-done">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || !book.trim()}
          onClick={finish}
        >
          {busy
            ? `Lädt hoch … ${sent} von ${photos.length}`
            : book.trim()
              ? "Fertig"
              : "Kochbuch oder Heft angeben"}
        </button>
        {!busy && (
          <button
            type="button"
            className="link mx-auto mt-1 flex min-h-11 items-center"
            onClick={() => {
              photos.forEach((photo) => URL.revokeObjectURL(photo.url));
              setPhotos([]);
            }}
          >
            Verwerfen
          </button>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="badge kind-vegetarian h-11 w-11 text-(--kind-ink)">{children}</span>;
}
