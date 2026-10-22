import { buyContract } from "@/lib/trading";
import type { TradeRequest } from "@/lib/pricing";
import { authed, body, json } from "@/lib/http";

export const POST = authed(async ({ req, user }) => {
  const b = await body<TradeRequest>(req);
  return json(await buyContract(user, b));
});
