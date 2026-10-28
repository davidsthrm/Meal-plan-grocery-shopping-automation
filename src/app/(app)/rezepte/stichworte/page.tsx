import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import {
  CATEGORY_GROUP,
  checkMove,
  checkRename,
  isOwnTag,
  MOVABLE_GROUPS,
  planMerge,
  TAG_NAME_MAX,
  type StoredTag,
} from "@/domain/library/tag-admin";
import { TAG_GROUPS } from "@/domain/library/tags";
import { requireHousehold } from "@/server/auth";
import type { Db } from "@/server/catalog";
import { loadLibrary } from "@/server/library";
import { createSessionClient } from "@/server/supabase/server";
import { loadStoredTags, loadTagLinks } from "@/server/tags";
import { deleteTagAction, mergeTagAction, moveTagAction, renameTagAction } from "./actions";

export const metadata: Metadata = { title: "Stichworte" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Every tag by its group with the number of recipes behind it, to look after the tags
 * themselves: rename any, and merge, move or delete the household's own. The categories
 * stand last; they are renamed only. One tag at a time is open to be changed.
 */
export default async function TagsPage(props: PageProps<"/rezepte/stichworte">) {
  const params = await props.searchParams;
  await requireHousehold();
  const db = await createSessionClient();
  const [tags, library] = await Promise.all([loadStoredTags(db), loadLibrary(db)]);
  const ref = (tag: StoredTag) => tag.key ?? tag.id;
  const count = (tag: StoredTag) =>
    tag.group === CATEGORY_GROUP
      ? library.recipes.filter((recipe) => recipe.category === tag.key).length
      : library.recipes.filter((recipe) => recipe.tags.includes(ref(tag))).length;
  const shelfOf = (tag: StoredTag) =>
    tag.group === CATEGORY_GROUP
      ? `/import/rezepte?kategorie=${tag.key}`
      : `/import/rezepte?tag=${ref(tag)}`;

  const open = tags.find((tag) => tag.id === one(params.stichwort)) ?? null;
  const problem = open ? await whyNot(db, open, tags, params) : null;
  const groups = [...TAG_GROUPS, CATEGORY_GROUP]
    .map((name) => ({ name, tags: tags.filter((tag) => tag.group === name) }))
    .filter((group) => group.tags.length > 0);
  const said = saidText(
    one(params.getan),
    tags.find((tag) => tag.id === one(params.wert)),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/import/rezepte">Alle Rezepte</BackLink>
      <h1 className="title mt-3">Stichworte</h1>
      <p className="mt-2 text-muted">
        Umbenennen lässt sich jedes Stichwort: Die App erkennt ihre eigenen auch unter einem neuen
        Namen. Zusammenführen, verschieben und löschen lässt sich, was ihr selbst angelegt habt.
      </p>
      {said && (
        <p
          role="status"
          className="mt-4 rounded-lg bg-accent-soft px-4 py-3 font-semibold text-accent"
        >
          {said}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.name} aria-label={group.name} className="mt-7">
          <h2 className="text-xl font-bold tracking-tight">
            {group.name === CATEGORY_GROUP ? "Kategorien" : group.name}
          </h2>
          <ul className="card mt-2 divide-y divide-line">
            {group.tags.map((tag) => {
              const isOpen = open?.id === tag.id;
              const recipes = count(tag);
              return (
                <li key={tag.id} id={`s-${tag.id}`} className="scroll-mt-4">
                  <div className="flex min-h-13 items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 font-semibold">{tag.name}</span>
                    <Link href={shelfOf(tag)} className="text-sm text-muted hover:underline">
                      {recipes === 1 ? "1 Rezept" : `${recipes} Rezepte`}
                    </Link>
                    <Link
                      href={
                        isOpen
                          ? `/rezepte/stichworte#s-${tag.id}`
                          : `/rezepte/stichworte?stichwort=${tag.id}#s-${tag.id}`
                      }
                      className="btn btn-small"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Schließen" : "Bearbeiten"}: ${tag.name}`}
                      scroll={false}
                    >
                      {isOpen ? "Schließen" : "Bearbeiten"}
                    </Link>
                  </div>
                  {isOpen && (
                    <TagPanel
                      tag={tag}
                      recipes={recipes}
                      tags={tags}
                      problem={problem}
                      typed={one(params.name)}
                      deleting={one(params.loeschen) === "1"}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** What was done last, for the line at the top. */
function saidText(done: string | undefined, tag: StoredTag | undefined): string | null {
  if (done === "geloescht") return "Das Stichwort ist gelöscht.";
  if (!tag) return null;
  if (done === "umbenannt") return `Heißt jetzt „${tag.name}“.`;
  if (done === "zusammengefuehrt") return `Zusammengeführt in „${tag.name}“.`;
  if (done === "verschoben") return `„${tag.name}“ steht jetzt unter „${tag.group}“.`;
  return null;
}

/**
 * Why a change that was asked for did not happen. The action sends back what was asked; the
 * rule is asked again here, so the page says it in its own words.
 */
async function whyNot(
  db: Db,
  tag: StoredTag,
  tags: StoredTag[],
  params: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  const name = one(params.name);
  if (name !== undefined) {
    const checked = checkRename(tag, name, tags);
    return checked.ok ? null : checked.error;
  }
  const into = tags.find((other) => other.id === one(params.mit));
  const group = one(params.gruppe);
  if (!into && group === undefined) return null;
  const links = await loadTagLinks(
    db,
    tags.map((entry) => entry.id),
  );
  if (into) {
    const plan = planMerge(tag, into, tags, links);
    return plan.ok ? null : plan.error;
  }
  const moved = checkMove(tag, group ?? "", tags, links);
  return moved.ok ? null : moved.error;
}

function TagPanel({
  tag,
  recipes,
  tags,
  problem,
  typed,
  deleting,
}: {
  tag: StoredTag;
  recipes: number;
  tags: StoredTag[];
  problem: string | null;
  typed: string | undefined;
  deleting: boolean;
}) {
  const own = isOwnTag(tag);
  const others = TAG_GROUPS.map((group) => ({
    group,
    tags: tags.filter((other) => other.group === group && other.id !== tag.id),
  })).filter((entry) => entry.tags.length > 0);
  return (
    <div className="space-y-5 border-t border-line bg-paper px-4 py-4">
      {problem && (
        <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 font-semibold text-warn">
          {problem}
        </p>
      )}

      <form action={renameTagAction}>
        <input type="hidden" name="stichwort" value={tag.id} />
        <label className="label" htmlFor={`name-${tag.id}`}>
          Name
        </label>
        <div className="flex gap-2">
          <input
            id={`name-${tag.id}`}
            name="name"
            className="field flex-1"
            defaultValue={typed ?? tag.name}
            maxLength={TAG_NAME_MAX}
            required
          />
          <SubmitButton className="btn btn-small shrink-0">Umbenennen</SubmitButton>
        </div>
      </form>

      {!own ? (
        <p className="text-sm text-muted">
          {tag.group === CATEGORY_GROUP
            ? "Eine Kategorie gehört zur App: Jedes Rezept hat höchstens eine, und der Wochenplan geht danach."
            : "Gehört zur App: Wochenplan, Vorschläge und Suche gehen danach. Es bleibt in seiner Gruppe."}
        </p>
      ) : (
        <>
          <form action={mergeTagAction}>
            <input type="hidden" name="stichwort" value={tag.id} />
            <label className="label" htmlFor={`mit-${tag.id}`}>
              Zusammenführen mit
            </label>
            <div className="flex gap-2">
              <select id={`mit-${tag.id}`} name="mit" className="field flex-1">
                {others.map((entry) => (
                  <optgroup key={entry.group} label={entry.group}>
                    {entry.tags.map((other) => (
                      <option key={other.id} value={other.id}>
                        {other.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <SubmitButton className="btn btn-small shrink-0">Zusammenführen</SubmitButton>
            </div>
            <p className="mt-1 text-sm text-muted">
              Die Rezepte mit „{tag.name}“ bekommen das gewählte Stichwort, „{tag.name}“ fällt weg.
            </p>
          </form>

          <form action={moveTagAction}>
            <input type="hidden" name="stichwort" value={tag.id} />
            <label className="label" htmlFor={`gruppe-${tag.id}`}>
              Verschieben nach
            </label>
            <div className="flex gap-2">
              <select id={`gruppe-${tag.id}`} name="gruppe" className="field flex-1">
                {MOVABLE_GROUPS.filter((group) => group !== tag.group).map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn btn-small shrink-0">Verschieben</SubmitButton>
            </div>
          </form>

          {deleting ? (
            <form action={deleteTagAction} className="rounded-lg bg-warn-soft px-4 py-3 text-warn">
              <input type="hidden" name="stichwort" value={tag.id} />
              <input type="hidden" name="bestaetigt" value="ja" />
              <p className="font-semibold">
                „{tag.name}“ löschen?
                {recipes > 0 &&
                  ` ${recipes === 1 ? "1 Rezept verliert" : `${recipes} Rezepte verlieren`} es.`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SubmitButton className="btn btn-small btn-danger">Löschen</SubmitButton>
                <Link
                  href={`/rezepte/stichworte?stichwort=${tag.id}#s-${tag.id}`}
                  className="btn btn-small"
                  scroll={false}
                >
                  Abbrechen
                </Link>
              </div>
            </form>
          ) : (
            <Link
              href={`/rezepte/stichworte?stichwort=${tag.id}&loeschen=1#s-${tag.id}`}
              className="btn btn-small btn-danger"
              scroll={false}
            >
              Löschen
            </Link>
          )}
        </>
      )}
    </div>
  );
}
