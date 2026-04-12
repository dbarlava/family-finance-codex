-- ============================================================
-- Family Finance App — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. BALANCE TABLE
-- Stores a single row representing the family's bank balance
CREATE TABLE IF NOT EXISTS balance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the one balance row (you'll update the amount in the app or via SQL)
INSERT INTO balance (amount) VALUES (0)
ON CONFLICT DO NOTHING;


-- 2. BILLS TABLE
-- Each bill has a name, amount, due date, category, and optional recurrence
CREATE TABLE IF NOT EXISTS bills (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  amount             DECIMAL(12, 2) NOT NULL,
  due_date           DATE NOT NULL,
  category           TEXT NOT NULL DEFAULT 'Other',
  is_recurring       BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_period  TEXT CHECK (recurrence_period IN ('weekly', 'monthly', 'yearly')),
  is_paid            BOOLEAN NOT NULL DEFAULT FALSE,
  paid_date          TIMESTAMPTZ,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);


-- 3. TRANSACTIONS TABLE
-- Records every deposit and bill payment
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('deposit', 'payment')),
  amount      DECIMAL(12, 2) NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Other',
  bill_id     UUID REFERENCES bills(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Makes sure only logged-in family members can see/edit data
-- ============================================================

ALTER TABLE balance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated (logged-in) user full access to all tables
CREATE POLICY "Authenticated users can manage balance"
  ON balance FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage bills"
  ON bills FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- OPTIONAL: Set your starting balance
-- Uncomment and edit the line below to set an initial balance
-- (you can also do this from the app's dashboard)
-- ============================================================

-- UPDATE balance SET amount = 5000.00 WHERE id = (SELECT id FROM balance LIMIT 1);
