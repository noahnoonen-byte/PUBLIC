import { getStore } from "@netlify/blobs";

export const config = { path: "/api/broadcast" };

const H = { "content-type": "application/json", "cache-control": "no-store" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });
const ID = /^[a-z0-9]{6,40}$/;
const BUCKET = 30000; // presence buckets: 30 seconds
const cut = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);

async function voteCounts(store, id) {
  const { blobs } = await store.list({ prefix: `v/${id}/` });
  let a = 0, b = 0;
  for (const x of blobs) (x.key.split("/")[2] === "a" ? a++ : b++);
  return { a, b };
}

async function stats(store) {
  const now = Math.floor(Date.now() / BUCKET);
  const ids = new Set();
  const stale = [];
  const { blobs } = await store.list({ prefix: "p/" });
  for (const x of blobs) {
    const [, bk, id] = x.key.split("/");
    if (now - Number(bk) <= 2) ids.add(id); else stale.push(x.key);
  }
  if (stale.length) await Promise.all(stale.slice(0, 200).map((k) => store.delete(k)));
  const poll = await store.get("poll", { type: "json" });
  let out = null;
  if (poll) {
    const c = await voteCounts(store, poll.id);
    out = { ...poll, va: c.a, vb: c.b };
  }
  return { online: ids.size, poll: out };
}

export default async (req) => {
  const store = getStore({ name: "broadcast", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    if (url.searchParams.get("stats")) return json(await stats(store));
    const hb = url.searchParams.get("hb");
    if (hb && ID.test(hb)) await store.set(`p/${Math.floor(Date.now() / BUCKET)}/${hb}`, "1");
    const [cur, poll] = await Promise.all([
      store.get("latest", { type: "json" }),
      store.get("poll", { type: "json" }),
    ]);
    return json({ ...(cur || { seq: 0, ts: 0, d: null }), poll: poll || null, now: Date.now() });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
    const action = body.action || "send";

    // Players vote (no key needed)
    if (action === "vote") {
      const id = String(body.id || ""), c = body.c, pid = String(body.pid || "");
      const poll = await store.get("poll", { type: "json" });
      if (!poll || poll.id !== id || !ID.test(pid) || (c !== "a" && c !== "b")) return json({ error: "bad_request" }, 400);
      await store.delete(`v/${id}/${c === "a" ? "b" : "a"}/${pid}`);
      await store.set(`v/${id}/${c}/${pid}`, "1");
      return json(await voteCounts(store, id));
    }

    // Everything below is admin-only
    const secret = Netlify.env.get("BROADCAST_KEY");
    if (!secret || body.key !== secret) return json({ error: "not_permitted" }, 401);

    if (action === "send") {
      if (!body.d || typeof body.d !== "object" || JSON.stringify(body.d).length > 2000) return json({ error: "bad_request" }, 400);
      const rec = { seq: Date.now(), ts: Date.now(), d: body.d };
      await store.setJSON("latest", rec);
      return json({ seq: rec.seq });
    }
    if (action === "pollstart") {
      const q = cut(body.q, 140), a = cut(body.a, 40), b = cut(body.b, 40);
      if (!q || !a || !b) return json({ error: "bad_request" }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await store.setJSON("poll", { id, q, a, b, ts: Date.now() });
      return json({ id });
    }
    if (action === "pollclose") {
      await store.delete("poll");
      return json({ ok: true });
    }
    return json({ error: "bad_request" }, 400);
  }

  return json({ error: "method_not_allowed" }, 405);
};
