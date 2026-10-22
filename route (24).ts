import { getContract } from "@/lib/trading";
import { authed, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ req, user }) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  return json({ contract: await getContract(user, id) });
});
