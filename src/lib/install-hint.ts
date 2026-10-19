/**
 * The hint to put the app on the home screen, shown in the browser until it is used or put
 * away. Safari on an iPhone or iPad cannot be asked to install: it is told where the
 * button is. Where the browser offers an install prompt (Android), the hint has a button
 * for it. In the installed app, and in a browser that offers neither, there is no hint.
 */

export const INSTALL_HINT_KEY = "installieren-weg";

export type InstallHint = "safari" | "prompt" | null;

export interface InstallSituation {
  /** Opened from the home screen already. */
  installed: boolean;
  /** Safari on an iPhone or iPad: the only browser with `navigator.standalone`. */
  safari: boolean;
  /** The browser handed over its install prompt (`beforeinstallprompt`). */
  canPrompt: boolean;
  /** Put away or used on this device before. */
  dismissed: boolean;
}

export function installHint(situation: InstallSituation): InstallHint {
  if (situation.installed || situation.dismissed) return null;
  if (situation.canPrompt) return "prompt";
  if (situation.safari) return "safari";
  return null;
}
