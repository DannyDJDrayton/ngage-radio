// Runs automatically whenever a Netlify Form submission is verified (spam is filtered out first).
// Saves "studio-message" submissions to private Blob storage so the /studio page can show them live.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const { payload } = await req.json();
  if (!payload || payload.form_name !== "studio-message") return new Response("ignored");
  const d = payload.data || {};
  const clip = (v, n) => String(v ?? "").slice(0, n);
  const created = payload.created_at || new Date().toISOString();
  const msg = {
    id: payload.id || crypto.randomUUID(),
    created,
    name: clip(d.name, 60),
    message: clip(d.message, 600),
    contact: clip(d.contact, 100),
    show: clip(d["live-show"], 120),
  };
  const store = getStore("studio-messages");
  // Key sorts by time so the newest are easy to find
  await store.setJSON(`${created}_${msg.id}`, msg);
  return new Response("saved");
};
