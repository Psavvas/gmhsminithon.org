/**
 * Image uploads for the admin portal, stored on UploadThing.
 *
 * The UploadThing token stays on the server: the browser posts the file to our
 * own API route, which forwards it with the UploadThing SDK.
 */
import { UTApi } from "uploadthing/server";
import { readEnv } from "../env";

/**
 * The file is posted to our own API route first, and a serverless function on
 * Vercel refuses request bodies over 4.5 MB before our code ever runs — so the
 * ceiling here is deliberately under that, to fail with a message instead of a
 * platform error page.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
]);

let cachedToken: string | undefined;
let cachedApi: UTApi | undefined;

export function getUploadThingToken(): string | undefined {
  return readEnv("UPLOADTHING_TOKEN");
}

export type UploadThingTokenStatus =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * UploadThing v7 wants a token that base64-decodes to
 * `{ apiKey, appId, regions }`. The `sk_live_…` secret key is only the `apiKey`
 * field inside it, so pasting that alone can never work — and the SDK's own
 * error for it is not obvious. Check the shape up front and say what to do.
 */
export function inspectUploadThingToken(): UploadThingTokenStatus {
  const token = getUploadThingToken();

  if (!token) {
    return {
      ok: false,
      reason: readEnv("UPLOADTHING_SECRET")
        ? "UPLOADTHING_SECRET is set, but uploads need UPLOADTHING_TOKEN — the long token from the UploadThing dashboard's API Keys tab, not the sk_live_… secret key."
        : "UPLOADTHING_TOKEN is not set.",
    };
  }

  if (/^sk_(live|test)_/i.test(token)) {
    return {
      ok: false,
      reason:
        "That value is an API key (sk_live_…), not the token. In the UploadThing dashboard open API Keys and copy the value labelled UPLOADTHING_TOKEN.",
    };
  }

  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized)) as {
      apiKey?: string;
      appId?: string;
      regions?: unknown;
    };

    if (!decoded.apiKey || !decoded.appId || !Array.isArray(decoded.regions)) {
      throw new Error("missing fields");
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      reason:
        "UPLOADTHING_TOKEN could not be read. Copy it again from the UploadThing dashboard (API Keys → UPLOADTHING_TOKEN) and redeploy — it should be one long string with no quotes around it.",
    };
  }
}

export function isUploadThingConfigured(): boolean {
  return inspectUploadThingToken().ok;
}

function getApi(): UTApi | null {
  const token = getUploadThingToken();

  if (!token) {
    return null;
  }

  if (!cachedApi || cachedToken !== token) {
    cachedApi = new UTApi({ token, logLevel: "Error" });
    cachedToken = token;
  }

  return cachedApi;
}

/**
 * UploadThing collapses every upload failure into `UPLOAD_FAILED` with no
 * cause attached, so a bad token and a failed transfer look identical. Reading
 * the account's usage info is a cheap, separate call that does surface a real
 * error, which tells the two apart.
 */
export type UploadThingCheck =
  | { ok: true; filesUploaded: number }
  | { ok: false; error: string };

function describeUploadThingError(error: unknown): string {
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: string; message?: string };

    if (message || code) {
      return [message, code && `(${code})`].filter(Boolean).join(" ");
    }
  }

  return error instanceof Error ? error.message : String(error);
}

export async function checkUploadThingConnection(): Promise<UploadThingCheck> {
  const tokenStatus = inspectUploadThingToken();

  if (!tokenStatus.ok) {
    return { ok: false, error: tokenStatus.reason };
  }

  const api = getApi();

  if (!api) {
    return { ok: false, error: "UploadThing is not configured." };
  }

  try {
    const usage = await Promise.race([
      api.getUsageInfo(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("UploadThing did not respond in time.")),
          6000,
        ),
      ),
    ]);

    return { ok: true, filesUploaded: usage.filesUploaded };
  } catch (error) {
    return { ok: false, error: describeUploadThingError(error) };
  }
}

type HttpFailure = {
  host: string;
  url: string;
  status: number;
  body: string;
};

/**
 * The SDK uploads by PUTting to a presigned URL on the ingest host, and turns
 * any non-2xx into a bare `UPLOAD_FAILED` — the underlying response is attached
 * as `cause`, which does not survive serialization. Wrapping fetch is the only
 * way to see what that request actually returned.
 *
 * The user-facing message gets the host and status only; the full URL carries a
 * presigned signature, so that goes to the server log instead.
 */
