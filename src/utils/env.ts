/**
 * Environment variable access that works in both the Astro build (import.meta.env)
 * and the Vercel serverless runtime (process.env).
 */
export function readEnv(name: string): string | undefined {
  const fromProcess =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  const value =
    fromProcess ??
    (import.meta.env as Record<string, string | undefined>)[name];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = stripSurroundingQuotes(value.trim());
  return trimmed ? trimmed : undefined;
}

/**
 * Values pasted into a hosting dashboard often keep the quotes they had in a
 * `.env` file. Quotes are never part of the value we want.
 */
export function stripSurroundingQuotes(value: string): string {
  const match = value.match(/^(["'])([\s\S]*)\1$/);
  return match ? match[2].trim() : value;
}

export function readFirstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = readEnv(name);

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function readBooleanEnv(name: string): boolean {
  return readEnv(name)?.toLowerCase() === "true";
}
