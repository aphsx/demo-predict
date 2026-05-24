const DEFAULT_DEV_BYPASS_USER_ID = "dev-local-user";

export function isDevAuthBypassEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";
}

export function getDevAuthBypassUserId() {
  return process.env.DEV_AUTH_BYPASS_USER_ID?.trim() || DEFAULT_DEV_BYPASS_USER_ID;
}
