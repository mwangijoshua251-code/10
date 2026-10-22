import { getPayment, listPayments, progressPayments } from "@/lib/payments";
import { authed, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ req, user }) => {
  await progressPayments(user.id);
  const id = new URL(req.url).searchParams.get("id");
  if (id) return json({ payment: await getPayment(user.id, Number(id)) });
  return json({ payments: await listPayments(user.id) });
});
