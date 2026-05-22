-- Migration 002: Agent metrics support
-- Adds first_response_at to track when an agent first replied to an escalation.
-- attended_by, resolved_by, tags are already present in production but listed here
-- as idempotent ADD COLUMN IF NOT EXISTS for completeness.

ALTER TABLE escalations ADD COLUMN IF NOT EXISTS attended_by TEXT;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS escalations_attended_by_idx ON escalations (attended_by);
