-- Migration 003: Create tickets table
-- Run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id) ON DELETE SET NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  staff_reply   TEXT,
  tags          TEXT[] DEFAULT '{}',
  assigned_to   TEXT,
  replied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tickets_school_id_idx ON tickets (school_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx    ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_email_idx     ON tickets (email);
CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON tickets (created_at DESC);
