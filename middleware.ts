import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = [/^\/(signin|signup|forgot|reset|verify|2fa)(\/|$)/, /^\/invite\//, /^\/api\/(health|cron)/, /^\/_next\//, /^\/favicon/];

/** Cheap gate: no session cookie means go to sign-in. Real validation happens on every page and action. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("nm_sid")) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin"; url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
