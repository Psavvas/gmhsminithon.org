/**
 * Field schema types, validation, and normalization.
 *
 * This module deliberately imports nothing else so it is safe to use from both
 * the server and the admin portal's browser code (no site content is pulled
 * into the client bundle).
 */
export type FieldMap = Record<string, FieldSpec>;

type FieldBase = {
  label: string;
  help?: string;
};

export type TextFieldKind =
  | "text"
  | "textarea"
  | "markdown"
  | "url"
  | "email"
  | "date"
  | "time"
  | "image";

export type TextFieldSpec = FieldBase & {
  kind: TextFieldKind;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  pattern?: string;
  patternMessage?: string;
  rows?: number;
};

export type NumberFieldSpec = FieldBase & {
  kind: "number";
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  step?: number;
  prefix?: string;
};

export type BooleanFieldSpec = FieldBase & {
  kind: "boolean";
};

export type SelectFieldSpec = FieldBase & {
  kind: "select";
  options: string[];
  required?: boolean;
  allowOther?: boolean;
};

export type StringListFieldSpec = FieldBase & {
  kind: "stringList";
  itemLabel: string;
  itemKind?: "text" | "textarea" | "url";
  placeholder?: string;
  maxItems?: number;
};

export type ObjectFieldSpec = FieldBase & {
  kind: "object";
  fields: FieldMap;
};

export type ListFieldSpec = FieldBase & {
  kind: "list";
  itemLabel: string;
  fields: FieldMap;
  titleField?: string;
  subtitleField?: string;
  uniqueBy?: string;
  maxItems?: number;
};

export type FieldSpec =
  | TextFieldSpec
  | NumberFieldSpec
  | BooleanFieldSpec
  | SelectFieldSpec
  | StringListFieldSpec
  | ObjectFieldSpec
  | ListFieldSpec;

export type CollectionScope = "public" | "members";

export type CollectionSpec = {
  id: string;
  label: string;
  description: string;
  icon: string;
  scope: CollectionScope;
  /** Where the content shows up, for the "view page" link in the portal. */
  previewPath?: string;
  root: ObjectFieldSpec | ListFieldSpec;
  defaults: unknown;
  notes?: string[];
};

