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
