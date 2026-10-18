import { describe, expect, it } from "vitest";
import { createCatalogIndex } from "../catalog";
import { seedCatalog } from "../../../supabase/seed/catalog";
import { productName, tidyProposals } from "./tidy-proposals";

const index = createCatalogIndex(seedCatalog);
const open = (id: string, name: string, createdAt = id) => ({ id, name, createdAt });

describe("productName", () => {
  it("leaves out an amount in front and a note after a comma", () => {
    expect(productName("200 g Belugalinsen")).toBe("Belugalinsen");
    expect(productName("1,2 kg Rehkeule, ausgelöst")).toBe("Rehkeule");
    expect(productName("2 EL bittere Orangenmarmelade")).toBe("bittere Orangenmarmelade");
    expect(productName("Belugalinsen")).toBe("Belugalinsen");
    expect(productName("5-Minuten-Terrine")).toBe("5-Minuten-Terrine");
  });
});

describe("tidyProposals", () => {
  it("makes one question of two for the same product, the first one staying", () => {
    const tidying = tidyProposals(
      [open("2", "200 g Belugalinsen"), open("1", "Belugalinsen"), open("3", "Wildfond")],
      index,
    );
    expect(tidying.merges).toEqual([{ from: "2", into: "1" }]);
    expect(tidying.renames).toEqual([]);
  });

  it("renames a proposal that carries its amount", () => {
    expect(tidyProposals([open("1", "500 ml Wildfond")], index).renames).toEqual([
      { id: "1", name: "Wildfond" },
    ]);
  });

  it("answers what the catalog knows behind words that only describe it", () => {
    const tidying = tidyProposals([open("1", "1 kleines Bauernbrot")], index);
    expect(tidying.known).toMatchObject([{ id: "1", ingredient: { id: "brot" } }]);
  });
});
