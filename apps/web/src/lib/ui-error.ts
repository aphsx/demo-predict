const HIDDEN_UI_ERROR_MESSAGES = new Set([
  "API returned invalid JSON",
]);

export function getDisplayError(
  error: unknown,
  fallbackMessage: string
): string | null {
  const message = error instanceof Error ? error.message : fallbackMessage;
  return HIDDEN_UI_ERROR_MESSAGES.has(message) ? null : message;
}
