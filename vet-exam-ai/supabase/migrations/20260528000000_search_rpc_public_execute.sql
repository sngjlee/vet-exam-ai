-- Search pages are read-only public surfaces. Allow anon clients to execute
-- the search RPCs used by /api/search while keeping table RLS in force through
-- SECURITY INVOKER.

grant execute on function public.search_questions(text, text, integer, integer, integer)
  to anon, authenticated;

grant execute on function public.suggest_similar_queries(text)
  to anon, authenticated;
