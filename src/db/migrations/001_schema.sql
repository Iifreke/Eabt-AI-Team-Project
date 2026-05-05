-- ── EXTENSIONS ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── SCHOOLS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  staff_email  TEXT NOT NULL,
  branding     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

INSERT INTO schools (slug, name, staff_email, branding) VALUES
  ('backock', 'Backock School', 'admin@backock.edu.ng',
   '{"primaryColor":"#1a73e8","welcomeMessage":"Welcome to Backock School!"}'),
  ('abu', 'ABU', 'admin@abu.edu.ng',
   '{"primaryColor":"#e84118","welcomeMessage":"Welcome to ABU!"}')
ON CONFLICT (slug) DO NOTHING;

-- ── DOCUMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID REFERENCES schools(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  file_type      TEXT,
  file_size      INTEGER,
  storage_path   TEXT,
  chunk_count    INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'processing',
  error_message  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ── DOCUMENT CHUNKS ─────────────────────────────────────────
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
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ── LEADS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID REFERENCES schools(id),
  session_id        TEXT NOT NULL,
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  zoho_contact_id   TEXT,
  zoho_synced_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leads_school_id_idx ON leads (school_id);
CREATE INDEX IF NOT EXISTS leads_session_id_idx ON leads (session_id);

-- ── CONVERSATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES schools(id),
  session_id      TEXT UNIQUE NOT NULL,
  lead_id         UUID REFERENCES leads(id),
  stage           TEXT DEFAULT 'onboarding',
  messages        JSONB DEFAULT '[]',
  failed_attempts INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_school_id_idx ON conversations (school_id);
CREATE INDEX IF NOT EXISTS conversations_session_id_idx ON conversations (session_id);
CREATE INDEX IF NOT EXISTS conversations_stage_idx ON conversations (stage);

-- ── ESCALATIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escalations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID REFERENCES conversations(id),
  school_id        UUID REFERENCES schools(id),
  lead_id          UUID REFERENCES leads(id),
  reason           TEXT NOT NULL,
  status           TEXT DEFAULT 'pending',
  staff_notes      TEXT,
  email_sent       BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escalations_school_id_idx ON escalations (school_id);
CREATE INDEX IF NOT EXISTS escalations_status_idx ON escalations (status);

-- ── VECTOR SEARCH FUNCTION ───────────────────────────────────
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
