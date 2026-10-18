import type { CatalogIndex, Ingredient } from "../catalog";
import { parseIngredientLine } from "../library/typed-recipe";
import { mapDescribed, mapToCatalog, sameProductName } from "./map-ingredient";

/**
 * Puts the open questions about new ingredients in order before they are shown. A recipe
 * changed in its form used to send its unknown lines back as printed ("200 g Belugalinsen"),
 * which became a second question beside "Belugalinsen". Here a name loses an amount in front
 * and a note after a comma, proposals for one product become one, and a proposal the
 * catalog can answer by now is answered.
 */

export interface OpenProposal {
  id: string;
  name: string;
  /** For the order: the first proposal of a product is the one that stays. */
  createdAt: string;
}

export interface ProposalTidying {
  /** Proposals whose name loses what is no part of it. */
  renames: { id: string; name: string }[];
  /** Proposals that go into another one of the same product: its recipe lines move there. */
  merges: { from: string; into: string }[];
  /** Proposals the catalog knows by now, by the ingredient they are. */
  known: { id: string; name: string; ingredient: Ingredient }[];
}

/** The name of a product without an amount in front or a note after a comma. */
export function productName(name: string): string {
  const line = parseIngredientLine(name);
  return line && line.name !== "" ? line.name : name.trim();
}

export function tidyProposals(open: readonly OpenProposal[], index: CatalogIndex): ProposalTidying {
  const tidying: ProposalTidying = { renames: [], merges: [], known: [] };
  const kept: { id: string; name: string }[] = [];
  for (const proposal of [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const name = productName(proposal.name);
    const same = kept.find((other) => sameProductName(other.name, name));
    if (same) {
      tidying.merges.push({ from: proposal.id, into: same.id });
      continue;
    }
    if (name !== proposal.name) tidying.renames.push({ id: proposal.id, name });
    kept.push({ id: proposal.id, name });
  }
  for (const proposal of kept) {
    const ingredient =
      mapToCatalog(index, { raw: proposal.name, name: proposal.name }) ??
      mapDescribed(index, proposal.name);
    if (ingredient) tidying.known.push({ ...proposal, ingredient });
  }
  return tidying;
}
