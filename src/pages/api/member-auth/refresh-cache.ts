import type { APIRoute } from "astro";
import {
    createMemberAuthLogContext,
    getApprovedMemberSubjectsState,
    getAuthorizedMemberSession,
    logMemberAuth,
} from "../../../utils/auth";

export const POST: APIRoute = async ({ request }) => {
    const logContext = createMemberAuthLogContext(request, "api/member-auth/refresh-cache");
    const authorizedSession = await getAuthorizedMemberSession(request);

    if (!authorizedSession) {
        logMemberAuth("warn", "refresh_cache.unauthorized", {}, logContext);
        return new Response(
            JSON.stringify({
                error: "You must be signed in to refresh the member approval cache.",
            }),
            {
                status: 403,
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
    }

    const approvedMemberSubjectsState = await getApprovedMemberSubjectsState({
        forceRefresh: true,
        waitForRefresh: true,
        logContext,
    });

    if (approvedMemberSubjectsState.loadError) {
        logMemberAuth(
            "warn",
            "refresh_cache.failed",
            {
                error: approvedMemberSubjectsState.loadError,
            },
            logContext,
        );
        return new Response(
            JSON.stringify({
                error: approvedMemberSubjectsState.loadError,
            }),
            {
                status: 503,
                headers: {
                    "Content-Type": "application/json",
                },
            },
        );
    }

    return new Response(
        JSON.stringify({
            refreshed: true,
            cacheStatus: approvedMemberSubjectsState.cacheStatus,
        }),
        {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        },
    );
};