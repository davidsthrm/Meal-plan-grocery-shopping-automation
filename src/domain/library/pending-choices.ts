import { TAG_PARAM } from "./filter";

/**
 * The choices of the filter tapped before the server has answered (`FilterPanel`). A tap
 * shows at once, and the next one builds on those before it: every choice was a plain link
 * from the page as it was drawn, so a second chip tapped while the first was on its way
 * dropped the first (November 2026).
 *
 * Nothing here knows what a choice means. A tap changes the address as the choice's own
 * link would change the page as it was drawn; `tag` holds several tags separated by commas,
 * each added or taken away on its own.
 */

export interface Choice {
  key: string;
  /** On as the page was drawn. */
  on: boolean;
  /** Where its link leads from the page as it was drawn. */
  href: string;
}

export interface ChoiceGroup {
  key: string;
  /** At most one of its choices is on: another replaces it. */
  single: boolean;
  choices: readonly Choice[];
}

/** What is on in each group tapped, the group tapped last at the end. */
export type Tapped = readonly { group: string; on: readonly string[] }[];

function onIn(tapped: Tapped, group: ChoiceGroup): readonly string[] {
  return (
    tapped.find((entry) => entry.group === group.key)?.on ??
    group.choices.filter((choice) => choice.on).map((choice) => choice.key)
  );
}

/** Whether a choice is on with the taps on their way. */
export function isOn(tapped: Tapped, group: ChoiceGroup, choice: string): boolean {
  return onIn(tapped, group).includes(choice);
}

/** The taps with one more: the choice turns off when it is on, else on. */
export function tap(tapped: Tapped, group: ChoiceGroup, choice: string): Tapped {
  const before = onIn(tapped, group);
  const on = before.includes(choice)
    ? before.filter((key) => key !== choice)
    : group.single
      ? [choice]
      : [...before, choice];
  return [...tapped.filter((entry) => entry.group !== group.key), { group: group.key, on }];
}

const listOf = (value: string | null) => (value ? value.split(",") : []);

/** Changes `params` as the step from `from` to `to` changes an address. */
function change(params: URLSearchParams, from: URLSearchParams, to: URLSearchParams) {
  for (const key of new Set([...from.keys(), ...to.keys()])) {
    const before = from.get(key);
    const after = to.get(key);
    if (before === after) continue;
    let value = after;
    if (key === TAG_PARAM) {
      const gone = listOf(before).filter((entry) => !listOf(after).includes(entry));
      const kept = listOf(params.get(key)).filter((entry) => !gone.includes(entry));
      const added = listOf(after).filter(
        (entry) => !listOf(before).includes(entry) && !kept.includes(entry),
      );
      value = [...kept, ...added].join(",") || null;
    }
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
}

/** Where the taps lead from the page as it was drawn (`now`, its path and search). */
export function pendingHref(now: string, groups: readonly ChoiceGroup[], tapped: Tapped): string {
  const drawn = new URL(now, "http://app");
  const params = new URLSearchParams(drawn.search);
  for (const entry of tapped) {
    const group = groups.find((candidate) => candidate.key === entry.group);
    if (!group) continue;
    const added = group.choices.filter((choice) => !choice.on && entry.on.includes(choice.key));
    const removed = group.choices.filter((choice) => choice.on && !entry.on.includes(choice.key));
    // In a group of one, the link of the choice turned on turns the other one off already.
    const links = group.single ? (added.length > 0 ? added : removed) : [...added, ...removed];
    for (const choice of links) {
      change(params, drawn.searchParams, new URL(choice.href, drawn).searchParams);
    }
  }
  const search = params.toString();
  return search ? `${drawn.pathname}?${search}` : drawn.pathname;
}
