/** The value after `--<name>` on the command line, or undefined when it is not given. */
export function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : args[at + 1];
}

/** Whether `--<name>` is on the command line. */
export function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
