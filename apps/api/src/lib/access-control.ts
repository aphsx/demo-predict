export function canMutateOwnedRecord(
  userId: string | null | undefined,
  ownerUserId: string | null | undefined
): boolean {
  return Boolean(userId && ownerUserId && userId === ownerUserId);
}

export function denyMutation(
  set: { status?: number | string },
  message = "You can read this record, but only its owner can modify it."
) {
  set.status = 403;
  return { message };
}
