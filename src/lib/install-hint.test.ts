import { describe, expect, it } from "vitest";
import { installHint } from "./install-hint";

const browser = { installed: false, safari: false, canPrompt: false, dismissed: false };

describe("the hint to put the app on the home screen", () => {
  it("tells Safari where its button is", () => {
    expect(installHint({ ...browser, safari: true })).toBe("safari");
  });

  it("offers the install prompt where the browser has one", () => {
    expect(installHint({ ...browser, canPrompt: true })).toBe("prompt");
  });

  it("is not shown in the installed app, once put away, or without a way to install", () => {
    expect(installHint({ ...browser, safari: true, installed: true })).toBeNull();
    expect(installHint({ ...browser, canPrompt: true, dismissed: true })).toBeNull();
    expect(installHint(browser)).toBeNull();
  });
});
