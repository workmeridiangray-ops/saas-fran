import { NextResponse, type NextRequest } from "next/server";

/**
 * Passes the requested path to server components so the sign-in redirect can return people to it.
 * It deliberately does not gate access: every page and every API route checks the session itself,
 * and a redirect issued from here can't be made host-independent behind a proxy.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-nm-path", req.nextUrl.pathname + req.nextUrl.search);   // always overwritten: a client can't forge it
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
