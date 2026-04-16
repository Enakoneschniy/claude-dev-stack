-- 002-entity-display-name.sql
-- Phase 38: adds entities.display_name (first-seen original casing preserved)
--           adds sessions.source_hash (sha256 for backfill idempotency per D-95)
--
-- After this migration, entities.name becomes the normalized UNIQUE key
-- (trim().toLowerCase() applied at upsertEntity boundary per D-103/D-105).
-- Pre-existing entities (possibly seeded by Phase 36 auto-capture) have
-- display_name backfilled with the current name value.

ALTER TABLE entities ADD COLUMN display_name TEXT;
ALTER TABLE sessions ADD COLUMN source_hash TEXT;

-- Backfill display_name for any entities created before Phase 38.
UPDATE entities SET display_name = name WHERE display_name IS NULL;
