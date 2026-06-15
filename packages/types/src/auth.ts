/**
 * Shared auth contract — single source of truth for the authenticated user
 * shape and the extra profile fields populated from the Google OAuth profile.
 *
 * Consumed by:
 *  - apps/api  → Better Auth `user.additionalFields` (server)
 *  - apps/web  → `inferAdditionalFields` on the auth client (typing) + UI
 */

/** Field-attribute definitions for the columns we add on top of Better Auth's
 *  built-in user fields. `input: false` keeps them read-only from the client —
 *  they are only ever set by the Google profile mapping on sign-in. */
export const USER_PROFILE_FIELDS = {
  givenName: { type: "string", required: false, input: false },
  familyName: { type: "string", required: false, input: false },
  locale: { type: "string", required: false, input: false },
} as const;

/** Keys of the OAuth-derived profile fields (`["givenName", "familyName", "locale"]`). */
export const USER_PROFILE_FIELD_KEYS = Object.keys(USER_PROFILE_FIELDS) as Array<
  keyof typeof USER_PROFILE_FIELDS
>;

export type UserProfileFieldKey = keyof typeof USER_PROFILE_FIELDS;

/** The full authenticated-user shape (Better Auth built-ins + our profile fields). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  givenName: string | null;
  familyName: string | null;
  locale: string | null;
  createdAt: Date;
  updatedAt: Date;
}
