import { buildProposal, type TradeRequest } from "@/lib/pricing";
import { authed, body, json } from "@/lib/http";

export const POST = authed(async ({ req }) => {
  const b = await body<Omit<TradeRequest, "contractType"> & { category: string }>(req);
  return json(buildProposal(b));
});
