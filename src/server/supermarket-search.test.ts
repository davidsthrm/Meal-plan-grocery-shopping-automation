import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findStreets, searchSupermarkets } = await import("./supermarket-search");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the deadline of a supermarket search", () => {
  it("asks nothing once the time is up", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(searchSupermarkets("88471", undefined, Date.now() + 500)).rejects.toThrow(
      "keine Zeit mehr",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("leaves the streets still waiting at the deadline for the next search", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => Response.json([{ lat: "48.2", lon: "9.9" }]));
    vi.stubGlobal("fetch", fetch);
    const shops = ["a", "b", "c", "d"].map((id) => ({ id, address: `Straße ${id}` }));
    // Each lookup needs the pause Nominatim asks for and a second to answer: two fit.
    const found = findStreets(shops, "88471", Date.now() + 2500);
    await vi.runAllTimersAsync();
    expect([...(await found).keys()]).toEqual(["a", "b"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
