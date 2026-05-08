-- =============================================================================
-- Hotfix: relax signup_applications.proof_kind_payload_consistent CHECK
-- =============================================================================
-- The original constraint required (kind='image' → path NOT NULL) and
-- (kind='text' → text NOT NULL). approve_signup_application nulls
-- proof_storage_path after copying the value (so the storage delete can run
-- on a captured local) — that violated the constraint and aborted approval.
--
-- New rule: only forbid cross-contamination (image kind must not have text,
-- text kind must not have path). Allowing both null is safe for cleared rows.
-- The RPC's pre-insert validation still enforces "must have one filled" on
-- submission, so the table-level check was redundant in that regard.
-- =============================================================================

alter table public.signup_applications
  drop constraint if exists proof_kind_payload_consistent;

alter table public.signup_applications
  add constraint proof_kind_payload_consistent check (
    (proof_kind = 'image' and proof_text is null)
    or
    (proof_kind = 'text'  and proof_storage_path is null)
  );
