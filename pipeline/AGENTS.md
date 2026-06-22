# PIPELINE KNOWLEDGE BASE

## OVERVIEW
`pipeline/` contains local content-processing scripts for exam intake, AI rewrite, topic normalization, image backfill, and Supabase upload.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Setup and flow | `README.md` | Start here before changing scripts |
| Python deps | `requirements.txt` | Pipeline-specific environment |
| Source extraction | `extract.py` | Raw exam intake |
| Rewrite step | `rewrite.py` | AI-rewritten question candidates |
| Topic cleanup | `normalize_topics.py`, `suggest_topic_aliases.py`, `topic_aliases.json` | Subject/topic consistency |
| Upload | `upload.py`, `upload_images.py`, `_storage_key.py` | Supabase insertion/storage helpers |
| Backfill | `backfill_topics.py`, `backfill_image_files.py` | Post-upload cleanup |
| Manual PowerShell flow | `topic_cleanup_2step.ps1` | Windows helper for topic cleanup |

## CONVENTIONS
- Treat `.env` as local-only secret material; use `.env.example` for documented keys.
- Install and run pipeline tools from this directory so relative input/output paths stay predictable.
- Keep raw exam material, rewritten candidates, and upload-ready records separate.
- Preserve metadata needed for traceability: source, round/year/session, rewrite model/prompt version, review status, import batch, and asset status.
- For image questions, prefer rights-safe rebuild/removal/licensed-asset workflows over source-image reuse.
- Validate small batches before bulk upload; keep rollback/import-batch logic intact.

## ANTI-PATTERNS
- Do not commit generated output, local secrets, or raw private processing artifacts.
- Do not upload latest exam source images/text verbatim into the service database.
- Do not collapse 20-subject taxonomy back to the older small-subject grouping.
- Do not bypass human review flags for AI-rewritten question content.
