import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { ApiError } from "@/lib/auth";
import { getSymbol } from "@/lib/catalog";
import { authed, body, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ user }) => {
  const rows = await db.select().from(favorites).where(eq(favorites.userId, user.id));
  return json({ favorites: rows.map((r) => r.symbol) });
});

export const POST = authed(async ({ req, user }) => {
  const b = await body<{ symbol: string }>(req);
  if (!getSymbol(b.symbol)) throw new ApiError("Unknown market");
  const [ex] = await db.select().from(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.symbol, b.symbol)));
  if (ex) await db.delete(favorites).where(eq(favorites.id, ex.id));
  else await db.insert(favorites).values({ userId: user.id, symbol: b.symbol });
  const rows = await db.select().from(favorites).where(eq(favorites.userId, user.id));
  return json({ favorites: rows.map((r) => r.symbol) });
});
