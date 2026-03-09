import { useState } from "react";

type RefreshMemberCacheButtonProps = {
  endpoint: string;
};

export default function RefreshMemberCacheButton({
  endpoint,
}: RefreshMemberCacheButtonProps) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState(
    "Refresh the approval cache if someone was just added.",
  );

  async function handleRefresh() {
    if (status === "loading") {
      return;
    }

    setStatus("loading");
    setMessage("Refreshing approval cache...");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Could not refresh the approval cache.",
        );
      }

      setStatus("success");
      setMessage("Approval cache refreshed.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not refresh the approval cache.",
      );
    }
  }

  return (
    <div className="member-cache-tools">
      <button
        type="button"
        className="member-cache-tools__button"
        onClick={() => void handleRefresh()}
        disabled={status === "loading"}
      >
        {status === "loading" ? "Refreshing..." : "Refresh approval cache"}
      </button>
      <p
        className={`member-cache-tools__message member-cache-tools__message--${status}`}
      >
        {message}
      </p>
    </div>
  );
}
