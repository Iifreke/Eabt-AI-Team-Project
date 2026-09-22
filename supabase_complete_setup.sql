-- ====================================================================
-- EDUTECH BABCOCK & ABU ADMISSIONS PLATFORM - COMPLETE SUPABASE SQL
-- Instructions: Copy and paste this script into:
-- Supabase Dashboard -> SQL Editor -> Click "Run"
-- ====================================================================

-- ── 1. EXTENSIONS ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ── 2. SCHOOLS TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  staff_email  TEXT NOT NULL,
  branding     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Ensure Default Schools Exist
INSERT INTO schools (slug, name, staff_email, branding) VALUES
  ('babcock', 'Babcock University (BU-CODEL)', 'eabtconnect@gmail.com',
   '{"primaryColor":"#003366","displayName":"Babcock University","welcomeMessage":"Welcome to Babcock University BU-CODEL Admissions Support!"}'),
  ('backock', 'Babcock University (BU-CODEL)', 'eabtconnect@gmail.com',
   '{"primaryColor":"#003366","displayName":"Babcock University","welcomeMessage":"Welcome to Babcock University BU-CODEL Admissions Support!"}'),
  ('abu', 'Ahmadu Bello University (ABU DLC)', 'eabtconnect@gmail.com',
   '{"primaryColor":"#006633","displayName":"ABU Distance Learning Centre","welcomeMessage":"Welcome to Ahmadu Bello University Distance Learning Centre Admissions Support!"}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  branding = EXCLUDED.branding;

-- ── 3. LEADS TABLE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID REFERENCES schools(id) ON DELETE SET NULL,
  session_id        TEXT NOT NULL,
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  normalized_phone  TEXT,
  channel           TEXT DEFAULT 'web',
  whatsapp_opt_in   BOOLEAN DEFAULT true,
  lead_tier         TEXT DEFAULT 'COLD',
  lead_score        INT DEFAULT 0,
  lead_label        TEXT,
  intent_tags       TEXT[] DEFAULT '{}',
  zoho_contact_id   TEXT,
  zoho_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing leads tables
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalized_phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'web';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT true;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_tier TEXT DEFAULT 'COLD';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INT DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_label TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_tags TEXT[] DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zoho_contact_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zoho_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS leads_school_id_idx ON leads (school_id);
CREATE INDEX IF NOT EXISTS leads_session_id_idx ON leads (session_id);
CREATE INDEX IF NOT EXISTS leads_normalized_phone_idx ON leads (normalized_phone);
CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email);
CREATE INDEX IF NOT EXISTS leads_zoho_contact_id_idx ON leads (zoho_contact_id);

-- ── 4. CONVERSATIONS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID REFERENCES schools(id) ON DELETE SET NULL,
  session_id          TEXT UNIQUE NOT NULL,
  lead_id             UUID REFERENCES leads(id) ON DELETE SET NULL,
  stage               TEXT DEFAULT 'onboarding',
  channel             TEXT DEFAULT 'web',
  whatsapp_phone      TEXT,
  user_web_online     BOOLEAN DEFAULT true,
  user_last_seen_web  TIMESTAMPTZ,
  admin_typing        BOOLEAN DEFAULT false,
  messages            JSONB DEFAULT '[]',
  failed_attempts     INTEGER DEFAULT 0,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing conversations tables
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'web';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_web_online BOOLEAN DEFAULT true;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_last_seen_web TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS admin_typing BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_school_id_idx ON conversations (school_id);
CREATE INDEX IF NOT EXISTS conversations_session_id_idx ON conversations (session_id);
CREATE INDEX IF NOT EXISTS conversations_lead_id_idx ON conversations (lead_id);
CREATE INDEX IF NOT EXISTS conversations_stage_idx ON conversations (stage);
CREATE INDEX IF NOT EXISTS conversations_whatsapp_phone_idx ON conversations (whatsapp_phone);
CREATE INDEX IF NOT EXISTS conversations_channel_idx ON conversations (channel);

-- ── 5. ESCALATIONS TABLE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID REFERENCES conversations(id) ON DELETE CASCADE,
  school_id          UUID REFERENCES schools(id) ON DELETE SET NULL,
  lead_id            UUID REFERENCES leads(id) ON DELETE SET NULL,
  reason             TEXT NOT NULL,
  status             TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')),
  priority           TEXT DEFAULT 'normal',
  sla_minutes        INTEGER DEFAULT 15,
  staff_notes        TEXT,
  attended_by        TEXT,
  attended_at        TIMESTAMPTZ,
  resolved_by        TEXT,
  resolved_at        TIMESTAMPTZ,
  first_response_at  TIMESTAMPTZ,
  tags               TEXT[] DEFAULT '{}',
  email_sent         BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing escalations tables
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS sla_minutes INTEGER DEFAULT 15;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS staff_notes TEXT;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS attended_by TEXT;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS attended_at TIMESTAMPTZ;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS escalations_school_id_idx ON escalations (school_id);
CREATE INDEX IF NOT EXISTS escalations_status_idx ON escalations (status);
CREATE INDEX IF NOT EXISTS escalations_conversation_id_idx ON escalations (conversation_id);
CREATE INDEX IF NOT EXISTS escalations_attended_by_idx ON escalations (attended_by);
CREATE INDEX IF NOT EXISTS escalations_created_at_idx ON escalations (created_at DESC);

