import { cancelWithdrawal } from "@/lib/payments";
import { authed, json } from "@/lib/http";

export const POST = authed(async ({ user, params }) => json({ ok: await cancelWithdrawal(user, Number(params.id)) }));
