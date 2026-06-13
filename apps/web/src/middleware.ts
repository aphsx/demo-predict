import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

const ELYSIA_URL = process.env.ELYSIA_URL ?? "http://localhost:3001";

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;

  try {
    const res = await fetch(`${ELYSIA_URL}/api/auth/get-session`, {
      headers: { cookie },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const session = (await res.json()) as { user?: { id?: string } } | null;
    return Boolean(session?.user?.id);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
