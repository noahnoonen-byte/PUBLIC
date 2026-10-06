import { getStore } from "@netlify/blobs";

export const config = { path: "/api/broadcast" };

const H = { "content-type": "application/json", "cache-control": "no-store" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

export default async (req) => {
  const store = getStore({ name: "broadcast", consistency: "strong" });

  if (req.method === "GET") {
    const cur = await store.get("latest", { type: "json" });
    return json({ ...(cur || { seq: 0, ts: 0, d: null }), now: Date.now() });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
    const secret = Netlify.env.get("BROADCAST_KEY");
    if (!secret || body.key !== secret) return json({ error: "not_permitted" }, 401);
    if (!body.d || typeof body.d !== "object" || JSON.stringify(body.d).length > 2000)
      return json({ error: "bad_request" }, 400);
    const rec = { seq: Date.now(), ts: Date.now(), d: body.d };
    await store.setJSON("latest", rec);
    return json({ seq: rec.seq });
  }

  return json({ error: "method_not_allowed" }, 405);
};
