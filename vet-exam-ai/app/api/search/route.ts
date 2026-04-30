import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import {
  decodeQueryParam,
  normalizeQuery,
  parseKvleId,
  SEARCH_PAGE_SIZE,
  type SearchHit,
  type SearchResponse,
  type SearchSuggestion,
} from "../../../lib/search";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const rawQ        = decodeQueryParam(url.searchParams.get("q"));
  const rawCategory = decodeQueryParam(url.searchParams.get("category"));
  const rawRecent   = url.searchParams.get("recent_years");
  const rawPage     = url.searchParams.get("page");

  const { q, searchable } = normalizeQuery(rawQ);

  // Empty / too-short query → return empty payload (200), let the client show guidance.
  if (!searchable) {
    const empty: SearchResponse = {
      items:       [],
      total:       0,
      page:        0,
      pageSize:    SEARCH_PAGE_SIZE,
      suggestions: [],
      redirect:    null,
      error:       q.length === 0 ? null : "too_short",
    };
    return NextResponse.json(empty);
  }

  // KVLE-NNNN exact match → redirect short-circuit, skip RPC entirely.
  const kvle = parseKvleId(q);
  if (kvle) {
    const redirect: SearchResponse = {
      items:       [],
      total:       0,
      page:        0,
      pageSize:    SEARCH_PAGE_SIZE,
      suggestions: [],
      redirect:    `/questions/${encodeURIComponent(kvle)}`,
      error:       null,
    };
    return NextResponse.json(redirect);
  }

  const category = rawCategory.trim() || null;
  const recentYears = rawRecent ? Number.parseInt(rawRecent, 10) : NaN;
  const recent = Number.isFinite(recentYears) && recentYears > 0 && recentYears < 100
    ? recentYears
    : null;
  const pageNum = rawPage ? Number.parseInt(rawPage, 10) : 0;
  const page = Number.isFinite(pageNum) && pageNum >= 0 ? pageNum : 0;
  const offset = page * SEARCH_PAGE_SIZE;

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("search_questions", {
    q,
    category_filter: category,
    recent_years:    recent,
    page_size:       SEARCH_PAGE_SIZE,
    page_offset:     offset,
  });

  if (error) {
    const fail: SearchResponse = {
      items:       [],
      total:       0,
      page,
      pageSize:    SEARCH_PAGE_SIZE,
      suggestions: [],
      redirect:    null,
      error:       "internal",
    };
    return NextResponse.json(fail, { status: 500 });
  }

  const rows = data ?? [];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

  const items: SearchHit[] = rows.map((r) => ({
    id:        r.id,
    publicId:  r.public_id,
    question:  r.question,
    category:  r.category,
    matchedIn: r.matched_in as SearchHit["matchedIn"],
    headline:  r.headline,
  }));

  // 0건이면 trigram 제안 fallback. 1건 이상이면 빈 배열.
  let suggestions: SearchSuggestion[] = [];
  if (total === 0) {
    const { data: sugg } = await supabase.rpc("suggest_similar_queries", { q });
    if (sugg) {
      suggestions = sugg.map((s) => ({
        suggestion: s.suggestion,
        similarity: Number(s.similarity),
      }));
    }
  }

  const ok: SearchResponse = {
    items,
    total,
    page,
    pageSize:    SEARCH_PAGE_SIZE,
    suggestions,
    redirect:    null,
    error:       null,
  };
  return NextResponse.json(ok);
}
