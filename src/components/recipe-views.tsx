import Link from "next/link";
import { SWAP } from "@/lib/transitions";
import { SegmentPill } from "./segment-pill";

/**
 * The two views of the recipes, as the week has "Mahlzeiten" and "Außerdem": "Entdecken" to
 * find something to cook, "Regal" to leaf through the cookbooks. The table of every recipe,
 * to look after the library, is under Import ("Alle Rezepte").
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
