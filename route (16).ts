import { METHODS, getRates } from "@/lib/payments";
import { authed, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = authed(async () => json({ methods: Object.values(METHODS), rates: getRates() }));
