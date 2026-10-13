import { describe, expect, it } from "vitest";
import { inviteIsOpen, readJoin, readName } from "./family";

describe("readName", () => {
  it("tidies a name", () => {
    expect(readName("  Oma   Heidrun ")).toBe("Oma Heidrun");
    expect(readName("x".repeat(60))).toHaveLength(40);
  });
});

describe("readJoin", () => {
  it("takes what is complete", () => {
    const { value, errors } = readJoin({
      name: " Lena ",
      email: " Lena@Example.org ",
      password: "ein langes passwort",
    });
    expect(errors).toEqual({});
    expect(value).toEqual({
      name: "Lena",
      email: "lena@example.org",
      password: "ein langes passwort",
    });
  });

  it("says what is missing, field by field", () => {
    const { value, errors } = readJoin({ name: " ", email: "lena", password: "kurz" });
    expect(value).toBeNull();
    expect(Object.keys(errors).sort()).toEqual(["email", "name", "password"]);
  });

  it("does not trim a password", () => {
    expect(readJoin({ name: "L", email: "l@e.de", password: " 123456 " }).value?.password).toBe(
      " 123456 ",
    );
  });
});

describe("inviteIsOpen", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  it("is open until it is used or too old", () => {
    expect(inviteIsOpen({ usedAt: null, expiresAt: "2026-10-20T12:00:00Z" }, now)).toBe(true);
    expect(inviteIsOpen({ usedAt: null, expiresAt: "2026-10-13T11:59:00Z" }, now)).toBe(false);
    expect(
      inviteIsOpen({ usedAt: "2026-10-12T08:00:00Z", expiresAt: "2026-10-20T12:00:00Z" }, now),
    ).toBe(false);
  });
});
