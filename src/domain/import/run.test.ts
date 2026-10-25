import { describe, expect, it } from "vitest";
import { afterStep, handOn, MAX_ROUNDS, RUN_BUDGET_MS } from "./run";

describe("afterStep", () => {
  it("goes on at once after a step that worked", () => {
    expect(afterStep("worked", 0)).toEqual({ stop: false, pauseMs: 0 });
  });

  it("waits a moment while other requests work, and longer when the service asks", () => {
    expect(afterStep("waiting", 0)).toEqual({ stop: false, pauseMs: 1500 });
    expect(afterStep("throttled", 0)).toEqual({ stop: false, pauseMs: 20000 });
  });

  it("stops when the batch is through or a step failed", () => {
    expect(afterStep("done", 0)).toEqual({ stop: true });
    expect(afterStep("failed", 0)).toEqual({ stop: true });
  });

  it("begins no step it might not finish in time", () => {
    expect(afterStep("worked", RUN_BUDGET_MS - 70_000)).toEqual({ stop: false, pauseMs: 0 });
    expect(afterStep("worked", RUN_BUDGET_MS - 50_000)).toEqual({ stop: true });
    expect(afterStep("throttled", RUN_BUDGET_MS - 70_000)).toEqual({ stop: true });
  });
});

describe("handOn", () => {
  const now = 1_000_000;
  it("hands an unfinished batch on while the login lasts", () => {
    expect(handOn(false, 1, now + 3600, now)).toBe(true);
  });

  it("stops when the batch is through, after the last round, or near the end of the login", () => {
    expect(handOn(true, 1, now + 3600, now)).toBe(false);
    expect(handOn(false, MAX_ROUNDS, now + 3600, now)).toBe(false);
    expect(handOn(false, 1, now + 300, now)).toBe(false);
    expect(handOn(false, 1, null, now)).toBe(false);
  });
});
