import { describe, expect, it } from "vitest";
import { isPreview, mayUseDeployment } from "./preview";

describe("who may use a deployment", () => {
  it("lets everyone the login lets in use production and development", () => {
    expect(mayUseDeployment("lena@example.com", { VERCEL_ENV: "production" })).toBe(true);
    expect(mayUseDeployment("lena@example.com", {})).toBe(true);
  });

  it("lets only the test household's login use a preview", () => {
    const env = { VERCEL_ENV: "preview", PREVIEW_ONLY_EMAIL: " E2E@example.com " };
    expect(mayUseDeployment("e2e@example.com", env)).toBe(true);
    expect(mayUseDeployment("E2E@Example.com", env)).toBe(true);
    expect(mayUseDeployment("lena@example.com", env)).toBe(false);
    expect(mayUseDeployment(null, env)).toBe(false);
  });

  it("lets nobody use a preview that does not name the test login", () => {
    expect(mayUseDeployment("lena@example.com", { VERCEL_ENV: "preview" })).toBe(false);
    expect(mayUseDeployment("", { VERCEL_ENV: "preview", PREVIEW_ONLY_EMAIL: "" })).toBe(false);
  });

  it("knows a preview by Vercel's own setting", () => {
    expect(isPreview({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isPreview({ VERCEL_ENV: "production" })).toBe(false);
    expect(isPreview({})).toBe(false);
  });
});
