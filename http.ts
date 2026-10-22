import { ApiError, getUserFromRequest } from "./auth";
import { TradeError } from "./pricing";
import type { User } from "./accounts";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });
}

type Ctx = { params: Promise<Record<string, string>> };

function handleError(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  if (e instanceof TradeError) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: "Something went wrong. Please try again." }, 500);
}

export function authed(
  handler: (a: { req: Request; user: User; params: Record<string, string> }) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await getUserFromRequest(req);
      if (!user) return json({ error: "Please log in to continue" }, 401);
      const params = ctx?.params ? await ctx.params : {};
      return await handler({ req, user, params });
    } catch (e) {
      return handleError(e);
    }
  };
}

export function open(handler: (a: { req: Request; params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const params = ctx?.params ? await ctx.params : {};
      return await handler({ req, params });
    } catch (e) {
      return handleError(e);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("Invalid request body");
  }
}
