import { placement, splitSource, type KnownSource } from "@/domain/library/source";

/**
 * Where the photos of this batch will go, said before they are sent: the magazine and the
 * edition the typed name was found in, and which of them are new.
 */
export function SourcePlacement({ text, sources }: { text: string; sources: KnownSource[] }) {
  const where = placement(splitSource(text, sources), sources);
  if (where.kind === "none" || (where.kind === "book" && where.known)) {
    return <p className="mt-1 text-sm text-muted">Gilt für alle Fotos dieses Stapels.</p>;
  }
  if (where.kind === "book") {
    return <p className="mt-1 text-sm text-muted">Neues Kochbuch „{where.book}“.</p>;
  }
  return (
    <p className="mt-1 text-sm text-muted" aria-live="polite">
      {where.bookKnown ? "Kommt zu" : "Neuer Stapel"} „{where.book}“, Ausgabe „{where.edition}“
      {where.editionKnown ? "." : " (neu)."}
    </p>
  );
}
