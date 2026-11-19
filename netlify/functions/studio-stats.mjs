// Visitor stats for the /studio page (password protected, same STUDIO_PASSWORD).
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s) => createHash("sha256").update(String(s)).digest();
const noStore = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const dayStr = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};

export default async (req) => {
  const expected = Netlify.env.get("STUDIO_PASSWORD");
  if (!expected) return Response.json({ error: "Studio password not set up yet" }, { status: 503, headers: noStore });
  if (!timingSafeEqual(sha(req.headers.get("x-studio-key") || ""), sha(expected))) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "Wrong password" }, { status: 401, headers: noStore });
  }
  const store = getStore("app-stats");
  const DAYS = 30;
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) days.push(dayStr(new Date(Date.now() - i * 86400000)));

  const hours = Array(24).fill(0);       // visitors by hour of day (last 30 days)
  const shows = new Map();               // plays per show (last 30 days)
  const perDay = await Promise.all(days.map(async (date) => {
    const { blobs } = await store.list({ prefix: `ev/${date}/` });
    const visitors = new Set(), home = new Set(), live = new Set(), seenHour = new Set();
    let views = 0, plays = 0;
    for (const { key } of blobs) {
      const [, , hour, visitor, type, extra] = key.split("/");
      visitors.add(visitor);
      const hv = hour + visitor;
      if (!seenHour.has(hv)) { seenHour.add(hv); hours[+hour]++; }
      if (type === "view") { views++; if (extra === "home") home.add(visitor); }
      else if (type === "play") {
        plays++;
        let name = "-"; try { name = decodeURIComponent(extra); } catch {}
        if (name && name !== "-") shows.set(name, (shows.get(name) || 0) + 1);
      } else if (type === "live") live.add(visitor);
    }
    return { date, visitors: visitors.size, views, plays, home: home.size, live: live.size, _v: visitors };
  }));

  // Note: a visitor's code changes each day, so week/month figures are "daily visitors added up" style
  // estimates of people (someone visiting on 3 different days counts 3 times).
  const sum = (list, k) => list.reduce((a, d) => a + d[k], 0);
  const last7 = perDay.slice(-7);
  return Response.json({
    today: { visitors: perDay.at(-1).visitors, views: perDay.at(-1).views, plays: perDay.at(-1).plays, home: perDay.at(-1).home, live: perDay.at(-1).live },
    week: { visits: sum(last7, "visitors"), plays: sum(last7, "plays") },
    month: { visits: sum(perDay, "visitors"), plays: sum(perDay, "plays") },
    days: perDay.map(({ _v, ...d }) => d),
    hours,
    topShows: [...shows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, plays]) => ({ title, plays })),
    liveDays: perDay.filter((d) => d.live > 0).map((d) => ({ date: d.date, listeners: d.live })),
  }, { headers: noStore });
};

export const config = { path: "/api/studio-stats", method: ["GET"] };
