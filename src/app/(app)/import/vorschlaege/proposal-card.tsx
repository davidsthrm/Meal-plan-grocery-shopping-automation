"use client";

import { useState, useTransition } from "react";
import type { OpenProposal } from "@/server/import/proposals";
import { decideProposal } from "../actions";

interface Option {
  id: string;
  name: string;
}

interface Props {
  proposal: OpenProposal;
  ingredients: Option[];
  aisleGroups: Option[];
  shops: Option[];
  units: string[];
}

const MODES = [
  { value: "none", label: "ohne Menge (z. B. ein Bund, ein Glas)" },
  { value: "count", label: "nach Stück" },
  { value: "weight", label: "nach Gewicht" },
  { value: "pack", label: "in Packungen" },
] as const;

/** One unknown ingredient with the decision the household has to make about it. */
export function ProposalCard({ proposal, ingredients, aisleGroups, shops, units }: Props) {
  const [kind, setKind] = useState<"same" | "new">(proposal.sameAsIngredientId ? "same" : "new");
  const [sameAs, setSameAs] = useState(proposal.sameAsIngredientId ?? "");
  const [name, setName] = useState(proposal.name);
  const [aisleGroupId, setAisleGroupId] = useState(proposal.aisleGroupId);
  const [shopId, setShopId] = useState(proposal.shopId);
  const [buyingMode, setBuyingMode] = useState(proposal.buyingMode);
  const [defaultUnit, setDefaultUnit] = useState<string>(proposal.defaultUnit);
  const [packSize, setPackSize] = useState(proposal.packSize?.toString() ?? "");
  const [staple, setStaple] = useState(proposal.isPantryStaple);
  const [shelfLife, setShelfLife] = useState(proposal.shelfLifeDays?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const decide = (decision: Parameters<typeof decideProposal>[1]) =>
    startTransition(async () => {
      const result = await decideProposal(proposal.id, decision);
      setError(result.error);
    });

  function accept() {
    if (kind === "same") {
      if (!sameAs) return setError("Bitte die Zutat wählen, die gemeint ist.");
      return decide({ kind: "same", ingredientId: sameAs });
    }
    decide({
      kind: "new",
      ingredient: {
        name,
        aisleGroupId,
        shopId,
        defaultUnit,
        buyingMode,
        packSize: packSize.trim() === "" ? null : Number(packSize.replace(",", ".")),
        isPantryStaple: staple,
        shelfLifeDays: shelfLife.trim() === "" ? null : Number(shelfLife),
      },
    });
  }

  const group = `kind-${proposal.id}`;
  return (
    <li className="card p-4">
      <h2 className="text-lg font-semibold">{proposal.name}</h2>
      {proposal.recipeTitles.length > 0 && (
        <p className="text-sm text-muted">Kommt vor in: {proposal.recipeTitles.join(", ")}</p>
      )}

      <div className="mt-3 space-y-3">
        <label className="flex min-h-10 items-center gap-2 font-semibold">
          <input
            type="radio"
            name={group}
            className="size-5 accent-accent"
            checked={kind === "same"}
            onChange={() => setKind("same")}
          />
          Ist dasselbe wie eine vorhandene Zutat
        </label>
        {kind === "same" && (
          <select
            aria-label="Vorhandene Zutat"
            className="field"
            value={sameAs}
            onChange={(event) => setSameAs(event.target.value)}
          >
            <option value="">Bitte wählen …</option>
            {ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name}
              </option>
            ))}
          </select>
        )}

        <label className="flex min-h-10 items-center gap-2 font-semibold">
          <input
            type="radio"
            name={group}
            className="size-5 accent-accent"
            checked={kind === "new"}
            onChange={() => setKind("new")}
          />
          Ist eine neue Zutat
        </label>
        {kind === "new" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`name-${proposal.id}`}>
                Name auf der Einkaufsliste
              </label>
              <input
                id={`name-${proposal.id}`}
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={`aisle-${proposal.id}`}>
                Regal
              </label>
              <select
                id={`aisle-${proposal.id}`}
                className="field"
                value={aisleGroupId}
                onChange={(event) => setAisleGroupId(event.target.value)}
              >
                {aisleGroups.map((aisle) => (
                  <option key={aisle.id} value={aisle.id}>
                    {aisle.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`shop-${proposal.id}`}>
                Laden
              </label>
              <select
                id={`shop-${proposal.id}`}
                className="field"
                value={shopId}
                onChange={(event) => setShopId(event.target.value)}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`mode-${proposal.id}`}>
                Wird gekauft
              </label>
              <select
                id={`mode-${proposal.id}`}
                className="field"
                value={buyingMode}
                onChange={(event) => setBuyingMode(event.target.value as typeof buyingMode)}
              >
                {MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`unit-${proposal.id}`}>
                Einheit in Rezepten
              </label>
              <select
                id={`unit-${proposal.id}`}
                className="field"
                value={defaultUnit}
                onChange={(event) => setDefaultUnit(event.target.value)}
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            {buyingMode === "pack" && (
              <div>
                <label className="label" htmlFor={`pack-${proposal.id}`}>
                  Packungsgröße in {defaultUnit}
                </label>
                <input
                  id={`pack-${proposal.id}`}
                  className="field"
                  inputMode="decimal"
                  value={packSize}
                  onChange={(event) => setPackSize(event.target.value)}
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor={`shelf-${proposal.id}`}>
                Hält sich (Tage, leer = lange)
              </label>
              <input
                id={`shelf-${proposal.id}`}
                className="field"
                inputMode="numeric"
                value={shelfLife}
                onChange={(event) => setShelfLife(event.target.value)}
              />
            </div>
            <label className="flex min-h-10 items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={staple}
                onChange={(event) => setStaple(event.target.checked)}
              />
              Haben wir meistens im Haus
            </label>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-warn-soft px-3 py-2 font-semibold text-warn">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={pending}
          onClick={accept}
        >
          {pending ? "Speichere …" : "Übernehmen"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => decide({ kind: "reject" })}
        >
          Nicht in den Katalog
        </button>
      </div>
    </li>
  );
}
