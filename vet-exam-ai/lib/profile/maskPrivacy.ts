import type { Database } from "../supabase/types";

export type UserProfilePublicRow =
  Database["public"]["Tables"]["user_profiles_public"]["Row"];

/**
 * Apply visibility toggles. Returns a copy with sensitive fields nulled out
 * for non-owner viewers. RLS allows world-read of all columns, so masking is
 * the app's responsibility.
 */
export function maskProfile(
  profile: UserProfilePublicRow,
  isOwner: boolean,
): UserProfilePublicRow {
  if (isOwner) return profile;
  return {
    ...profile,
    target_round: profile.target_round_visible ? profile.target_round : null,
    university: profile.university_visible ? profile.university : null,
  };
}
