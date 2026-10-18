import Link from "next/link";
import { saveTags } from "@/app/(app)/rezepte/actions";
import { SINGLE_GROUPS, type TagGroup } from "@/domain/library/tags";
import { SubmitButton } from "./submit-button";
import { TagNameField } from "./tag-name-field";

/**
 * The tags of one recipe, changed in place: on its page and in a row of the Regal. A plain
 * form: each tag is a chip to tick, in a group that allows one tag a choice of one, and a
 * field for a new one that offers the tags there are first.
 */
export function TagEditor({
  recipeId,
  chosen,
  tagGroups,
  target,
  back,
  cancel,
}: {
  recipeId: string;
  /** The tags the recipe has, as the app refers to them. */
  chosen: readonly string[];
  tagGroups: readonly TagGroup[];
  /** Where saving leads back to: the recipe's page or the Regal. */
  target: "rezept" | "regal";
  /** The query of the page it leads back to. */
  back: string;
  cancel: string;
}) {
  const own = new Set(chosen);
  const chipPrefix = `t-${recipeId}-`;
  return (
    <form action={saveTags} className="space-y-3" aria-label="Stichworte ändern">
      <input type="hidden" name="rezept" value={recipeId} />
      <input type="hidden" name="ziel" value={target} />
      <input type="hidden" name="zurueck" value={back} />
      {tagGroups.map((group) => {
        const single = SINGLE_GROUPS.has(group.name);
        const none = !group.tags.some((tag) => own.has(tag.ref));
        return (
          <fieldset key={group.name}>
            <legend className="eyebrow mb-1.5">{group.name}</legend>
            <div className="flex flex-wrap gap-2">
              {group.tags.map((tag) => (
                <label key={tag.ref} className="chip cursor-pointer">
                  <input
                    id={`${chipPrefix}${tag.ref}`}
                    type={single ? "radio" : "checkbox"}
                    name={single ? `einer-${group.name}` : "tag"}
                    value={tag.ref}
                    defaultChecked={own.has(tag.ref)}
                    className="sr-only"
                  />
                  {tag.name}
                </label>
              ))}
              {single && (
                <label className="chip cursor-pointer font-normal text-muted">
                  <input
                    type="radio"
                    name={`einer-${group.name}`}
                    value=""
                    defaultChecked={none}
                    className="sr-only"
                  />
                  Keins
                </label>
              )}
            </div>
          </fieldset>
        );
      })}
      <TagNameField
        name="neu"
        label="Neues Stichwort"
        tags={tagGroups.flatMap((group) => group.tags)}
        chipPrefix={chipPrefix}
      />
      <div className="flex flex-wrap gap-2 pt-1">
        <SubmitButton className="btn btn-primary">Stichworte speichern</SubmitButton>
        <Link href={cancel} className="btn" scroll={false}>
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