-- ── 6. TICKETS TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID REFERENCES schools(id) ON DELETE SET NULL,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'in_progress', 'resolved', 'closed')),
  staff_reply   TEXT,
  tags          TEXT[] DEFAULT '{}',
  assigned_to   TEXT,
  replied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing tickets tables
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS staff_reply TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS tickets_school_id_idx ON tickets (school_id);
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_email_idx ON tickets (email);
CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON tickets (created_at DESC);

-- ── 7. ADMIN PROFILES TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'agent')),
  status        TEXT DEFAULT 'offline',
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_profiles_email_idx ON admin_profiles (email);
CREATE INDEX IF NOT EXISTS admin_profiles_role_idx ON admin_profiles (role);

-- ── 8. SHORTCUTS / QUICK REPLIES TABLE ─────────────────────────────
CREATE TABLE IF NOT EXISTS shortcuts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  shortcut    TEXT NOT NULL,
  message     TEXT,
  content     TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Idempotent column additions for existing shortcuts
ALTER TABLE shortcuts ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE shortcuts ADD COLUMN IF NOT EXISTS message TEXT;

-- Seed default shortcuts if table is empty
INSERT INTO shortcuts (name, shortcut, message, content, created_by) VALUES
  ('takeover', '/takeover', 'Hi, this conversation has been escalated to an admissions advisor. I am reviewing your inquiry now and will assist you shortly.', 'Hi, this conversation has been escalated to an admissions advisor. I am reviewing your inquiry now and will assist you shortly.', 'System'),
  ('reviewing', '/review', 'Thank you for your patience. I am currently reviewing your academic requirements and application details.', 'Thank you for your patience. I am currently reviewing your academic requirements and application details.', 'System'),
  ('delay', '/wait', 'Thank you for your patience while I confirm this detail with the admissions office.', 'Thank you for your patience while I confirm this detail with the admissions office.', 'System'),
  ('closing', '/close', 'Thank you for contacting our Admissions Directorate. We wish you great success in your academic pursuit!', 'Thank you for contacting our Admissions Directorate. We wish you great success in your academic pursuit!', 'System'),
  ('portal help', '/portal', 'If you are experiencing issues with the admissions portal, please share your application number and the specific error message.', 'If you are experiencing issues with the admissions portal, please share your application number and the specific error message.', 'System')
ON CONFLICT DO NOTHING;

-- ── 9. WHATSAPP MESSAGE DEDUPLICATION ──────────────────────────────
CREATE TABLE IF NOT EXISTS processed_whatsapp_messages (
  message_id    TEXT PRIMARY KEY,
  from_phone    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processed_whatsapp_messages_processed_at_idx ON processed_whatsapp_messages (processed_at DESC);

-- ── 10. KNOWLEDGE BASE DOCUMENTS & VECTOR CHUNKS ────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID REFERENCES schools(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  file_type      TEXT,
  file_size      INTEGER,
  storage_path   TEXT,
  chunk_count    INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'processed',
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  school_id    UUID REFERENCES schools(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  embedding    VECTOR(1536),
  chunk_index  INTEGER,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_school_id_idx ON document_chunks (school_id);
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── 11. VECTOR MATCH FUNCTION ──────────────────────────────────────
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding   VECTOR(1536),
  match_school_id   UUID,
  match_count       INT DEFAULT 5,
  match_threshold   FLOAT DEFAULT 0.4
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    dc.id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.school_id = match_school_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── 12. AUTOMATIC UPDATED_AT TRIGGER ────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_leads_updated_at ON leads;
CREATE TRIGGER set_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_conversations_updated_at ON conversations;
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_escalations_updated_at ON escalations;
CREATE TRIGGER set_escalations_updated_at
  BEFORE UPDATE ON escalations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_tickets_updated_at ON tickets;
CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 13. REALTIME PUBLICATION SETUP ──────────────────────────────────
-- Enable Realtime events for live chat, tickets, presence & escalations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE escalations;
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_profiles;

-- ── 14. ROW LEVEL SECURITY (RLS) POLICIES ───────────────────────────
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortcuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Allow public read access to schools for widget branding
CREATE POLICY "Public read schools" ON schools FOR SELECT USING (true);

-- Allow backend service role & public API widget lead / chat operations
CREATE POLICY "Allow public insert leads" ON leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select leads" ON leads FOR SELECT USING (true);
CREATE POLICY "Allow public update leads" ON leads FOR UPDATE USING (true);

CREATE POLICY "Allow public insert conversations" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select conversations" ON conversations FOR SELECT USING (true);
CREATE POLICY "Allow public update conversations" ON conversations FOR UPDATE USING (true);

CREATE POLICY "Allow public insert escalations" ON escalations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select escalations" ON escalations FOR SELECT USING (true);
CREATE POLICY "Allow public update escalations" ON escalations FOR UPDATE USING (true);

CREATE POLICY "Allow public insert tickets" ON tickets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select tickets" ON tickets FOR SELECT USING (true);
CREATE POLICY "Allow public update tickets" ON tickets FOR UPDATE USING (true);

CREATE POLICY "Allow public select shortcuts" ON shortcuts FOR SELECT USING (true);
CREATE POLICY "Allow authenticated manage shortcuts" ON shortcuts FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated read admin_profiles" ON admin_profiles FOR SELECT USING (true);
CREATE POLICY "Allow authenticated update admin_profiles" ON admin_profiles FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow public read document_chunks" ON document_chunks FOR SELECT USING (true);
CREATE POLICY "Allow public read documents" ON documents FOR SELECT USING (true);

