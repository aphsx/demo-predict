export function canMutateOwnedRecord(
  userId: string | null | undefined,
  ownerUserId: string | null | undefined
): boolean {
  return Boolean(userId && ownerUserId && userId === ownerUserId);
}

export function canReadOwnedRecord(
  userId: string | null | undefined,
  ownerUserId: string | null | undefined
): boolean {
  return canMutateOwnedRecord(userId, ownerUserId);
}

export function denyMutation(
  set: { status?: number | string },
  message = "You can read this record, but only its owner can modify it."
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
 * Read guard. Returns a 404 deny body if the record is missing OR not owned by
 * the current user — existence is hidden to prevent enumeration. Returns null
 * when reading is allowed. Usage: `const denied = requireOwnedForRead(...); if (denied) return denied;`
 */
export function requireOwnedForRead(
  record: unknown,
  ownerUserId: string | null | undefined,
  userId: string | null | undefined,
  set: { status?: number | string },
  notFoundMessage = "Not found"
): DenyBody | null {
  if (!record || !canReadOwnedRecord(userId, ownerUserId)) {
    return denyNotFound(set, notFoundMessage);
  }
  return null;
}

/**
 * Mutation guard. Returns 404 if the record is missing, or 403 if it exists but
 * is owned by someone else. Returns null when the mutation is allowed.
 */
export function requireOwnedForMutation(
  record: unknown,
  ownerUserId: string | null | undefined,
  userId: string | null | undefined,
  set: { status?: number | string },
  messages: { notFound?: string; forbidden?: string } = {}
): DenyBody | null {
  if (!record) return denyNotFound(set, messages.notFound ?? "Not found");
  if (!canMutateOwnedRecord(userId, ownerUserId)) {
    return denyMutation(set, messages.forbidden);
  }
  return null;
}