function createInstrumentedFetch(failures: HttpFailure[]) {
  return async (input: unknown, init?: unknown): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : ((input as Request)?.url ?? String(input));

    const record = (status: number, body: string) => {
      let host = url;

      try {
        host = new URL(url).host;
      } catch {
        // Keep the raw value if it is not a parseable URL.
      }

      failures.push({ host, url, status, body });
      console.warn("[admin] uploadthing request failed", { url, status, body });
    };

    try {
      const response = await fetch(input as RequestInfo, init as RequestInit);

      if (!response.ok) {
        let body = "";

        try {
          body = (await response.clone().text()).slice(0, 300);
        } catch {
          // A body we cannot read is not worth failing over.
        }

        record(response.status, body);
      }

      return response;
    } catch (error) {
      record(0, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}

function describeHttpFailure(failure: HttpFailure): string {
  const what =
    failure.status > 0
      ? `HTTP ${failure.status}`
      : "the request never completed";

  return `${failure.host} returned ${what}${failure.body ? `: ${failure.body}` : ""}`;
}

/** Keep the stored filename readable but harmless. */
function safeFileName(name: string, mimeType: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "upload")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  if (base && base.includes(".")) {
    return base;
  }

  const extension = mimeType.split("/")[1]?.replace("+xml", "") ?? "png";
  return `${base || "upload"}.${extension}`;
}

export type UploadOutcome =
  | { ok: true; url: string; key: string; name: string; size: number }
  | { ok: false; status: number; error: string };

export async function uploadImage(file: File): Promise<UploadOutcome> {
  if (!file || typeof file === "string") {
    return { ok: false, status: 400, error: "Choose an image to upload." };
  }

  if (file.size === 0) {
    return { ok: false, status: 400, error: "That file is empty." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `Images must be under ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
    };
  }

  const mimeType = (file.type || "").toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      status: 415,
      error: "Only PNG, JPEG, WebP, AVIF, GIF, and SVG images can be uploaded.",
    };
  }

  const tokenStatus = inspectUploadThingToken();

  if (!tokenStatus.ok) {
    return { ok: false, status: 503, error: tokenStatus.reason };
  }

  const api = getApi();

  if (!api) {
    return {
      ok: false,
      status: 503,
      error:
        "Image uploads are not configured yet. Add UPLOADTHING_TOKEN in Vercel to turn them on.",
    };
  }

  const fileName = safeFileName(file.name, mimeType);
  const uploadable = new File([await file.arrayBuffer()], fileName, {
    type: mimeType,
  });

  // A per-upload client so its fetch wrapper can record what went wrong.
  const failures: HttpFailure[] = [];
  const instrumented = new UTApi({
    token: getUploadThingToken(),
    logLevel: "Error",
    fetch: createInstrumentedFetch(failures) as never,
  });

  const result = await instrumented.uploadFiles(uploadable);

  if (result.error || !result.data) {
    console.warn("[admin] uploadthing rejected an upload", result.error);

    // `UPLOAD_FAILED` says nothing on its own. The wrapped fetch usually caught
    // the real response; fall back to probing the credentials if it did not.
    const lastFailure = failures[failures.length - 1];

    if (lastFailure) {
      return {
        ok: false,
        status: 502,
        error: `Upload rejected — ${describeHttpFailure(lastFailure)}`,
      };
    }

    const connection = await checkUploadThingConnection();

    if (!connection.ok) {
      return {
        ok: false,
        status: 502,
        error: `UploadThing rejected the credentials: ${connection.error}. Check UPLOADTHING_TOKEN in Vercel — it is the token from the API Keys tab, not the sk_live_… secret key — then redeploy.`,
      };
    }

    return {
      ok: false,
      status: 502,
      error: `${describeUploadThingError(result.error)}. The credentials work, so the file transfer itself failed — try a smaller image, or a PNG/JPEG if this was something else.`,
    };
  }

  const { data } = result;
  const url = data.ufsUrl ?? (data as { url?: string }).url;

  if (!url) {
    return {
      ok: false,
      status: 502,
      error: "UploadThing did not return a URL for the image.",
    };
  }

  return {
    ok: true,
    url,
    key: data.key,
    name: data.name ?? fileName,
    size: data.size ?? uploadable.size,
  };
}
