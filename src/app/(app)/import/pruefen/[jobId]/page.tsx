import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { normalizeName } from "@/domain/catalog";
import { UNITS } from "@/domain/units";
import { must } from "@/server/catalog";
import { loadReview } from "@/server/import/review";
import { createSessionClient } from "@/server/supabase/server";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Rezept prüfen" };

export default async function ReviewPage(props: PageProps<"/import/pruefen/[jobId]">) {
  const { jobId } = await props.params;
  const db = await createSessionClient();
  const [review, ingredients, waiting] = await Promise.all([
    loadReview(db, jobId),
    db.from("ingredient").select("name, synonyms").eq("status", "active").order("name"),
    db.from("import_job").select("id").eq("status", "needs_review").not("recipe_id", "is", null),
  ]);
  if (!review) notFound();
  const catalog = must(ingredients, "load ingredients");

  return (
    <ReviewForm
      // A new recipe gets a fresh form: nothing typed for the last one may carry over.
      key={review.jobId}
      review={review}
      waiting={must(waiting, "load review queue").length}
      ingredientNames={catalog.map((ingredient) => ingredient.name)}
      knownNames={catalog.flatMap((ingredient) =>
        [ingredient.name, ...ingredient.synonyms].map(normalizeName),
      )}
      units={[...UNITS]}
    />
  );
}
