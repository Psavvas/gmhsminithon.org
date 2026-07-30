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

    if (file.size > maxBytes) {
      setUploadError(
        `That image is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Images have to be under ${Math.round(maxBytes / (1024 * 1024))} MB — resize it and try again.`,
      );
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? "The upload failed.");
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
        className={`admin-image__drop${isDragging ? "is-dragging" : ""}`}
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
