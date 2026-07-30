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

  const result = await api.uploadFiles(uploadable);

  if (result.error || !result.data) {
    // Log the whole error server-side; UploadThing's reason is often in `code`
    // or `data` rather than `message`.
    console.warn("[admin] uploadthing rejected an upload", result.error);

    const { code, message } = (result.error ?? {}) as {
      code?: string;
      message?: string;
    };

    return {
      ok: false,
      status: 502,
      error:
        [message, code && `(${code})`].filter(Boolean).join(" ") ||
        "UploadThing rejected the upload.",
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
