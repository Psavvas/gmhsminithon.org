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

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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
