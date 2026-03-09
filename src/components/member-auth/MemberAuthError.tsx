import { useState } from "react";

type MemberAuthErrorProps = {
    message: string;
    userId?: string;
};

export default function MemberAuthError({
    message,
    userId,
}: MemberAuthErrorProps) {
    const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
        "idle",
    );

    async function handleCopyUserId() {
        if (!userId) {
            return;
        }

        try {
            await navigator.clipboard.writeText(userId);
            setCopyStatus("copied");
        } catch {
            setCopyStatus("failed");
        }
    }

    return (
        <div className="error-message member-auth-error" role="alert">
            <p className="member-auth-error__message">{message}</p>

            {userId && (
                <div className="member-auth-error__user-id-block">
                    <p className="member-auth-error__user-id-label">Your Shoo user ID</p>
                    <div className="member-auth-error__user-id-row">
                        <code className="member-auth-error__user-id">{userId}</code>
                        <button
                            type="button"
                            className="member-auth-copy-button"
                            onClick={() => void handleCopyUserId()}
                        >
                            {copyStatus === "copied" ? "Copied" : "Copy ID"}
                        </button>
                    </div>
                    <p className="member-auth-copy-status" aria-live="polite">
                        {copyStatus === "failed"
                            ? "Copy failed. Please copy the ID manually."
                            : "Share this ID with an admin if you need portal access."}
                    </p>
                </div>
            )}
        </div>
    );
}