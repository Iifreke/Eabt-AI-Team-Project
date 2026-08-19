-- Migration 004: WhatsApp Omnichannel and Zoho Integration Support
-- Run this in the Supabase SQL editor

-- ── 1. CONVERSATIONS ENHANCEMENTS ───────────────────────────
-- Add channel and WhatsApp metadata to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'omnichannel'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_last_seen_web TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_web_online BOOLEAN DEFAULT true;

-- ── 2. LEADS ENHANCEMENTS ───────────────────────────────────
-- Add WhatsApp tracking and normalized phone numbers to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT true;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS normalized_phone TEXT;

-- ── 3. PROCESSED WHATSAPP MESSAGES (IDEMPOTENCY) ────────────
-- Deduplicate incoming Meta WhatsApp Cloud API webhooks
CREATE TABLE IF NOT EXISTS processed_whatsapp_messages (
  message_id    TEXT PRIMARY KEY,
  from_phone    TEXT NOT NULL,
  processed_at  TIMESTAMPTZ DEFAULT now()
);

-- ── 4. INDEXES ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS leads_normalized_phone_idx ON leads (normalized_phone);
CREATE INDEX IF NOT EXISTS conversations_whatsapp_phone_idx ON conversations (whatsapp_phone);
CREATE INDEX IF NOT EXISTS conversations_channel_idx ON conversations (channel);
CREATE INDEX IF NOT EXISTS processed_whatsapp_messages_processed_at_idx ON processed_whatsapp_messages (processed_at DESC);
