import { redirect } from "next/navigation";

/** Until the week planner exists, the recipes are the start page. */
export default function Home() {
  redirect("/rezepte");
}
