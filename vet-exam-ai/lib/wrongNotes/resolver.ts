// Returns the correct repository implementation based on auth state.
// No auth session  → guest user  → localStorage
// Auth session present → signed-in user → Supabase

import type { User } from "@supabase/supabase-js";
import { createClient } from "../supabase/client";
import { LocalStorageWrongNotesRepository } from "./localStorageRepo";
import { SupabaseWrongNotesRepository } from "./supabaseRepo";
import type { WrongNotesRepository } from "./repository";

export function resolveWrongNotesRepository(
  user: User | null,
): WrongNotesRepository {
  if (user) {
    return new SupabaseWrongNotesRepository(createClient(), user.id);
  }
  return new LocalStorageWrongNotesRepository();
}
