// Private feed for the /studio page. Requires the STUDIO_PASSWORD environment variable.
//   GET  /api/studio-messages?limit=200&before=<key>  -> newest messages first (with done flag)
//   POST /api/studio-messages  {key, done:true|false}  -> mark a message done / back to "to read"
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();
const noStore = { "cache-control": "no-store", "x-robots-tag": "noindex" };

export default async (req) => {
  const expected = Netlify.env.get("STUDIO_PASSWORD");
  if (!expected) return Response.json({ error: "Studio password not set up yet" }, { status: 503, headers: noStore });
  const given = req.headers.get("x-studio-key") || "";
  if (!timingSafeEqual(sha(given), sha(expected))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Wrong password" }, { status: 401, headers: noStore });
  }
  const store = getStore("studio-messages");

  if (req.method === "POST") {
    let body = {};
    try { body = await req.json(); } catch {}
    const key = String(body.key || "");
    if (!key || key.length > 200) return Response.json({ error: "Missing key" }, { status: 400, headers: noStore });
    const msg = await store.get(key, { type: "json" });
    if (!msg) return Response.json({ error: "Not found" }, { status: 404, headers: noStore });
    msg.done = !!body.done;
    msg.doneAt = msg.done ? new Date().toISOString() : null;
    await store.setJSON(key, msg);
    return Response.json({ ok: true, key, done: msg.done }, { headers: noStore });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 1), 500);
  const before = url.searchParams.get("before") || "";
  const { blobs } = await store.list();
  const all = blobs.map((b) => b.key).sort().reverse();
  const older = before ? all.filter((k) => k < before) : all;
  const keys = older.slice(0, limit);
  const messages = (await Promise.all(keys.map(async (k) => {
    const m = await store.get(k, { type: "json" });
    return m ? { ...m, key: k } : null;
  }))).filter(Boolean);
  return Response.json({ messages, more: older.length > keys.length, total: all.length }, { headers: noStore });
};

export const config = { path: "/api/studio-messages", method: ["GET", "POST"] };
