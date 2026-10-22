import { sellContract } from "@/lib/trading";
import { authed, body, json } from "@/lib/http";

export const POST = authed(async ({ req, user }) => {
  const b = await body<{ id: number }>(req);
  return json(await sellContract(user, Number(b.id)));
});
