-- Add household invite links that can be accepted by existing or new users.

CREATE TABLE IF NOT EXISTS household_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  token        TEXT NOT NULL UNIQUE,
  invited_by   UUID,
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS household_invites_household_idx
  ON household_invites (household_id);

CREATE INDEX IF NOT EXISTS household_invites_email_idx
  ON household_invites (lower(email));

ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;
