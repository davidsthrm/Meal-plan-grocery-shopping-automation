import type { ImportIssue } from "@/domain/import/checks";

/** What an import issue means, in words for the person reviewing the recipe. */
export function issueText(issue: ImportIssue): string {
  switch (issue.code) {
    case "title_missing":
      return "Auf dem Foto steht kein Titel. Bitte trage ihn ein.";
    case "servings_missing":
      return "Auf dem Foto steht nicht, für wie viele Portionen das Rezept ist.";
    case "servings_unclear":
      return `Die App kann „${issue.detail}“ nicht einordnen. Bitte eintragen, wofür das Rezept reicht.`;
    case "no_ingredients":
      return "Es wurden keine Zutaten gefunden.";
    case "unmapped_ingredient":
      return `„${issue.detail}“ steht noch nicht im Zutatenkatalog.`;
    case "unclear_line":
      return "Diese Zeile war nicht sicher zu lesen. Bitte mit dem Foto vergleichen.";
    case "model_uncertain":
      return `Nicht sicher gelesen: ${issue.detail}`;
    case "implausible_quantity":
      return "Die Menge ist ungewöhnlich groß. Bitte mit dem Foto vergleichen.";
    case "unit_missing":
      return "Zur Menge stand keine Einheit, die die App kennt. Bitte die Einheit wählen.";
    case "store_failed":
      return `Das Rezept konnte nicht gespeichert werden: ${issue.detail}`;
    case "invalid_range":
      return "Die Von-bis-Menge passt nicht zusammen.";
    case "invalid_alternative":
      return "Die Zuordnung „oder“ passt nicht.";
    case "steps_unreadable":
      return `Arbeitsschritt ${issue.detail} war nicht ganz lesbar (…). Bitte mit dem Foto vergleichen.`;
    case "steps_cut_off":
      return `Arbeitsschritt ${issue.detail} bricht mitten im Satz ab. Steht der Rest auf der nächsten Seite?`;
    case "steps_missing":
      return "Auf dem Foto stehen Arbeitsschritte, gelesen wurde keiner. Bitte abtippen oder die Seite dazunehmen.";
    case "verification_disagrees":
      return `Die Gegenprüfung liest etwas anderes: ${issue.detail}`;
    case "read_failed":
      return `Konnte nicht gelesen werden: ${issue.detail}`;
  }
}
