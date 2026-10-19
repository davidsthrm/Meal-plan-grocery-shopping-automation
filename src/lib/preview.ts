/**
 * A preview deployment on Vercel (every branch but `main`) works on the same Supabase project
 * as the app the family uses, so it could change the real household. There only the login of
 * the test household is let in (`PREVIEW_ONLY_EMAIL`), and without that setting nobody is.
 * Invitations are not taken there either: an account is made in the real app only.
 */
/** The settings read here: `VERCEL_ENV` and `PREVIEW_ONLY_EMAIL`. */
export type DeploymentEnv = Readonly<Record<string, string | undefined>>;

export const isPreview = (env: DeploymentEnv = process.env): boolean =>
  env.VERCEL_ENV === "preview";

/** Whether this address may be signed in on this deployment. */
export function mayUseDeployment(
  email: string | null | undefined,
  env: DeploymentEnv = process.env,
): boolean {
  if (!isPreview(env)) return true;
  const allowed = env.PREVIEW_ONLY_EMAIL?.trim().toLowerCase();
  return Boolean(allowed) && email?.trim().toLowerCase() === allowed;
}
