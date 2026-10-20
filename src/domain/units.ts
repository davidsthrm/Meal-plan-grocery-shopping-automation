/**
 * Units a recipe line or a shopping line may use. The German abbreviations are data:
 * they are what cookbooks print and what the household writes.
 */

/** Grams per unit. */
const MASS = { g: 1, kg: 1000 } as const;
/** Millilitres per unit. EL and TL follow the German kitchen convention. */
const VOLUME = { ml: 1, l: 1000, TL: 5, EL: 15 } as const;

export const COUNT_UNITS = [
  "Stück",
  "Zehe",
  "Bund",
  "Stängel",
  "Zweig",
  "Blatt",
  "Scheibe",
  "Dose",
  "Glas",
  "Becher",
  "Packung",
  "Beutel",
  "Würfel",
  "Kopf",
  "Knolle",
  "Stange",
  "Prise",
  "Msp",
  "Handvoll",
] as const;

export type MassUnit = keyof typeof MASS;
export type VolumeUnit = keyof typeof VOLUME;
export type CountUnit = (typeof COUNT_UNITS)[number];
export type Unit = MassUnit | VolumeUnit | CountUnit;

export const UNITS: readonly Unit[] = [
  ...(Object.keys(MASS) as MassUnit[]),
  ...(Object.keys(VOLUME) as VolumeUnit[]),
  ...COUNT_UNITS,
];

/** Amounts are only ever summed within one dimension. Every counted unit is its own. */
export type Dimension = "mass" | "volume" | CountUnit;

export interface Amount {
  quantity: number;
  unit: Unit;
}

/**
 * Ingredient-specific conversion data: grams per one counted unit, or grams per ml (density).
 * Without it, counts, weights and volumes of an ingredient do not convert into each other.
 */
export type GramsPer = Partial<Record<CountUnit | "ml", number>>;

export function isUnit(value: string): value is Unit {
  return (UNITS as readonly string[]).includes(value);
}

function isMass(unit: Unit): unit is MassUnit {
  return unit in MASS;
}

function isVolume(unit: Unit): unit is VolumeUnit {
  return unit in VOLUME;
}

export function dimensionOf(unit: Unit): Dimension {
  if (isMass(unit)) return "mass";
  if (isVolume(unit)) return "volume";
  return unit;
}

/** The unit sums of a dimension are kept in: g, ml, or the counted unit itself. */
export function baseUnitOf(dimension: Dimension): Unit {
  if (dimension === "mass") return "g";
  if (dimension === "volume") return "ml";
  return dimension;
}

function toGrams(quantity: number, unit: Unit, gramsPer: GramsPer): number | null {
  if (isMass(unit)) return quantity * MASS[unit];
  if (isVolume(unit)) {
    return gramsPer.ml === undefined ? null : quantity * VOLUME[unit] * gramsPer.ml;
  }
  const perUnit = gramsPer[unit];
  return perUnit === undefined ? null : quantity * perUnit;
}

function fromGrams(grams: number, unit: Unit, gramsPer: GramsPer): number | null {
  if (isMass(unit)) return grams / MASS[unit];
  if (isVolume(unit)) {
    return gramsPer.ml === undefined ? null : grams / gramsPer.ml / VOLUME[unit];
  }
  const perUnit = gramsPer[unit];
  return perUnit === undefined ? null : grams / perUnit;
}

/**
 * Converts a quantity between units. Returns null when there is no known path, so the caller
 * can keep the amounts apart instead of guessing.
 */
export function convert(
  quantity: number,
  from: Unit,
  to: Unit,
  gramsPer: GramsPer = {},
): number | null {
  if (from === to) return quantity;
  if (isMass(from) && isMass(to)) return (quantity * MASS[from]) / MASS[to];
  if (isVolume(from) && isVolume(to)) return (quantity * VOLUME[from]) / VOLUME[to];
  const grams = toGrams(quantity, from, gramsPer);
  return grams === null ? null : fromGrams(grams, to, gramsPer);
}

/** Removes binary floating point noise from sums such as 0.1 + 0.2. */
export function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

const UNIT_ALIASES: Record<string, Unit> = {
  g: "g",
  gr: "g",
  gramm: "g",
  kg: "kg",
  kilo: "kg",
  ml: "ml",
  l: "l",
  liter: "l",
  el: "EL",
  essl: "EL",
  esslöffel: "EL",
  tl: "TL",
  teel: "TL",
  teelöffel: "TL",
  stück: "Stück",
  stücke: "Stück",
  stk: "Stück",
  st: "Stück",
  zehe: "Zehe",
  zehen: "Zehe",
  bund: "Bund",
  bd: "Bund",
  stängel: "Stängel",
  stängeln: "Stängel",
  stengel: "Stängel",
  stengeln: "Stängel",
  // Cookbooks print "2 Stiele Petersilie": a stalk is a Stängel.
  stiel: "Stängel",
  stiele: "Stängel",
  stielen: "Stängel",
  zweig: "Zweig",
  zweige: "Zweig",
  blatt: "Blatt",
  blätter: "Blatt",
  scheibe: "Scheibe",
  scheiben: "Scheibe",
  dose: "Dose",
  dosen: "Dose",
  glas: "Glas",
  gläser: "Glas",
  becher: "Becher",
  packung: "Packung",
  packungen: "Packung",
  pck: "Packung",
  pkg: "Packung",
  päckchen: "Packung",
  x: "Packung",
  beutel: "Beutel",
  würfel: "Würfel",
  kopf: "Kopf",
  köpfe: "Kopf",
  knolle: "Knolle",
  knollen: "Knolle",
  stange: "Stange",
  stangen: "Stange",
  prise: "Prise",
  prisen: "Prise",
  msp: "Msp",
  messerspitze: "Msp",
  handvoll: "Handvoll",
};

/**
 * Reads a unit as people write it ("Dosen", "Pck.", "El", "x"). Returns null for anything
 * that is not a unit, including ingredient names.
 */
export function parseUnit(text: string): Unit | null {
  const key = text.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[key] ?? null;
}
