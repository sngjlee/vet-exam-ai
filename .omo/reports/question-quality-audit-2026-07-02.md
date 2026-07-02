# Question Bank Quality Audit

Date: 2026-07-02
Source: live Supabase, active questions only (`is_active=true`)
Tool: rules identical to `pipeline/upload.py::validate_question_row` (now also enforced on upload)

## Summary

- Active questions audited: **2,835**
- Invalid (rule violations): **39 (1.4%)**
  - `choices != 5`: 39 total → 4 choices = 19, 6 choices = 19, 1 choice = 1
  - Fully broken row (empty question/answer/explanation + 1 empty choice): **1**

All violations are the choice-count rule; no `answer∉choices` violations remain among active rows.

## Action required (content decision — owner)

For each row below: either re-run the corrected rewrite through `pipeline/upload.py`
(now gated) or set `is_active=false` until fixed. Public IDs only (no source id shown).

### CRITICAL — fully broken, remove or fix immediately
- **KVLE-2897** — choices=1, empty choice, empty question/answer/explanation (live to users)

### choices = 4 (19)
KVLE-0985, KVLE-0389, KVLE-2943, KVLE-0430, KVLE-2691, KVLE-0784, KVLE-2077,
KVLE-2083, KVLE-2105, KVLE-1461, KVLE-1471, KVLE-1129, KVLE-0836, KVLE-0177,
KVLE-1803, KVLE-1185, KVLE-0268, KVLE-1237, KVLE-0933

### choices = 6 (19)
KVLE-2234, KVLE-1597, KVLE-1931, KVLE-0671, KVLE-1643, KVLE-2323, KVLE-2025,
KVLE-2996, KVLE-1724, KVLE-0453, KVLE-0455, KVLE-2375, KVLE-2715, KVLE-0504,
KVLE-0183, KVLE-2442, KVLE-2799, KVLE-2501, KVLE-2188

## Prevention (shipped this session)

- `pipeline/upload.py` now runs `validate_question_row` before upsert; invalid rows are
  excluded and reported (`choices==5`, `answer∈choices`, non-empty id/question/answer/
  explanation/choices, no duplicate/blank choices). Bypass only with `--skip-validation`.
- `pipeline/audit_questions.py` re-runs the same rules against the live DB
  (`python audit_questions.py [--all] [--json out.json]`); exits non-zero if any violation,
  so it can be wired into an ops check.

## Re-run

```bash
cd pipeline
python audit_questions.py --json ../.omo/reports/question-quality-audit-latest.json
```
