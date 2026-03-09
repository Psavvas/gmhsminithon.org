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

	const apiKey = import.meta.env.EMAIL_OCTOPUS_API_KEY;
	const listId = import.meta.env.EMAIL_OCTOPUS_LIST_ID;

  if (!apiKey || !listId) {
    return new Response(
      JSON.stringify({
        error: "Newsletter service is not configured. Please try again later.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

	try {
		const res = await fetch(`https://api.emailoctopus.com/lists/${encodeURIComponent(listId)}/contacts`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				email_address: email,
				status: 'subscribed',
			}),
		});

		if (res.ok) {
			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const raw = await res.text();
		let serviceMessage = '';

		try {
			const parsed = JSON.parse(raw) as {
				error?: { message?: string };
				message?: string;
				errors?: Array<{ message?: string }>;
			};
			serviceMessage =
				parsed.error?.message?.trim() ??
				parsed.message?.trim() ??
				parsed.errors?.[0]?.message?.trim() ??
				'';
		} catch {
			serviceMessage = raw.trim();
		}

		const alreadySubscribed =
			res.status === 409 ||
			/already|exists|subscribed/i.test(serviceMessage);

		const error = alreadySubscribed
			? 'This email is already subscribed.'
			: serviceMessage || 'Unable to subscribe right now. Please try again later.';

		return new Response(JSON.stringify({ error }), {
			status: res.status >= 500 ? 502 : 400,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err) {
		console.error('Newsletter subscribe request failed:', err);
		return new Response(
			JSON.stringify({ error: 'Unable to subscribe right now. Please try again later.' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