/** A collection spec without the bundled defaults, for sending to the browser. */
export type ClientCollectionSpec = Omit<CollectionSpec, "defaults">;

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult = {
  value: unknown;
  issues: ValidationIssue[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns a path into the stable string used to report validation problems, e.g.
 * `sponsors[0].name`. The server and the editor must agree on this format.
 */
export function formatFieldPath(segments: Array<string | number>): string {
  return segments.reduce<string>((accumulated, segment) => {
    if (typeof segment === "number") {
      return `${accumulated}[${segment}]`;
    }

    return accumulated ? `${accumulated}.${segment}` : segment;
  }, "");
}

function joinPath(path: string, key: string | number): string {
  if (typeof key === "number") {
    return `${path}[${key}]`;
  }

  return path ? `${path}.${key}` : key;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "";
}

export function isAllowedLink(value: string): boolean {
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) {
    return true;
  }

  return /^\/(?!\/)/.test(value);
}

function coerceTextField(
  spec: TextFieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string {
  const multiline = spec.kind === "textarea" || spec.kind === "markdown";
  const text = multiline
    ? toText(value).replace(/\r\n/g, "\n").trim()
    : toText(value).trim();

  if (!text) {
    if (spec.required) {
      issues.push({ path, message: `${spec.label} is required.` });
    }

    return "";
  }

  if (spec.maxLength && text.length > spec.maxLength) {
    issues.push({
      path,
      message: `${spec.label} must be ${spec.maxLength} characters or fewer.`,
    });
  }

  if (spec.pattern && !new RegExp(spec.pattern).test(text)) {
    issues.push({
      path,
      message:
        spec.patternMessage ?? `${spec.label} is not in the expected format.`,
    });
  }

  if (spec.kind === "email" && !EMAIL_PATTERN.test(text)) {
    issues.push({ path, message: `${spec.label} must be a valid email.` });
  }

  if (spec.kind === "date" && !DATE_PATTERN.test(text)) {
    issues.push({ path, message: `${spec.label} must use YYYY-MM-DD.` });
  }

  if (spec.kind === "url" && !isAllowedLink(text)) {
    issues.push({
      path,
      message: `${spec.label} must start with https:// (or be a /site-path).`,
    });
  }

  if (spec.kind === "image" && !/^https:\/\//i.test(text)) {
    issues.push({
      path,
      message: `${spec.label} must be an uploaded image or an https:// URL.`,
    });
  }

  return text;
}

function coerceNumberField(
  spec: NumberFieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number {
  const raw = typeof value === "string" ? value.trim() : value;

  if (raw === "" || raw === null || raw === undefined) {
    if (spec.required) {
      issues.push({ path, message: `${spec.label} is required.` });
    }

    return 0;
  }

  const parsed = typeof raw === "number" ? raw : Number(raw);

  if (!Number.isFinite(parsed)) {
    issues.push({ path, message: `${spec.label} must be a number.` });
    return 0;
  }

  const rounded = spec.integer ? Math.round(parsed) : parsed;

  if (typeof spec.min === "number" && rounded < spec.min) {
    issues.push({
      path,
      message: `${spec.label} must be ${spec.min} or higher.`,
    });
  }

  if (typeof spec.max === "number" && rounded > spec.max) {
    issues.push({
      path,
      message: `${spec.label} must be ${spec.max} or lower.`,
    });
  }

  return rounded;
}

function coerceSelectField(
  spec: SelectFieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string {
  const text = toText(value).trim();

  if (!text) {
    if (spec.required) {
      issues.push({ path, message: `${spec.label} is required.` });
    }

    return "";
  }

  if (!spec.allowOther && !spec.options.includes(text)) {
    issues.push({
      path,
      message: `${spec.label} must be one of: ${spec.options.join(", ")}.`,
    });
  }

  return text;
}

function coerceStringListField(
  spec: StringListFieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string[] {
  const items = Array.isArray(value) ? value : [];
  const cleaned = items
    .map((item) => toText(item).replace(/\r\n/g, "\n").trim())
    .filter(Boolean);

  if (spec.maxItems && cleaned.length > spec.maxItems) {
    issues.push({
      path,
      message: `${spec.label} allows at most ${spec.maxItems} entries.`,
    });
  }

  if (spec.itemKind === "url") {
    cleaned.forEach((item, index) => {
      if (!isAllowedLink(item)) {
        issues.push({
          path: joinPath(path, index),
          message: `${spec.itemLabel} must start with https://.`,
        });
      }
    });
  }

  return cleaned;
}

function coerceObjectField(
  spec: ObjectFieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: Record<string, unknown> = {};

  for (const [key, fieldSpec] of Object.entries(spec.fields)) {
    result[key] = coerceField(
      fieldSpec,
      source[key],
      joinPath(path, key),
      issues,
    );
  }

  return result;
}

function coerceListField(
  spec: ListFieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown>[] {
  const items = Array.isArray(value) ? value : [];
  const kept: Record<string, unknown>[] = [];
  const itemSpec: ObjectFieldSpec = {
    kind: "object",
    label: spec.itemLabel,
    fields: spec.fields,
  };
  // Rows the admin added but never typed into are dropped rather than reported
  // as errors — but only for rows that have something typeable in them.
  const dropsBlankRows = hasTextLikeLeaf(itemSpec);

  items.forEach((item) => {
    if (dropsBlankRows && !hasAnyTextValue(itemSpec, item)) {
      return;
    }

    kept.push(
      coerceObjectField(itemSpec, item, joinPath(path, kept.length), issues),
    );
  });

  if (spec.maxItems && kept.length > spec.maxItems) {
    issues.push({
      path,
      message: `${spec.label} allows at most ${spec.maxItems} entries.`,
    });
  }

  if (spec.uniqueBy) {
    const uniqueKey = spec.uniqueBy;
    const seen = new Set<string>();

    kept.forEach((item, index) => {
      const key = toText(item[uniqueKey]).toLowerCase();

      if (!key) {
        return;
      }

      if (seen.has(key)) {
        issues.push({
          path: joinPath(joinPath(path, index), uniqueKey),
          message: `"${key}" is already used by another ${spec.itemLabel.toLowerCase()}.`,
        });
        return;
      }

      seen.add(key);
    });
  }

  return kept;
}

/**
 * True when the spec contains at least one leaf an admin types text into.
 * Number-only rows (such as fundraising history) have none.
 */
function hasTextLikeLeaf(spec: FieldSpec): boolean {
  switch (spec.kind) {
    case "object":
      return Object.values(spec.fields).some(hasTextLikeLeaf);
    case "list":
    case "number":
    case "boolean":
      return false;
    default:
      return true;
  }
}

/**
 * True when at least one text-like leaf in the value is filled in. Used to tell
 * an untouched blank row apart from a row the admin actually edited.
 */
function hasAnyTextValue(spec: FieldSpec, value: unknown): boolean {
  switch (spec.kind) {
    case "list":
      return Array.isArray(value) && value.length > 0;
    case "object": {
      const source =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};

      return Object.entries(spec.fields).some(([key, fieldSpec]) =>
        hasAnyTextValue(fieldSpec, source[key]),
      );
    }
    case "stringList":
      return (
        Array.isArray(value) && value.some((item) => toText(item).trim() !== "")
      );
    case "number":
    case "boolean":
      return false;
    default:
      return toText(value).trim() !== "";
  }
}

export function coerceField(
  spec: FieldSpec,
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): unknown {
  switch (spec.kind) {
    case "number":
      return coerceNumberField(spec, value, path, issues);
    case "boolean":
      return value === true || value === "true" || value === "on";
    case "select":
      return coerceSelectField(spec, value, path, issues);
    case "stringList":
      return coerceStringListField(spec, value, path, issues);
    case "object":
      return coerceObjectField(spec, value, path, issues);
    case "list":
      return coerceListField(spec, value, path, issues);
    default:
      return coerceTextField(spec, value, path, issues);
  }
}

/**
 * Validate and normalize a whole collection document.
 */
export function validateCollection(
  spec: Pick<CollectionSpec, "root">,
  value: unknown,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const normalized = coerceField(spec.root, value, "", issues);

  return { value: normalized, issues };
}

/**
 * Normalize without surfacing problems — used when reading stored content so a
 * partially-written document still renders.
 */
export function normalizeCollection(
  spec: Pick<CollectionSpec, "root">,
  value: unknown,
): unknown {
  return coerceField(spec.root, value, "", []);
}

/**
 * An empty value matching a spec, used for "add another" rows in the editor.
 */
export function emptyValueForField(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "stringList":
    case "list":
      return [];
    case "object":
      return Object.fromEntries(
        Object.entries(spec.fields).map(([key, fieldSpec]) => [
          key,
          emptyValueForField(fieldSpec),
        ]),
      );
    default:
      return "";
  }
}

export function emptyListItem(spec: ListFieldSpec): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(spec.fields).map(([key, fieldSpec]) => [
      key,
      emptyValueForField(fieldSpec),
    ]),
  ) as Record<string, unknown>;
}
