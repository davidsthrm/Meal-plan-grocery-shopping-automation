import { FAMILY_SIZES } from "@/domain/family";

/** For how many the household cooks: the persons a meal is planned for. */
export function FamilySizeField({ size }: { size: number }) {
  return (
    <label className="block">
      <span className="label">Personen im Haushalt</span>
      <select name="personen" defaultValue={String(size)} className="field w-40">
        {FAMILY_SIZES.map((count) => (
          <option key={count} value={count}>
            {count === 1 ? "1 Person" : `${count} Personen`}
          </option>
        ))}
      </select>
    </label>
  );
}
