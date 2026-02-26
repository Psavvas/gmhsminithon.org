import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
	const data = await request.formData();
	const email = (data.get('email') ?? '').toString().trim();

	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
		return new Response(JSON.stringify({ error: 'Please provide a valid email address.' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const apiKey = import.meta.env.EMAIL_OCTOPUS_API_KEY;
	const listId = import.meta.env.EMAIL_OCTOPUS_LIST_ID;

	if (!apiKey || !listId) {
		return new Response(
			JSON.stringify({ error: 'Newsletter service is not configured. Please try again later.' }),
			{ status: 503, headers: { 'Content-Type': 'application/json' } }
		);
	}

	try {
		const res = await fetch(
  			`https://emailoctopus.com/api/1.6/lists/${encodeURIComponent(listId)}/contacts`,
  			{
    			method: 'POST',
    			headers: { 'Content-Type': 'application/json' },
    			body: JSON.stringify({
      				api_key: apiKey,
      				email_address: email,
      				status: 'SUBSCRIBED',
    			}),
  			}
		);

		if (res.ok || res.status === 409) {
			// 409 = already subscribed — treat as success
			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const body = await res.json().catch(() => ({}));
		const message =
			(body as { error?: { message?: string } })?.error?.message ??
			'Something went wrong. Please try again.';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch {
		return new Response(
			JSON.stringify({ error: 'Unable to reach the newsletter service. Please try again later.' }),
			{ status: 502, headers: { 'Content-Type': 'application/json' } }
		);
	}
};
