import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const data = await request.formData();
  const email = (data.get("email") ?? "").toString().trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return new Response(
      JSON.stringify({ error: "Please provide a valid email address." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const apiKey = (import.meta.env.EMAIL_OCTOPUS_API_KEY ?? "").toString().trim();
  const listId = (import.meta.env.EMAIL_OCTOPUS_LIST_ID ?? "").toString().trim();

  if (!apiKey || !listId) {
    return new Response(
      JSON.stringify({
        error: "Newsletter service is not configured. Please try again later.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

	try {
		const res = await fetch(
			`https://api.emailoctopus.com/lists/${encodeURIComponent(listId)}/contacts`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					email_address: email,
					status: "subscribed",
				}),
			},
		);

		if (res.ok) {
			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}

		const raw = await res.text();
		let serviceMessage = "";
		let errorType = "";

		try {
			const parsed = JSON.parse(raw) as {
				error?: { message?: string; code?: string };
				message?: string;
				title?: string;
				detail?: string;
				type?: string;
				errors?: Array<{ message?: string; detail?: string }>;
			};
			serviceMessage =
				parsed.detail?.trim() ??
				parsed.error?.message?.trim() ??
				parsed.message?.trim() ??
				parsed.errors?.[0]?.detail?.trim() ??
				parsed.errors?.[0]?.message?.trim() ??
				parsed.title?.trim() ??
				"";
			errorType =
				parsed.type?.trim() ??
				parsed.error?.code?.trim() ??
				"";
		} catch {
			serviceMessage = raw.trim();
		}

		const alreadySubscribed =
			res.status === 409 ||
			/already-exists/i.test(errorType) ||
			/already|exists|subscribed/i.test(serviceMessage);

		let error = serviceMessage || "Unable to subscribe right now. Please try again later.";

		if (alreadySubscribed) {
			error = "This email is already subscribed.";
		} else if (res.status === 401 || res.status === 403) {
			error = "Newsletter service credentials are invalid. Please contact support.";
		} else if (res.status === 404) {
			error = "Newsletter list configuration is invalid. Please contact support.";
		}

		console.error("Newsletter subscribe API error:", {
			status: res.status,
			type: errorType,
			detail: serviceMessage,
		});

		return new Response(JSON.stringify({ error }), {
			status: res.status >= 500 ? 502 : 400,
			headers: { "Content-Type": "application/json" },
		});
	} catch (err) {
		console.error("Newsletter subscribe request failed:", err);
		return new Response(
			JSON.stringify({ error: "Unable to subscribe right now. Please try again later." }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
};
