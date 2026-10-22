import { allQuotes } from "@/lib/engine";
import { json, open } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = open(async () => json({ time: Date.now(), quotes: allQuotes() }));
