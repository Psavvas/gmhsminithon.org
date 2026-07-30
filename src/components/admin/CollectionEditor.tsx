import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyListItem,
  formatFieldPath,
  validateCollection,
  type ClientCollectionSpec,
  type FieldSpec,
  type ListFieldSpec,
  type ObjectFieldSpec,
  type StringListFieldSpec,
  type ValidationIssue,
} from "../../utils/content/fieldSpec";
import ImageField from "./ImageField";

type Path = Array<string | number>;

type EditorContext = {
  issues: Map<string, string[]>;
  onChange: (path: Path, value: unknown) => void;
  uploadEndpoint: string;
  uploadsEnabled: boolean;
  openRowsByDefault: (
    listPath: string,
    count: number,
    index: number,
  ) => boolean;
};

type CollectionEditorProps = {
  spec: ClientCollectionSpec;
  initialData: unknown;
  contentEndpoint: string;
  uploadEndpoint: string;
  canSave: boolean;
  saveDisabledReason?: string;
  uploadsEnabled: boolean;
  initialSource: "database" | "bundled";
  initialUpdatedAt: string | null;
};

function updateAt(target: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) {
    return value;
  }

  const [head, ...rest] = path;

  if (typeof head === "number") {
    const items = Array.isArray(target) ? [...target] : [];
    items[head] = updateAt(items[head], rest, value);
    return items;
  }

  const object =
    target && typeof target === "object" && !Array.isArray(target)
      ? { ...(target as Record<string, unknown>) }
      : {};
  object[head] = updateAt(object[head], rest, value);
  return object;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

function domId(path: Path): string {
  const formatted = formatFieldPath(path) || "root";
  return `admin-field-${formatted.replace(/[^A-Za-z0-9]+/g, "-")}`;
}

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasContent);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some(hasContent);
  }

  if (typeof value === "boolean") {
    return false;
  }

  return asText(value).trim() !== "";
}

function countIssuesUnder(
  prefix: string,
  issues: Map<string, string[]>,
): number {
  let total = 0;

  for (const [path, messages] of issues) {
    if (
      path === prefix ||
      path.startsWith(`${prefix}.`) ||
      path.startsWith(`${prefix}[`)
    ) {
      total += messages.length;
    }
  }

  return total;
}

function FieldErrors({ messages, id }: { messages: string[]; id: string }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <p className="admin-field__error" id={id} role="alert">
      {messages.join(" ")}
    </p>
  );
}

