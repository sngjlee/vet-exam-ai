import { cache } from "react";
import { createClient } from "../supabase/server";

export type FilterOptions = {
  rounds: number[];
  years: number[];
  sessions: number[];
  subjects: string[];
  categories: string[];
};

const FALLBACK: FilterOptions = {
  rounds: [],
  years: [],
  sessions: [],
  subjects: [],
  categories: [],
};

export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_questions_filter_options");
  if (error || !data) return FALLBACK;
  const o = data as FilterOptions;
  return {
    rounds: o.rounds ?? [],
    years: o.years ?? [],
    sessions: o.sessions ?? [],
    subjects: o.subjects ?? [],
    categories: o.categories ?? [],
  };
});
