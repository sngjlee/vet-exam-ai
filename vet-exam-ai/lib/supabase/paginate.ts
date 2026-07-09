// PostgREST caps a single response at `max_rows` (1000 in this project), so any
// unbounded list must page through ranges or it silently truncates. This helper
// runs a ranged query repeatedly until a short page signals the end, collecting
// every row. The caller supplies a function that applies `.range(from, to)` to
// its own query, keeping filters/ordering local to the call site.
//
// See memory quiz_selector: "Supabase fetch는 항상 pagination".

export const SUPABASE_PAGE_SIZE = 1000;

export type PagedResult<T> = { data: T[]; error: unknown };

export async function fetchAllPaged<T>(
  runPage: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<PagedResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await runPage(from, from + pageSize - 1);
    if (error) return { data: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}
