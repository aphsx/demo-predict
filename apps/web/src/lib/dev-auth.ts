export function isDevAuthBypassEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.DEV_AUTH_BYPASS === "true" ||
      process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true")
  );
}
