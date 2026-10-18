import { describe, expect, it } from "vitest";
import { scoreSteps, similarity } from "./score";
import {
  cleanStep,
  cleanSteps,
  GAP,
  readTypedSteps,
  settleSteps,
  stepProblems,
  surveySawSteps,
  typedSteps,
} from "./steps";
import type { PageSurvey } from "./survey";

describe("cleanStep", () => {
  it("drops the printed number and the line breaks of the page", () => {
    expect(cleanStep("1. Die Nudeln\n  in Salzwasser garen. ")).toBe(
      "Die Nudeln in Salzwasser garen.",
    );
    expect(cleanStep("2) Abgießen.")).toBe("Abgießen.");
    expect(cleanStep("Schritt 3: Servieren.")).toBe("Servieren.");
  });

  it("keeps a number that belongs to the step", () => {
    expect(cleanStep("2–3 EL Öl erhitzen.")).toBe("2–3 EL Öl erhitzen.");
    expect(cleanStep("180 Grad vorheizen.")).toBe("180 Grad vorheizen.");
    expect(cleanStep("1 EL Butter schmelzen.")).toBe("1 EL Butter schmelzen.");
  });

  it("writes a gap one way", () => {
    expect(cleanStep("Etwa [...] Minuten backen.")).toBe(`Etwa ${GAP} Minuten backen.`);
  });

  it("leaves out empty steps", () => {
    expect(cleanSteps(["Rühren.", "  ", ""])).toEqual(["Rühren."]);
  });
});

describe("stepProblems", () => {
  it("finds a gap the model left and steps that break off", () => {
    expect(stepProblems(["Teig kneten.", `Etwa ${GAP} Minuten backen.`])).toEqual([
      { code: "steps_unreadable", step: 1 },
    ]);
    expect(
      stepProblems(["Teig kneten.", "Den Teig in die Form geben und bei 180 Grad back-"]),
    ).toEqual([{ code: "steps_cut_off", step: 1 }]);
    expect(stepProblems(["Den Teig ausrollen,"])).toEqual([{ code: "steps_cut_off", step: 0 }]);
  });

  it("finds steps missing only where the first look saw some", () => {
    expect(stepProblems([], true)).toEqual([{ code: "steps_missing", step: null }]);
    expect(stepProblems([], false)).toEqual([]);
    expect(stepProblems([], null)).toEqual([]);
  });

  it("has nothing to say about steps that are complete", () => {
    expect(
      stepProblems(["Für den Belag: Äpfel schälen.", "Backen (Ober- und Unterhitze)."]),
    ).toEqual([]);
  });
});

describe("surveySawSteps", () => {
  const page = (...hasSteps: boolean[]): PageSurvey => ({
    printedPage: 12,
    otherContent: "",
    recipes: hasSteps.map((steps) => ({
      title: "Rezept",
      page: 12,
      hasIngredientList: true,
      hasSteps: steps,
      continuesOnNextPage: false,
    })),
  });

  it("asks the page of a recipe that has it to itself", () => {
    expect(surveySawSteps([page(true)], null)).toBe(true);
    expect(surveySawSteps([page(false)], null)).toBe(false);
  });

  it("asks for the recipe meant on a page shared by several", () => {
    expect(surveySawSteps([page(true, false)], { position: 2, count: 2 })).toBe(false);
    expect(surveySawSteps([page(true, false)], { position: 1, count: 2 })).toBe(true);
  });

  it("finds steps on any page of a recipe that spans two", () => {
    expect(surveySawSteps([page(false), page(true)], null)).toBe(true);
  });

  it("does not know without a clear page", () => {
    expect(surveySawSteps([null], null)).toBeNull();
    expect(surveySawSteps([page(true, true)], null)).toBeNull();
  });
});

