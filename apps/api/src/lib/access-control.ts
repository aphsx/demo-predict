/**
 * Org-shared access model.
 *
 * Reads are org-wide: any authenticated user can see every run/source/output,
 * so read guards only check existence (404). Mutations (delete/retry) are
 * allowed for the record's creator OR an admin — a missing/null owner is a
 * 403 for non-admins, never a silent bypass.
 */

export function canMutateOwnedRecord(
  userId: string | null | undefined,
  ownerUserId: string | null | undefined
): boolean {
  return Boolean(userId && ownerUserId && userId === ownerUserId);
}

export function denyMutation(
  set: { status?: number | string },
  message = "Only the creator of this record or an admin can modify it."
) {
  set.status = 403;
  return { message };
}

export function denyNotFound(
  set: { status?: number | string },
  message = "Not found"
) {
  set.status = 404;
  return { message };
}

type DenyBody = { message: string };

/**
 * Read guard (org-wide). Returns a 404 deny body only when the record is
 * missing. Usage: `const denied = requireFoundForRead(...); if (denied) return denied;`
 */
export function requireFoundForRead(
  record: unknown,
  set: { status?: number | string },
  notFoundMessage = "Not found"
): DenyBody | null {
  if (!record) return denyNotFound(set, notFoundMessage);
  return null;
}

/**
 * Mutation guard. Returns 404 if the record is missing, or 403 if the caller
 * is neither the creator nor an admin (ownerUserId null ⇒ 403 for non-admins).
 * Returns null when the mutation is allowed.
 */
export function requireCreatorOrAdminForMutation(
  record: unknown,
  ownerUserId: string | null | undefined,
  userId: string | null | undefined,
  isAdmin: boolean,
  set: { status?: number | string },
  messages: { notFound?: string; forbidden?: string } = {}
): DenyBody | null {
  if (!record) return denyNotFound(set, messages.notFound ?? "Not found");
  if (isAdmin) return null;
  if (!canMutateOwnedRecord(userId, ownerUserId)) {
    return denyMutation(set, messages.forbidden);
  }
  return null;
}
