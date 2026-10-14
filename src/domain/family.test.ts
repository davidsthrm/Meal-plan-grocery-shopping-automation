import { describe, expect, it } from "vitest";
import { familyName, firstName, inviteIsOpen, readJoin, readName, salutation } from "./family";

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

describe("familyName", () => {
  it("speaks of a household by its family name", () => {
    expect(familyName("Stührmann")).toBe("Stührmanns");
    expect(familyName(" Müller ")).toBe("Müllers");
    expect(familyName("Meier-Schmidt")).toBe("Meier-Schmidts");
  });

  it("leaves a name that ends in an s sound as it is", () => {
    expect(familyName("Fuchs")).toBe("Fuchs");
    expect(familyName("Schulz")).toBe("Schulz");
  });

  it("has nothing to say for a name that is no family name", () => {
    expect(familyName("Zuhause")).toBeNull();
    expect(familyName("E2E-Test (automatisch)")).toBeNull();
    expect(familyName("stührmann")).toBeNull();
    expect(familyName("Familie Stührmann")).toBeNull();
    expect(familyName("")).toBeNull();
  });
});

describe("firstName", () => {
  it("greets a member by the first word of their name", () => {
    expect(firstName("David Stührmann")).toBe("David");
    expect(firstName("  Lena ")).toBe("Lena");
    expect(firstName(null)).toBeNull();
    expect(firstName("   ")).toBeNull();
  });
});

describe("salutation", () => {
  it("greets by the time of day", () => {
    expect(salutation(7)).toBe("Guten Morgen");
    expect(salutation(10)).toBe("Guten Morgen");
    expect(salutation(11)).toBe("Hallo");
    expect(salutation(17)).toBe("Hallo");
    expect(salutation(18)).toBe("Guten Abend");
    expect(salutation(22)).toBe("Guten Abend");
    expect(salutation(23)).toBe("Hallo");
    expect(salutation(3)).toBe("Hallo");
  });
});
