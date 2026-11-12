import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { kept, STUCK_MS } = await import("./kept");

/** A household of its own for each test: what is kept lives as long as the module. */
const household = (id: string, libraryVersion: number | null) => ({ id, libraryVersion });

describe("what the server keeps of a library", () => {
  it("reads once for requests that arrive together", async () => {
    const read = vi.fn(async () => ["Linsensuppe"]);
    const [a, b] = await Promise.all([
      kept(household("h1", 3), "library", read),
      kept(household("h1", 3), "library", read),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("reads again once the counter has risen", async () => {
    const read = vi.fn().mockResolvedValueOnce("alt").mockResolvedValueOnce("neu");
    expect(await kept(household("h2", 1), "library", read)).toBe("alt");
    expect(await kept(household("h2", 2), "library", read)).toBe("neu");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("throws away everything kept for the household when its counter rises", async () => {
    await kept(household("h3", 1), "seasonal foods", async () => "alt");
    await kept(household("h3", 2), "library", async () => "neu");
    expect(await kept(household("h3", 2), "seasonal foods", async () => "frisch")).toBe("frisch");
  });

  it("gives an older asker the newer value and keeps it", async () => {
    await kept(household("h4", 5), "library", async () => "neu");
    const older = vi.fn(async () => "alt");
    expect(await kept(household("h4", 4), "library", older)).toBe("neu");
    expect(older).not.toHaveBeenCalled();
    expect(await kept(household("h4", 5), "library", older)).toBe("neu");
  });

  it("reads again after a read failed", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(kept(household("h5", 1), "library", failing)).rejects.toThrow("offline");
    expect(await kept(household("h5", 1), "library", async () => "da")).toBe("da");
  });

  it("does not let a failed read throw away a newer one", async () => {
    let fail: (error: Error) => void = () => {};
    const first = kept(
      household("h6", 1),
      "library",
      () => new Promise<string>((_, reject) => (fail = reject)),
    );
    await kept(household("h6", 2), "library", async () => "neu");
    fail(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(await kept(household("h6", 2), "library", async () => "frisch")).toBe("neu");
  });

  it("does not let a request change what is kept in place", async () => {
    const library = await kept(household("h9", 1), "library", async () => ({
      recipes: [{ title: "Linsensuppe", tags: ["schnell", "einfach"] }],
      byId: new Map([["r1", { title: "Linsensuppe" }]]),
    }));
    expect(() => library.recipes.push({ title: "Pizza", tags: [] })).toThrow(TypeError);
    expect(() => library.recipes[0].tags.sort()).toThrow(TypeError);
    expect(() => {
      library.recipes[0].title = "Pizza";
    }).toThrow(TypeError);
    expect(() => {
      library.byId.get("r1")!.title = "Pizza";
    }).toThrow(TypeError);
  });

  it("keeps nothing for a household without a counter", async () => {
    const read = vi.fn().mockResolvedValueOnce("alt").mockResolvedValueOnce("neu");
    expect(await kept(household("h10", null), "library", read)).toBe("alt");
    expect(await kept(household("h10", null), "library", read)).toBe("neu");
  });

  it("stops waiting for a read that hangs, and reads again", async () => {
    vi.useFakeTimers();
    try {
      const hanging = vi.fn(() => new Promise<string>(() => {}));
      void kept(household("h11", 1), "library", hanging);
      // Within the time a read may take, others wait for the same one.
      void kept(household("h11", 1), "library", hanging);
      expect(hanging).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(STUCK_MS);
      expect(await kept(household("h11", 1), "library", async () => "frisch")).toBe("frisch");
      // And what was read afresh is kept.
      expect(await kept(household("h11", 1), "library", async () => "anders")).toBe("frisch");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps households apart", async () => {
    await kept(household("h7", 1), "library", async () => "unsere");
    expect(await kept(household("h8", 1), "library", async () => "die der Nachbarn")).toBe(
      "die der Nachbarn",
    );
    expect(await kept(household("h7", 1), "library", async () => "anders")).toBe("unsere");
  });
});
