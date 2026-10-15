-- Add co_agents array to track team leaders/admins who have joined a conversation
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS co_agents text[] DEFAULT '{}';
