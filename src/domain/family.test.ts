import { describe, expect, it } from "vitest";
import {
  canLeave,
  canRemove,
  familyName,
  firstName,
  initialOf,
  inviteIsOpen,
  readEmail,
  readFamilySize,
  readJoin,
  readNewPassword,
  readName,
  salutation,
} from "./family";

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

describe("initialOf", () => {
  it("is the first letter of the first name, as a capital", () => {
    expect(initialOf("David Stührmann")).toBe("D");
    expect(initialOf("  özlem ")).toBe("Ö");
  });

  it("is nothing without a name", () => {
    expect(initialOf(null)).toBeNull();
    expect(initialOf("   ")).toBeNull();
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

describe("canLeave", () => {
  it("lets a member leave, but not the admin", () => {
    expect(canLeave("member")).toBe(true);
    expect(canLeave("admin")).toBe(false);
  });
});

describe("canRemove", () => {
  it("lets the admin remove everyone but themselves", () => {
    expect(canRemove("admin", { isSelf: false })).toBe(true);
    expect(canRemove("admin", { isSelf: true })).toBe(false);
  });

  it("lets nobody else remove anyone", () => {
    expect(canRemove("member", { isSelf: false })).toBe(false);
    expect(canRemove("member", { isSelf: true })).toBe(false);
  });
});

describe("readNewPassword", () => {
  it("takes a password of eight characters or more, typed the same twice", () => {
    expect(readNewPassword("geheim123", "geheim123")).toBeNull();
  });

  it("says when it is too short", () => {
    expect(readNewPassword("kurz", "kurz")).toBe("Das neue Passwort braucht mindestens 8 Zeichen.");
  });

  it("says when the two differ", () => {
    expect(readNewPassword("geheim123", "geheim124")).toBe(
      "Die beiden Passwörter sind nicht gleich.",
    );
  });
});

describe("readEmail", () => {
  it("takes an address without stray spaces and capitals", () => {
    expect(readEmail("  Lena@Example.org ")).toBe("lena@example.org");
  });

  it("is null for anything that is no address", () => {
    expect(readEmail("lena")).toBeNull();
    expect(readEmail("lena@example")).toBeNull();
    expect(readEmail("")).toBeNull();
  });
});

describe("readFamilySize", () => {
  it("takes one to twelve persons", () => {
    expect(readFamilySize("1")).toBe(1);
    expect(readFamilySize(" 4 ")).toBe(4);
    expect(readFamilySize("12")).toBe(12);
  });

  it("is null for nothing, none, too many and parts of a person", () => {
    expect(readFamilySize(null)).toBeNull();
    expect(readFamilySize("")).toBeNull();
    expect(readFamilySize("0")).toBeNull();
    expect(readFamilySize("13")).toBeNull();
    expect(readFamilySize("2.5")).toBeNull();
  });
});
