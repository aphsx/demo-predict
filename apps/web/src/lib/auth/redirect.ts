/**
 * Validates a post-login `redirect` query param before we navigate to it.
 * Only allows app-internal absolute paths; blocks protocol-relative URLs
 * (`//evil.com`) and maps the legacy `/dashboard` home to `/`.
 */
export function sanitizeRedirectParam(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  // Dashboard is served at `/`; old links may still point here after OAuth.
  if (path === "/dashboard" || path.startsWith("/dashboard/")) return "/";
  return path;
}
