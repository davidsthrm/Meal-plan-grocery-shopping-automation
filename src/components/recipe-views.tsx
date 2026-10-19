import Link from "next/link";

/**
 * The two views of the recipes, as the week has "Mahlzeiten" and "Außerdem": "Entdecken" to
 * find something to cook, "Regal" to look after the whole library.
 */
export function RecipeViews({ current }: { current: "entdecken" | "regal" }) {
  const view = (key: typeof current, href: string, label: string) => (
    <Link href={href} className="segment" aria-current={current === key ? "page" : undefined}>
      {label}
    </Link>
  );
  return (
    <nav aria-label="Ansicht" className="segmented">
      {view("entdecken", "/rezepte", "Entdecken")}
      {view("regal", "/rezepte/regal", "Regal")}
    </nav>
  );
}