describe("readTypedSteps", () => {
  it("reads one step per line and nothing as not known", () => {
    expect(readTypedSteps("Nudeln garen.\r\n\r\nPesto mixen.")).toEqual({
      ok: true,
      steps: ["Nudeln garen.", "Pesto mixen."],
    });
    expect(readTypedSteps("")).toEqual({ ok: true, steps: null });
  });

  it("refuses more steps than a recipe has", () => {
    expect(readTypedSteps(Array.from({ length: 41 }, (_, i) => `Schritt ${i}`).join("\n"))).toEqual(
      { ok: false, error: "Höchstens 40 Schritte." },
    );
  });

  it("writes stored steps back one per line", () => {
    expect(typedSteps(["A.", "B."])).toBe("A.\nB.");
    expect(typedSteps(null)).toBe("");
  });
});

describe("settleSteps", () => {
  const reading = (steps: string[], uncertain: string[] = []) => ({
    steps,
    uncertain: uncertain.map((reason) => ({ field: "steps", reason })),
    notes: [],
  });

  it("keeps steps read and checked without doubt", () => {
    expect(settleSteps(reading(["1. Kochen.", "2. Essen."]), [])).toEqual({
      steps: ["Kochen.", "Essen."],
      doubts: [],
    });
  });

  it("keeps the model's own doubt and does not repeat it for its gap", () => {
    const settled = settleSteps(
      reading([`Etwa ${GAP} Minuten backen.`], ["Schritt 1: die Backzeit ist verwischt"]),
      [],
    );
    expect(settled.doubts).toEqual(["Schritt 1: die Backzeit ist verwischt"]);
  });

  it("names a gap and a step that breaks off when the model did not", () => {
    const settled = settleSteps(reading([`Etwa ${GAP} Minuten backen.`, "Auf ein Gitter,"]), []);
    expect(settled.doubts).toEqual([
      "Schritt 1 war nicht ganz lesbar ([…]).",
      "Schritt 2 bricht mitten im Satz ab. Der Rest steht wohl auf einer anderen Seite.",
    ]);
  });

  it("adds what the second look saw differently", () => {
    const settled = settleSteps(reading(["Bei 180 Grad backen."]), [
      { stepIndex: 0, field: "step", printed: "160 Grad", transcribed: "180 Grad" },
      { stepIndex: null, field: "missing_step", printed: "Abkühlen lassen.", transcribed: "" },
    ]);
    expect(settled.doubts).toEqual([
      "Schritt 1: Auf dem Foto steht „160 Grad“, gelesen wurde „180 Grad“.",
      "Ein Schritt fehlt: Auf dem Foto steht „Abkühlen lassen.“.",
    ]);
  });

  it("says so when the steps could not be checked", () => {
    expect(settleSteps(reading(["Kochen."]), null).doubts).toEqual([
      "Die Arbeitsschritte konnten nicht gegengeprüft werden.",
    ]);
  });

  it("stores no steps without doubt when the photos show none", () => {
    expect(settleSteps(reading([]), [])).toEqual({ steps: [], doubts: [] });
  });
});

describe("scoreSteps", () => {
  it("counts steps the same apart from spaces, punctuation and joined words", () => {
    const score = scoreSteps(
      ["Spaghetti nach Packungsanweisung garen.", "Ober- / Unterhitze, 2–3 Minuten."],
      ["Spaghetti nach Packungs-anweisung garen.", "Ober-/Unterhitze, 2-3 Minuten."],
    );
    expect(score).toMatchObject({ exact: 2, perfect: true });
  });

  it("catches a wrong number, a missing step and a step from a tip box", () => {
    const score = scoreSteps(
      ["Bei 110 Grad vorheizen.", "Servieren."],
      ["Bei 180 Grad vorheizen.", "Servieren.", "Tipp: dazu passt Salat."],
    );
    expect(score.perfect).toBe(false);
    expect(score.wrongNumbers).toEqual([{ step: 1, expected: ["110"], actual: ["180"] }]);
    expect(score.different.map((step) => step.step)).toEqual([1, 3]);
  });

  it("measures how close two texts are", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abcd", "abcf")).toBe(0.75);
    expect(similarity("", "abc")).toBe(0);
  });
});
