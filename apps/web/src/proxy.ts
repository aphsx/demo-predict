import { NextRequest, NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Legacy/alternate home URL — dashboard lives at `/`.
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/dashboard" ? "/" : pathname.slice("/dashboard".length) || "/";
    return NextResponse.redirect(url);
  }

  // API routes are proxied to Elysia — auth is enforced there (requireUser).
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!(await hasValidSession(request))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|eot)$).*)",
  ],
};
