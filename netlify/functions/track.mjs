// Anonymous, cookie-free visit counter for the Ngage app.
// Each event is stored as a tiny blob whose KEY holds everything we need, so stats can be
// read with a quick list (no per-event reads) and simultaneous visits never overwrite each other.
// Visitors are identified only by a hash of (secret salt + date + IP + browser), which changes daily
// and can't be turned back into an IP address.
import { getStore } from "@netlify/blobs";
import { createHash, randomBytes } from "node:crypto";

const BOT = /bot|crawl|spider|slurp|preview|monitor|lighthouse|headless/i;

async function salt(store) {
  let s = await store.get("config/salt");
  if (!s) { s = randomBytes(24).toString("hex"); await store.set("config/salt", s); }
  return s;
}
const ukParts = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: p.hour };
};

export default async (req, context) => {
  const ok = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return ok;
  let body = {};
  try { body = JSON.parse((await req.text()).slice(0, 1000)); } catch { return ok; }
  const type = ["view", "play", "live"].includes(body.e) ? body.e : null;
  if (!type) return ok;

  const store = getStore("app-stats");
  const { day, hour } = ukParts(new Date());
  const visitor = createHash("sha256").update(`${await salt(store)}|${day}|${context.ip || ""}|${ua}`).digest("hex").slice(0, 12);
  const extra =
    type === "view" ? (body.home ? "home" : "web") :
    encodeURIComponent(String(body.show || "").slice(0, 80)).slice(0, 240) || "-";
  const key = `ev/${day}/${hour}/${visitor}/${type}/${extra}/${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  await store.set(key, "");
  return ok;
};

export const config = { path: "/api/track", method: ["POST"] };
