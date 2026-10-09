import { useState } from "react";

type Props = {
  enabled: boolean;
  initialTotal: number | null;
  initialRefreshedAt: number | null;
};

export default function RefreshFundraising({
  enabled,
  initialTotal,
  initialRefreshedAt,
}: Props) {
  const [total, setTotal] = useState(initialTotal);
  const [refreshedAt, setRefreshedAt] = useState(initialRefreshedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    if (loading || !enabled) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/fundraising/refresh", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "DonorDrive could not be refreshed.");
      setTotal(payload.total);
      setRefreshedAt(payload.refreshedAt);
      setMessage(
        "DonorDrive total refreshed. Public pages can take about a minute to pick up the change.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "DonorDrive could not be refreshed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="admin-panel"
      aria-labelledby="donordrive-refresh-heading"
    >
      <h2 id="donordrive-refresh-heading">Automatic DonorDrive total</h2>
      <p>
        {total === null
          ? "No DonorDrive total has been fetched yet."
          : `Last fetched total: ${total.toLocaleString("en-US", { style: "currency", currency: "USD" })}`}
      </p>
      {refreshedAt !== null && (
        <p className="admin-field__help">
          Last updated:{" "}
          {new Date(refreshedAt).toLocaleString("en-US", {
            timeZone: "America/New_York",
            timeZoneName: "short",
          })}
        </p>
      )}
      <p className="admin-field__help">
        Refreshes automatically on the first visit after 30 minutes. Refresh now
        to fetch sooner. An entered manual total below still takes priority;
        clear it and save to use DonorDrive.
      </p>
      <button
        type="button"
        className="admin-button admin-button--secondary"
        onClick={() => void refresh()}
        disabled={!enabled || loading}
      >
        {loading ? "Refreshing…" : "Refresh from DonorDrive"}
      </button>
      {!enabled && (
        <p className="admin-field__help">
          Connect the admin database to enable shared automatic totals and
          manual refreshes.
        </p>
      )}
      <div aria-live="polite">
        {message && <p className="admin-field__help">{message}</p>}
        {error && (
          <p className="admin-callout admin-callout--error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
