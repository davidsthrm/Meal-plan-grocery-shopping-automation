import Link from "next/link";
import { FORWARD, SWAP } from "@/lib/transitions";
import { PlusIcon } from "./icons";
import { SegmentPill } from "./segment-pill";

/**
 * The two views of the recipes, as the week has "Mahlzeiten" and "Außerdem": "Entdecken" to
 * find something to cook, "Regal" to leaf through the cookbooks. The table of every recipe,
 * to look after the library, is on the import's page ("Alle Rezepte").
 */
export function RecipeViews({ current }: { current: "entdecken" | "regal" }) {
  const view = (key: typeof current, href: string, label: string) => (
    <Link
      href={href}
      transitionTypes={[SWAP]}
      className="segment"
      aria-current={current === key ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Ansicht" className="segmented">
      <SegmentPill name="pill-rezepte" at={current === "entdecken" ? 0 : 1} of={2} />
      {view("entdecken", "/rezepte", "Entdecken")}
      {view("regal", "/rezepte/regal", "Regal")}
    </nav>
  );
}

/**
 * "+ Rezept": to the import's page, where photos, text or typing bring a recipe in. It was a
 * section of its own until 25 November 2026; it is a task done now and then, the sections are
 * the places gone to every week. At the end of the row under the switch, on both views:
 * beside the search and "Filter" on Entdecken.
 */
export function NewRecipeLink() {
  return (
    <Link
      href="/import"
      transitionTypes={[FORWARD]}
      className="btn btn-primary shrink-0 gap-1.5 max-sm:px-3"
      aria-label="Rezept hinzufügen"
    >
      <PlusIcon />
      Rezept
    </Link>
  );
}
