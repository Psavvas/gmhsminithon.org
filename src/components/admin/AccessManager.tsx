import { useState } from "react";

export type AccessEntryDto = {
  shooSub: string;
  label: string | null;
  createdAt: string | null;
  createdBy: string | null;
  origin: "environment" | "database";
};

type AccessManagerProps = {
  listId: "admins" | "members";
  endpoint: string;
  initialEntries: AccessEntryDto[];
  databaseConfigured: boolean;
  currentUserSub: string;
  initialWarning?: string;
};

const COPY: Record<
  AccessManagerProps["listId"],
  { addTitle: string; addHint: string; emptyState: string; grants: string }
> = {
  admins: {
    addTitle: "Add an admin",
    addHint:
      "Admins can edit every piece of site content and manage these lists.",
    emptyState: "No admins have been added in the portal yet.",
    grants: "admin access",
  },
  members: {
    addTitle: "Approve a member",
    addHint:
      "Members can sign in to the member portal at /members. Ask them to sign in once and send you the Shoo user ID shown on screen.",
    emptyState: "No members have been approved in the portal yet.",
    grants: "member portal access",
  },
};

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function AccessManager({
  listId,
  endpoint,
  initialEntries,
  databaseConfigured,
  currentUserSub,
  initialWarning,
}: AccessManagerProps) {
  const copy = COPY[listId];
  const [entries, setEntries] = useState<AccessEntryDto[]>(initialEntries);
  const [shooSub, setShooSub] = useState("");
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | undefined>(initialWarning);

  const applyResponse = (payload: {
    entries?: AccessEntryDto[];
    warning?: string;
  }) => {
    if (Array.isArray(payload.entries)) {
      setEntries(payload.entries);
    }

    setWarning(payload.warning);
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = shooSub.trim();

    if (!trimmed || pending) {
      return;
    }

    setPending("add");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ shooSub: trimmed, label: label.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as {
        entries?: AccessEntryDto[];
        error?: string;
        warning?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "That ID could not be added.");
        return;
      }

      applyResponse(payload ?? {});
      setShooSub("");
      setLabel("");
      setNotice(`Added. They now have ${copy.grants}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "That ID could not be added.",
      );
    } finally {
      setPending(null);
    }
  };

  const remove = async (entry: AccessEntryDto) => {
    const describe = entry.label
      ? `${entry.label} (${entry.shooSub})`
      : entry.shooSub;

    if (!window.confirm(`Remove ${copy.grants} for ${describe}?`)) {
      return;
    }

    setPending(entry.shooSub);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ shooSub: entry.shooSub }),
      });
      const payload = (await response.json().catch(() => null)) as {
        entries?: AccessEntryDto[];
        error?: string;
        warning?: string;
      } | null;

      if (!response.ok) {
        setError(payload?.error ?? "That ID could not be removed.");
        return;
      }

      applyResponse(payload ?? {});
      setNotice("Removed.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "That ID could not be removed.",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="admin-access">
      {!databaseConfigured && (
        <p className="admin-callout admin-callout--warning">
          No database is connected yet, so these lists are read-only. IDs shown
          here come from environment variables in Vercel.
        </p>
      )}

      {warning && (
        <p className="admin-callout admin-callout--warning">{warning}</p>
      )}

      {error && (
        <p className="admin-callout admin-callout--error" role="alert">
          {error}
        </p>
      )}

      {notice && (
        <p className="admin-callout admin-callout--success" role="status">
          {notice}
        </p>
      )}

      {entries.length === 0 ? (
        <p className="admin-empty">{copy.emptyState}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Shoo user ID</th>
                <th scope="col">Note</th>
                <th scope="col">Added</th>
                <th scope="col">
                  <span className="admin-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isSelf = entry.shooSub === currentUserSub;
                const isFromEnvironment = entry.origin === "environment";

                return (
                  <tr key={`${entry.origin}-${entry.shooSub}`}>
                    <td>
                      <code className="admin-code">{entry.shooSub}</code>
                      {isSelf && (
                        <span className="admin-badge admin-badge--muted">
                          you
                        </span>
                      )}
                      {isFromEnvironment && (
                        <span className="admin-badge admin-badge--muted">
                          from Vercel env
                        </span>
                      )}
                    </td>
                    <td>{entry.label || "—"}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td className="admin-table__actions">
                      <button
                        type="button"
                        className="admin-button admin-button--danger admin-button--small"
                        disabled={
                          !databaseConfigured ||
                          isFromEnvironment ||
                          (listId === "admins" && isSelf) ||
                          pending === entry.shooSub
                        }
                        title={
                          isFromEnvironment
                            ? "Remove this ID from the environment variable in Vercel."
                            : listId === "admins" && isSelf
                              ? "You cannot remove your own admin access."
                              : undefined
                        }
                        onClick={() => void remove(entry)}
                      >
                        {pending === entry.shooSub ? "Removing…" : "Remove"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="admin-access__form"
        onSubmit={(event) => void add(event)}
      >
        <h3>{copy.addTitle}</h3>
        <p className="admin-field__help">{copy.addHint}</p>

        <div className="admin-access__inputs">
          <div className="admin-field">
            <label
              className="admin-field__label"
              htmlFor={`${listId}-shoo-sub`}
            >
              Shoo user ID
            </label>
            <input
              id={`${listId}-shoo-sub`}
              className="admin-input"
              value={shooSub}
              onChange={(event) => setShooSub(event.target.value)}
              placeholder="Paste the ID exactly"
              autoComplete="off"
              spellCheck={false}
              disabled={!databaseConfigured}
              required
            />
          </div>
          <div className="admin-field">
            <label className="admin-field__label" htmlFor={`${listId}-label`}>
              Note (optional)
            </label>
            <input
              id={`${listId}-label`}
              className="admin-input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Who is this?"
              maxLength={120}
              disabled={!databaseConfigured}
            />
          </div>
        </div>

        <button
          type="submit"
          className="admin-button admin-button--primary"
          disabled={!databaseConfigured || pending === "add" || !shooSub.trim()}
        >
          {pending === "add" ? "Adding…" : "Add"}
        </button>
      </form>
    </div>
  );
}
