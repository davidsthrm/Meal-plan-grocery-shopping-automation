import { redirect } from "next/navigation";

/** The week plan is what the household opens the app for. */
export default function Home() {
  redirect("/woche");
}
