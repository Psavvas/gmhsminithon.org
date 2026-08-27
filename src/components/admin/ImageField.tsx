import { useRef, useState } from "react";

type ImageFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  uploadEndpoint: string;
  enabled: boolean;
  disabledReason?: string;
  inputId: string;
  describedBy?: string;
  maxBytes: number;
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renameForType(name: string, mimeType: string): string {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  return `${name.replace(/\.[^.]+$/, "") || "image"}.${extension}`;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), mimeType, quality),
  );
}

/**
 * Redraw an oversized photo at a smaller size until it fits. Files already
 * under the limit are returned untouched, so logos keep their exact bytes and
 * their transparency; SVG is vector and never resized.
 */
async function shrinkImageToFit(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || file.type === "image/svg+xml") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    // WebP keeps transparency and compresses better; Safari has supported it
    // since 14, and the JPEG path covers anything older.
    const mimeType = "image/webp";
    let scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext("2d");

      if (!context) {
        return file;
      }

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob =
        (await canvasToBlob(canvas, mimeType, 0.85)) ??
        (await canvasToBlob(canvas, "image/jpeg", 0.85));

      if (!blob) {
        return file;
      }

      if (blob.size <= maxBytes) {
        return new File([blob], renameForType(file.name, blob.type), {
          type: blob.type,
        });
      }

      scale *= 0.7;
    }

    return file;
  } catch {
    // Anything unexpected here just means the original gets uploaded and the
    // server explains itself.
    return file;
  }
}

export default function ImageField({
  label,
  value,
  onChange,
  uploadEndpoint,
  enabled,
  disabledReason,
  inputId,
  describedBy,
  maxBytes,
}: ImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File) => {
    if (!enabled || isUploading) {
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      // Photos straight off a phone routinely blow past the limit, so shrink
      // them here rather than bouncing the person back to a photo editor.
      const prepared = await shrinkImageToFit(file, maxBytes);

      if (prepared.size > maxBytes) {
        throw new Error(
          `That image is ${formatMegabytes(prepared.size)} and could not be shrunk below ${formatMegabytes(maxBytes)}. Try saving it smaller, or paste a link to it instead.`,
        );
      }

      // Sent as a raw body, not a form: Astro's CSRF middleware rejects
      // form-like content types whenever it cannot resolve the real host, which
      // is the default behind Vercel's proxy. The route does its own origin
      // check, and this header cannot be forged cross-origin.
      const response = await fetch(uploadEndpoint, {
        method: "POST",
        body: prepared,
        headers: {
          "Content-Type": prepared.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(prepared.name),
        },
        credentials: "same-origin",
      });

      // A rejection from the hosting platform (a too-large body, a timeout, a
      // crash) comes back as an HTML page, not our JSON. Say what it was rather
      // than swallowing it.
      const rawBody = await response.text();
      let payload: { url?: string; error?: string } | null = null;

      try {
        payload = JSON.parse(rawBody) as { url?: string; error?: string };
      } catch {
        payload = null;
      }

      if (!payload) {
        throw new Error(
          response.status === 413
            ? `The server refused the image because it is too large (HTTP 413), even after shrinking. Paste a link to it instead.`
            : `The server returned HTTP ${response.status} instead of a result${
                rawBody
                  ? `: ${rawBody
                      .replace(/<[^>]*>/g, " ")
                      .trim()
                      .slice(0, 200)}`
                  : "."
              }`,
        );
      }

      if (!response.ok || !payload.url) {
        throw new Error(
          payload.error ?? `The upload failed (HTTP ${response.status}).`,
        );
      }

      onChange(payload.url);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "The upload failed.",
      );
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="admin-image">
      {value ? (
        <div className="admin-image__preview">
          <img src={value} alt={`${label} preview`} loading="lazy" />
        </div>
      ) : (
        <div className="admin-image__placeholder" aria-hidden="true">
          No image yet
        </div>
      )}

      <div
        className={`admin-image__drop${isDragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          if (!enabled) {
            return;
          }

          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          if (!enabled) {
            return;
          }

          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer?.files?.[0];

          if (file) {
            void upload(file);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="admin-image__input"
          id={`${inputId}-file`}
          disabled={!enabled || isUploading}
          onChange={(event) => {
            const file = event.target.files?.[0];

            if (file) {
              void upload(file);
            }
          }}
        />
        <label
          className="admin-button admin-button--ghost admin-button--small"
          htmlFor={`${inputId}-file`}
        >
          {isUploading
            ? "Uploading…"
            : value
              ? "Replace image"
              : "Upload image"}
        </label>
        <span className="admin-image__hint">
          {enabled
            ? "or drag an image here"
            : (disabledReason ??
              "Image uploads are not configured yet, but you can paste a link below.")}
        </span>
        {value && (
          <button
            type="button"
            className="admin-button admin-button--ghost admin-button--small"
            onClick={() => onChange("")}
          >
            Remove
          </button>
        )}
      </div>

      <input
        type="url"
        id={inputId}
        className="admin-input"
        value={value}
        placeholder="https://…"
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />

      {uploadError && (
        <p className="admin-field__error" role="alert">
          {uploadError}
        </p>
      )}
    </div>
  );
}
