/**
 * Looks for the supermarkets near a postal code exactly as the settings page does, step by
 * step, without touching the database: `npm run supermarkets:search -- 88471`.
 */
import { readPostalCode } from "../src/domain/supermarket-search";
import { searchSupermarkets } from "../src/server/supermarket-search";

const postalCode = readPostalCode(process.argv[2] ?? "");
if (!postalCode) {
  console.error("Eine Postleitzahl mit fünf Ziffern, z. B. npm run supermarkets:search -- 88471");
  process.exit(1);
}
async function main(): Promise<void> {
  try {
    const found = await searchSupermarkets(postalCode as string, (step) => console.log(step));
    if (!found) process.exit(1);
    console.log(`\nIn ${found.place ?? postalCode}:`);
    for (const shop of found.supermarkets) {
      console.log(
        `  ${shop.name.padEnd(28)} ${shop.distanceKm.toFixed(1)} km  ${shop.address ?? ""}\n    Logo: ${shop.logoUrl ?? "keins"}`,
      );
    }
  } catch (error) {
    console.error(`\nFehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

void main();
