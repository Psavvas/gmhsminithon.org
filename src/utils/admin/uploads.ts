/**
 * Image uploads for the admin portal, stored on UploadThing.
 *
 * The UploadThing token stays on the server: the browser posts the file to our
 * own API route, which forwards it with the UploadThing SDK.
 */
import { UTApi } from "uploadthing/server";
import { readFirstEnv } from "../env";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
  return readFirstEnv(["UPLOADTHING_TOKEN", "UPLOADTHING_SECRET"]);
}

export function isUploadThingConfigured(): boolean {
  return Boolean(getUploadThingToken());
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
    return {
      ok: false,
      status: 502,
      error: result.error?.message ?? "UploadThing rejected the upload.",
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
