import { useMemo, useState } from "react";
import { renderContentMarkdown } from "../../utils/markdown";

type MarkdownFieldProps = {
  value: string;
  onChange: (value: string) => void;
  inputId: string;
  describedBy?: string;
  invalid: boolean;
  rows: number;
  placeholder?: string;
};

/**
 * A Markdown textarea with a preview tab.
 *
 * The preview runs `renderContentMarkdown` — the same function that renders
 * this text on the public site — so what it shows is what the page will do,
 * including the parts of Markdown this renderer deliberately does not support.
 */
export default function MarkdownField({
  value,
  onChange,
  inputId,
  describedBy,
  invalid,
  rows,
  placeholder,
}: MarkdownFieldProps) {
  const [showPreview, setShowPreview] = useState(false);

  // Rendering is cheap, but this keeps it off every unrelated re-render.
  const html = useMemo(
    () => (showPreview ? renderContentMarkdown(value) : ""),
    [showPreview, value],
  );

  return (
    <div className="admin-markdown-field">
      <div className="admin-tabs" role="group" aria-label="Editing mode">
        <button
          type="button"
          className={`admin-tab${showPreview ? "" : " is-active"}`}
          aria-pressed={!showPreview}
          onClick={() => setShowPreview(false)}
        >
          Write
        </button>
        <button
          type="button"
          className={`admin-tab${showPreview ? " is-active" : ""}`}
          aria-pressed={showPreview}
          onClick={() => setShowPreview(true)}
        >
          Preview
        </button>
      </div>

      {/*
        Hidden rather than unmounted, so switching back to Write keeps the
        caret and scroll position where they were.
      */}
      <textarea
        id={inputId}
        className={`admin-input admin-textarea${invalid ? " is-invalid" : ""}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        hidden={showPreview}
        onChange={(event) => onChange(event.target.value)}
      />

      {showPreview &&
        (value.trim() ? (
          // The renderer escapes every character of input before formatting it
          // and drops link targets that are not http(s)/mailto/tel/relative, so
          // this markup is the same trusted output the site renders.
          <div
            className="admin-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="admin-markdown admin-markdown--empty">
            Nothing to preview yet.
          </p>
        ))}
    </div>
  );
}
