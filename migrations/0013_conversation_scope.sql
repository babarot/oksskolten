ALTER TABLE conversations ADD COLUMN scope_type TEXT;
ALTER TABLE conversations ADD COLUMN scope_payload_json TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_user_scope_updated_at
  ON conversations(user_id, scope_type, updated_at DESC);
