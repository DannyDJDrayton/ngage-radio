// Private feed for the /studio page. Requires the STUDIO_PASSWORD environment variable.
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();

export default async (req) => {
  const expected = Netlify.env.get("STUDIO_PASSWORD");
  const noStore = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  if (!expected) return Response.json({ error: "Studio password not set up yet" }, { status: 503, headers: noStore });
  const given = req.headers.get("x-studio-key") || "";
  if (!timingSafeEqual(sha(given), sha(expected))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Wrong password" }, { status: 401, headers: noStore });
  }
  const store = getStore("studio-messages");
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 100);
  const messages = (await Promise.all(keys.map((k) => store.get(k, { type: "json" })))).filter(Boolean);
  return Response.json({ messages }, { headers: noStore });
};

export const config = { path: "/api/studio-messages", method: ["GET"] };
