import { searchKey } from "./filter";

/**
 * Where a recipe comes from: a cookbook, or one edition of a magazine that is a stack of
 * them ("Einfach Hausgemacht", edition "06/2020" or "Jahresheft 2021"). The household types
 * it as one name, as it is printed on the cover; the app finds the stack and the edition in
 * it, so that every edition of a magazine is one entry of the library.
 */

export interface Source {
  /** The cookbook or the magazine. Empty for none. */
  book: string;
  /** The edition of a magazine. Null for a cookbook. */
  edition: string | null;
}

/** A source the library has, with the editions it has of it. */
export interface KnownSource {
  book: string;
  editions: readonly string[];
}

/** Words an edition starts with: "Jahresheft 2021", "Heft 3", "Ausgabe 5/2024". */
const EDITION_WORD = "(?:ausgabe|heft|nr\\.?|nummer|jahresheft|sonderheft|sonderausgabe|special)";
/** An issue as month and year: "06/2020", "5-24", "05.2026". */
const ISSUE = /^(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/;
/** An edition at the end of a name, after the magazine's own name. */
const TRAILING_EDITION = new RegExp(
  `^(.+?)[\\s,–-]+(${EDITION_WORD}\\s*\\S+(?:\\s+\\d{4})?|\\d{1,2}\\s*[/.-]\\s*(?:\\d{4}|\\d{2}))$`,
  "i",
);

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/** The initials of a name: "EH" for "Einfach Hausgemacht". */
function initials(book: string): string {
  return book
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/**
 * An edition as the app writes it. An issue is month and year in full ("05/26" is
 * "05/2026"), so that "6/2020" and "06/2020" are one edition. The magazine's initials in
 * front of a folder's name are left out: "EH 05/26" in "Einfach Hausgemacht" is "05/2026".
 */
export function editionName(text: string, book = ""): string {
  let name = tidy(text).replace(/^[,:–-]\s*/, "");
  const short = initials(book);
  if (short.length >= 2 && name.toUpperCase().startsWith(`${short} `)) {
    name = name.slice(short.length + 1);
  }
  const issue = ISSUE.exec(name);
  if (issue) {
    const year = issue[2].length === 2 ? `20${issue[2]}` : issue[2];
    return `${issue[1].padStart(2, "0")}/${year}`;
  }
  return name;
}

/** The edition there is under another spelling, or the new one as written. */
function sameEdition(name: string, editions: readonly string[]): string {
  return editions.find((edition) => searchKey(edition) === searchKey(name)) ?? name;
}

/**
 * The stack and the edition a typed name means. A name that starts with a source there is,
 * or with its initials, is that source, and the rest is an edition of it. Otherwise an
 * edition at its end ("06/2020", "Jahresheft 2021") makes the rest a new stack. Anything
 * else is a cookbook of that name.
 */
export function splitSource(text: string, known: readonly KnownSource[]): Source {
  const name = tidy(text);
  if (name === "") return { book: "", edition: null };
  const lower = name.toLowerCase();
  const prefixes = known.flatMap((source) => [
    { source, prefix: source.book },
    ...(initials(source.book).length >= 2 && source.editions.length > 0
      ? [{ source, prefix: initials(source.book) }]
      : []),
  ]);
  const found = prefixes
    .filter(({ prefix }) => {
      const start = prefix.toLowerCase();
      return lower === start || lower.startsWith(`${start} `) || lower.startsWith(`${start},`);
    })
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (found) {
    const rest = name.slice(found.prefix.length);
    const edition = editionName(rest, found.source.book);
    return {
      book: found.source.book,
      edition: edition === "" ? null : sameEdition(edition, found.source.editions),
    };
  }
  const trailing = TRAILING_EDITION.exec(name);
  if (trailing) {
    return { book: tidy(trailing[1]), edition: editionName(trailing[2], trailing[1]) };
  }
  return { book: name, edition: null };
}

/**
 * The edition a batch's folder stands for, in the stack typed above it. A folder named like
 * the stack, or a cookbook's folder, is none.
 */
export function editionFromFolder(
  folder: string,
  typed: string,
  known: readonly KnownSource[],
): Source {
  const source = splitSource(typed, known);
  const fromFolder = splitSource(folder, known);
  if (source.book === "") return fromFolder;
  if (searchKey(fromFolder.book) === searchKey(source.book)) {
    return { book: source.book, edition: fromFolder.edition ?? source.edition };
  }
  const stack = known.find((entry) => searchKey(entry.book) === searchKey(source.book));
  const looksLikeEdition =
    fromFolder.edition !== null ||
    ISSUE.test(editionName(folder, source.book)) ||
    new RegExp(`^${EDITION_WORD}\\b`, "i").test(tidy(folder));
  if ((stack && stack.editions.length > 0) || looksLikeEdition) {
    return {
      book: source.book,
      edition: sameEdition(editionName(folder, source.book), stack?.editions ?? []),
    };
  }
  return source;
}

/** A source as one name: "Einfach Hausgemacht 06/2020", or the cookbook's name. */
export function sourceLabel(book: string | null, edition: string | null): string {
  if (!book) return edition ?? "";
  return edition ? `${book} ${edition}` : book;
}

/** What is known of a source before something goes into it, to say so on the form. */
export type Placement =
  | { kind: "none" }
  | { kind: "book"; book: string; known: boolean }
  | { kind: "edition"; book: string; edition: string; bookKnown: boolean; editionKnown: boolean };

/** Where a typed name puts a recipe: into which stack and edition, and which are new. */
export function placement(source: Source, known: readonly KnownSource[]): Placement {
  if (source.book === "") return { kind: "none" };
  const stack = known.find((entry) => searchKey(entry.book) === searchKey(source.book));
  if (source.edition === null) return { kind: "book", book: source.book, known: Boolean(stack) };
  return {
    kind: "edition",
    book: source.book,
    edition: source.edition,
    bookKnown: Boolean(stack),
    editionKnown: Boolean(
      stack?.editions.some((edition) => searchKey(edition) === searchKey(source.edition ?? "")),
    ),
  };
}

/** The sources of a library: every book once, with its editions in order. */
export function knownSources(
  rows: readonly { book: string | null; edition: string | null }[],
): KnownSource[] {
  const editions = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.book) continue;
    const set = editions.get(row.book) ?? new Set<string>();
    if (row.edition) set.add(row.edition);
    editions.set(row.book, set);
  }
  return [...editions]
    .map(([book, set]) => ({ book, editions: [...set].sort(byEdition) }))
    .sort((a, b) => a.book.localeCompare(b.book, "de"));
}

/** Editions in the order they appeared: issues by year and month, then the rest by name. */
export function byEdition(a: string, b: string): number {
  const issue = (name: string) => {
    const match = /^(\d{2})\/(\d{4})$/.exec(name);
    return match ? Number(match[2]) * 100 + Number(match[1]) : null;
  };
  const year = (name: string) => Number(/\b(\d{4})\b/.exec(name)?.[1] ?? 0) * 100;
  const left = issue(a) ?? year(a);
  const right = issue(b) ?? year(b);
  return left - right || a.localeCompare(b, "de", { numeric: true });
}