function Field({
  spec,
  value,
  path,
  ctx,
}: {
  spec: FieldSpec;
  value: unknown;
  path: Path;
  ctx: EditorContext;
}) {
  const pathKey = formatFieldPath(path);
  const messages = ctx.issues.get(pathKey) ?? [];
  const inputId = domId(path);
  const helpId = spec.help ? `${inputId}-help` : undefined;
  const errorId = messages.length > 0 ? `${inputId}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = messages.length > 0;

  if (spec.kind === "object") {
    return <ObjectFields spec={spec} value={value} path={path} ctx={ctx} />;
  }

  if (spec.kind === "list") {
    return <ListField spec={spec} value={value} path={path} ctx={ctx} />;
  }

  if (spec.kind === "stringList") {
    return <StringListField spec={spec} value={value} path={path} ctx={ctx} />;
  }

  if (spec.kind === "boolean") {
    return (
      <div className="admin-field admin-field--check">
        <label className="admin-check" htmlFor={inputId}>
          <input
            id={inputId}
            type="checkbox"
            checked={value === true}
            aria-describedby={describedBy}
            onChange={(event) => ctx.onChange(path, event.target.checked)}
          />
          <span>{spec.label}</span>
        </label>
        {spec.help && (
          <p className="admin-field__help" id={helpId}>
            {spec.help}
          </p>
        )}
        <FieldErrors messages={messages} id={errorId ?? `${inputId}-error`} />
      </div>
    );
  }

  return (
    <div className="admin-field">
      <label className="admin-field__label" htmlFor={inputId}>
        {spec.label}
        {"required" in spec && spec.required && (
          <span className="admin-field__required" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {spec.kind === "number" ? (
        <div className="admin-input-group">
          {spec.prefix && (
            <span className="admin-input-group__prefix" aria-hidden="true">
              {spec.prefix}
            </span>
          )}
          <input
            id={inputId}
            className={`admin-input${invalid ? "is-invalid" : ""}`}
            type="number"
            inputMode="decimal"
            step={spec.step ?? (spec.integer ? 1 : "any")}
            min={spec.min}
            max={spec.max}
            value={asText(value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => ctx.onChange(path, event.target.value)}
          />
        </div>
      ) : spec.kind === "select" ? (
        spec.allowOther ? (
          <>
            <input
              id={inputId}
              className={`admin-input${invalid ? "is-invalid" : ""}`}
              list={`${inputId}-options`}
              value={asText(value)}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(event) => ctx.onChange(path, event.target.value)}
            />
            <datalist id={`${inputId}-options`}>
              {spec.options.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </>
        ) : (
          <select
            id={inputId}
            className={`admin-input${invalid ? "is-invalid" : ""}`}
            value={asText(value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => ctx.onChange(path, event.target.value)}
          >
            <option value="">Choose…</option>
            {spec.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      ) : spec.kind === "image" ? (
        <ImageField
          label={spec.label}
          value={asText(value)}
          onChange={(next) => ctx.onChange(path, next)}
          uploadEndpoint={ctx.uploadEndpoint}
          enabled={ctx.uploadsEnabled}
          inputId={inputId}
          describedBy={describedBy}
        />
      ) : spec.kind === "textarea" || spec.kind === "markdown" ? (
        <>
          <textarea
            id={inputId}
            className={`admin-input admin-textarea${invalid ? "is-invalid" : ""}`}
            rows={spec.rows ?? 4}
            value={asText(value)}
            placeholder={spec.placeholder}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            onChange={(event) => ctx.onChange(path, event.target.value)}
          />
          {spec.kind === "markdown" && (
            <p className="admin-field__help">
              Formatting: <code>**bold**</code>, <code>*italic*</code>,{" "}
              <code>- bullet</code>, <code>[link](https://…)</code>
            </p>
          )}
        </>
      ) : (
        <input
          id={inputId}
          className={`admin-input${invalid ? "is-invalid" : ""}`}
          type={
            spec.kind === "date"
              ? "date"
              : spec.kind === "email"
                ? "email"
                : spec.kind === "url"
                  ? "url"
                  : "text"
          }
          value={asText(value)}
          placeholder={spec.placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => ctx.onChange(path, event.target.value)}
        />
      )}

      {spec.help && (
        <p className="admin-field__help" id={helpId}>
          {spec.help}
        </p>
      )}
      <FieldErrors messages={messages} id={errorId ?? `${inputId}-error`} />
    </div>
  );
}

function ObjectFields({
  spec,
  value,
  path,
  ctx,
  bare = false,
}: {
  spec: ObjectFieldSpec;
  value: unknown;
  path: Path;
  ctx: EditorContext;
  bare?: boolean;
}) {
  const record = asRecord(value);
  const fields = (
    <div className="admin-fields">
      {Object.entries(spec.fields).map(([key, fieldSpec]) => (
        <Field
          key={key}
          spec={fieldSpec}
          value={record[key]}
          path={[...path, key]}
          ctx={ctx}
        />
      ))}
    </div>
  );

  if (bare) {
    return fields;
  }

  return (
    <fieldset className="admin-fieldset">
      <legend>{spec.label}</legend>
      {spec.help && <p className="admin-field__help">{spec.help}</p>}
      {fields}
    </fieldset>
  );
}

function StringListField({
  spec,
  value,
  path,
  ctx,
}: {
  spec: StringListFieldSpec;
  value: unknown;
  path: Path;
  ctx: EditorContext;
}) {
  const items = asList(value).map(asText);
  const pathKey = formatFieldPath(path);
  const messages = ctx.issues.get(pathKey) ?? [];

  const replace = (nextItems: string[]) => ctx.onChange(path, nextItems);

  return (
    <fieldset className="admin-fieldset">
      <legend>{spec.label}</legend>
      {spec.help && <p className="admin-field__help">{spec.help}</p>}

      {items.length === 0 && <p className="admin-empty">Nothing here yet.</p>}

      <div className="admin-stringlist">
        {items.map((item, index) => {
          const itemPathKey = formatFieldPath([...path, index]);
          const itemMessages = ctx.issues.get(itemPathKey) ?? [];
          const itemId = domId([...path, index]);

          return (
            <div className="admin-stringlist__row" key={index}>
              <label className="admin-visually-hidden" htmlFor={itemId}>
                {`${spec.itemLabel} ${index + 1}`}
              </label>
              {spec.itemKind === "textarea" ? (
                <textarea
                  id={itemId}
                  className={`admin-input admin-textarea${itemMessages.length ? "is-invalid" : ""}`}
                  rows={3}
                  value={item}
                  placeholder={spec.placeholder}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = event.target.value;
                    replace(next);
                  }}
                />
              ) : (
                <input
                  id={itemId}
                  className={`admin-input${itemMessages.length ? "is-invalid" : ""}`}
                  type={spec.itemKind === "url" ? "url" : "text"}
                  value={item}
                  placeholder={spec.placeholder}
                  onChange={(event) => {
                    const next = [...items];
                    next[index] = event.target.value;
                    replace(next);
                  }}
                />
              )}
              <div className="admin-stringlist__actions">
                <button
                  type="button"
                  className="admin-button admin-button--ghost admin-button--small"
                  disabled={index === 0}
                  aria-label={`Move ${spec.itemLabel} ${index + 1} up`}
                  onClick={() => {
                    const next = [...items];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    replace(next);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--ghost admin-button--small"
                  disabled={index === items.length - 1}
                  aria-label={`Move ${spec.itemLabel} ${index + 1} down`}
                  onClick={() => {
                    const next = [...items];
                    [next[index], next[index + 1]] = [
                      next[index + 1],
                      next[index],
                    ];
                    replace(next);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-button admin-button--danger admin-button--small"
                  aria-label={`Remove ${spec.itemLabel} ${index + 1}`}
                  onClick={() => replace(items.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </div>
              {itemMessages.length > 0 && (
                <FieldErrors messages={itemMessages} id={`${itemId}-error`} />
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="admin-button admin-button--ghost"
        onClick={() => replace([...items, ""])}
      >
        + Add {spec.itemLabel.toLowerCase()}
      </button>

      <FieldErrors messages={messages} id={`${domId(path)}-error`} />
    </fieldset>
  );
}

function ListField({
  spec,
  value,
  path,
  ctx,
}: {
  spec: ListFieldSpec;
  value: unknown;
  path: Path;
  ctx: EditorContext;
}) {
  const items = asList(value);
  const pathKey = formatFieldPath(path);
  const messages = ctx.issues.get(pathKey) ?? [];
  const rowsRef = useRef<HTMLDivElement>(null);
  const [scrollToIndex, setScrollToIndex] = useState<number | null>(null);

  const replace = (nextItems: unknown[]) => ctx.onChange(path, nextItems);

  const addRow = () => {
    replace([...items, emptyListItem(spec)]);
    setScrollToIndex(items.length);
  };

  // Bring a freshly added row into view; it is appended at the end of the list.
  useEffect(() => {
    if (scrollToIndex === null) {
      return;
    }

    const row = rowsRef.current?.children[scrollToIndex] as
      | HTMLElement
      | undefined;
    row?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollToIndex(null);
  }, [scrollToIndex]);

  return (
    <fieldset className="admin-fieldset admin-fieldset--list">
      <legend>
        {spec.label}
        <span className="admin-count">{items.length}</span>
      </legend>
      {spec.help && <p className="admin-field__help">{spec.help}</p>}

      {items.length === 0 && (
        <p className="admin-empty">
          No {spec.label.toLowerCase()} yet. Use the button below to add the
          first one.
        </p>
      )}

      <div className="admin-rows" ref={rowsRef}>
        {items.map((item, index) => {
          const record = asRecord(item);
          const rowPath = [...path, index];
          const rowPathKey = formatFieldPath(rowPath);
          const rowIssueCount = countIssuesUnder(rowPathKey, ctx.issues);
          const openByDefault = ctx.openRowsByDefault(
            pathKey,
            items.length,
            index,
          );
          const title =
            (spec.titleField && asText(record[spec.titleField])) ||
            `${spec.itemLabel} ${index + 1}`;
          const subtitle = spec.subtitleField
            ? asText(record[spec.subtitleField])
            : "";

          return (
            <details
              className="admin-row"
              key={index}
              open={openByDefault || rowIssueCount > 0 || undefined}
            >
              <summary className="admin-row__summary">
                <span className="admin-row__title">{title}</span>
                {subtitle && (
                  <span className="admin-row__subtitle">{subtitle}</span>
                )}
                {rowIssueCount > 0 && (
                  <span className="admin-badge admin-badge--error">
                    {rowIssueCount} to fix
                  </span>
                )}
              </summary>

              <div className="admin-row__body">
                <ObjectFields
                  spec={{
                    kind: "object",
                    label: spec.itemLabel,
                    fields: spec.fields,
                  }}
                  value={item}
                  path={rowPath}
                  ctx={ctx}
                  bare
                />

                <div className="admin-row__actions">
                  <button
                    type="button"
                    className="admin-button admin-button--ghost admin-button--small"
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...items];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      replace(next);
                    }}
                  >
                    ↑ Move up
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button--ghost admin-button--small"
                    disabled={index === items.length - 1}
                    onClick={() => {
                      const next = [...items];
                      [next[index], next[index + 1]] = [
                        next[index + 1],
                        next[index],
                      ];
                      replace(next);
                    }}
                  >
                    ↓ Move down
                  </button>
                  <button
                    type="button"
                    className="admin-button admin-button--danger admin-button--small"
                    onClick={() => {
                      if (
                        hasContent(item) &&
                        !window.confirm(
                          `Remove "${title}"? This is saved when you press Save changes.`,
                        )
                      ) {
                        return;
                      }

                      replace(items.filter((_, i) => i !== index));
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <button
        type="button"
        className="admin-button admin-button--secondary"
        onClick={addRow}
      >
        + Add {spec.itemLabel.toLowerCase()}
      </button>

      <FieldErrors messages={messages} id={`${domId(path)}-error`} />
    </fieldset>
  );
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CollectionEditor({
  spec,
  initialData,
  contentEndpoint,
  uploadEndpoint,
  canSave,
  saveDisabledReason,
  uploadsEnabled,
  initialSource,
  initialUpdatedAt,
}: CollectionEditorProps) {
  const [data, setData] = useState<unknown>(initialData);
  const [savedData, setSavedData] = useState<unknown>(initialData);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [source, setSource] = useState(initialSource);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const initialCountsRef = useRef(new Map<string, number>());

  const isDirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(savedData),
    [data, savedData],
  );

  const issueMap = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const issue of issues) {
      const existing = map.get(issue.path);

      if (existing) {
        existing.push(issue.message);
      } else {
        map.set(issue.path, [issue.message]);
      }
    }

    return map;
  }, [issues]);

  const handleChange = useCallback((path: Path, value: unknown) => {
    setData((previous) => updateAt(previous, path, value));
    setStatus("idle");
    setMessage(null);
  }, []);

  const openRowsByDefault = useCallback(
    (listPath: string, count: number, index: number) => {
      const counts = initialCountsRef.current;

      if (!counts.has(listPath)) {
        counts.set(listPath, count);
      }

      const initialCount = counts.get(listPath) ?? count;

      // Short lists stay open; longer ones start collapsed so the page is
      // scannable. Rows added during this session are always open, so clicking
      // "add" puts the cursor-ready fields right in front of you.
      return initialCount <= 3 || index >= initialCount;
    },
    [],
  );

  const ctx: EditorContext = useMemo(
    () => ({
      issues: issueMap,
      onChange: handleChange,
      uploadEndpoint,
      uploadsEnabled,
      openRowsByDefault,
    }),
    [handleChange, issueMap, openRowsByDefault, uploadEndpoint, uploadsEnabled],
  );

  const save = useCallback(async () => {
    if (!canSave) {
      return;
    }

    const localCheck = validateCollection(spec, data);

    if (localCheck.issues.length > 0) {
      setIssues(localCheck.issues);
      setStatus("error");
      setMessage(
        `${localCheck.issues.length} field${localCheck.issues.length === 1 ? "" : "s"} need attention before this can be saved.`,
      );
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch(contentEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ data: localCheck.value }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: unknown;
        updatedAt?: string;
        error?: string;
        issues?: ValidationIssue[];
      } | null;

      if (!response.ok) {
        setIssues(payload?.issues ?? []);
        setStatus("error");
        setMessage(payload?.error ?? "The changes could not be saved.");
        return;
      }

      setIssues([]);
      setStatus("saved");
      setMessage("Saved. The site is updated.");
      setSource("database");
      setUpdatedAt(payload?.updatedAt ?? new Date().toISOString());

      if (payload?.data !== undefined) {
        setData(payload.data);
        setSavedData(payload.data);
      } else {
        setSavedData(localCheck.value);
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The changes could not be saved.",
      );
    }
  }, [canSave, contentEndpoint, data, spec]);

  const revert = useCallback(async () => {
    if (
      !window.confirm(
        "Discard the saved version and go back to the copy that ships with the website?",
      )
    ) {
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch(contentEndpoint, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: unknown;
        source?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.error ?? "That could not be undone.");
        return;
      }

      setIssues([]);
      setStatus("saved");
      setMessage("Reverted to the version that ships with the website.");
      setSource("bundled");
      setUpdatedAt(null);

      if (payload?.data !== undefined) {
        setData(payload.data);
        setSavedData(payload.data);
      }
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "That could not be undone.",
      );
    }
  }, [contentEndpoint]);

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : isDirty
        ? "Unsaved changes"
        : source === "database"
          ? `Saved${updatedAt ? ` · ${formatTimestamp(updatedAt)}` : ""}`
          : "Using the version that ships with the website";

  return (
    <div className="admin-editor">
      <div className="admin-editor__bar">
        <div className="admin-editor__status">
          <span
            className={`admin-dot${isDirty ? "admin-dot--dirty" : ""}`}
            aria-hidden="true"
          />
          <span>{statusLabel}</span>
        </div>
        <div className="admin-editor__bar-actions">
          {source === "database" && (
            <button
              type="button"
              className="admin-button admin-button--ghost admin-button--small"
              onClick={() => void revert()}
              disabled={status === "saving"}
            >
              Revert to file version
            </button>
          )}
          <button
            type="button"
            className="admin-button admin-button--primary"
            onClick={() => void save()}
            disabled={!canSave || status === "saving" || !isDirty}
          >
            {status === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {!canSave && saveDisabledReason && (
        <p className="admin-callout admin-callout--warning">
          {saveDisabledReason}
        </p>
      )}

      {message && (
        <p
          className={`admin-callout ${
            status === "error"
              ? "admin-callout--error"
              : "admin-callout--success"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      )}

      <form
        className="admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {spec.root.kind === "object" ? (
          <ObjectFields
            spec={spec.root}
            value={data}
            path={[]}
            ctx={ctx}
            bare
          />
        ) : (
          <ListField spec={spec.root} value={data} path={[]} ctx={ctx} />
        )}

        <div className="admin-form__footer">
          <button
            type="submit"
            className="admin-button admin-button--primary"
            disabled={!canSave || status === "saving" || !isDirty}
          >
            {status === "saving" ? "Saving…" : "Save changes"}
          </button>
          {isDirty && (
            <button
              type="button"
              className="admin-button admin-button--ghost"
              onClick={() => {
                if (
                  window.confirm(
                    "Discard the changes you have made on this page?",
                  )
                ) {
                  setData(savedData);
                  setIssues([]);
                  setStatus("idle");
                  setMessage(null);
                }
              }}
            >
              Discard changes
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
