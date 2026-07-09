-- =============================================================================
-- Phase 3 (perf): index notifications.related_comment_id
-- =============================================================================
-- related_comment_id is an FK (references comments(id) on delete cascade) with
-- no dedicated index. The only index that mentions it,
-- notifications_milestone_unique (user_id, related_comment_id, payload->>'milestone'),
-- leads with user_id, so it cannot serve related_comment_id-only lookups or the
-- per-comment cascade delete (delete from notifications where related_comment_id=$1),
-- which currently seq-scans the whole table on every comment deletion.
--
-- Partial (where not null): most notifications (milestones, board events) carry a
-- NULL related_comment_id; the FK equality lookup only ever probes non-null
-- values, so excluding NULLs keeps the index small without losing coverage.
--
-- NOTE: comment_reports(comment_id) was intentionally NOT added -- it is already
-- covered by the existing unique(comment_id, reporter_id) btree (comment_id leads).
create index if not exists notifications_related_comment_id_idx
  on public.notifications (related_comment_id)
  where related_comment_id is not null;
