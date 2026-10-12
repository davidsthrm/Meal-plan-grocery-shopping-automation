import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TypedRecipeForm } from "@/components/typed-recipe-form";
import { loadLibrary } from "@/server/library";
import { loadRecipeForm } from "@/server/recipes";
import { createSessionClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Rezept ändern" };

export default async function EditRecipePage(props: PageProps<"/rezepte/[id]/bearbeiten">) {
  const { id } = await props.params;
  const db = await createSessionClient();
  const [form, library] = await Promise.all([loadRecipeForm(db, id), loadLibrary(db)]);
  if (!form) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/rezepte/${id}`} className="link text-sm">
        ← Zum Rezept
      </Link>
      <h1 className="title mt-3">Rezept ändern</h1>
      {!form.typed && (
        <p className="mt-2 text-muted">
          Die Zutaten stammen vom Foto und bleiben, wie sie eingelesen wurden.
        </p>
      )}
      <div className="mt-5">
        <TypedRecipeForm
          initial={form.values}
          categories={library.categories}
          recipeId={id}
          submitLabel="Speichern"
        />
      </div>
    </div>
  );
}
