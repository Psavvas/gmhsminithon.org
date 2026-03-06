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

    const raw = await res.text();

    console.log("STATUS:", res.status);
    console.log("RESPONSE:", raw);

    return new Response(
      JSON.stringify({
        debugStatus: res.status,
        debugResponse: raw,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("FETCH ERROR:", err);
    return new Response(JSON.stringify({ error: "Fetch failed entirely." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
