-- ============================================================
-- Family Finance App — Supabase Database Schema
-- Run this entire file in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. BALANCE TABLE
-- Stores a single row representing the family's bank balance
CREATE TABLE IF NOT EXISTS balance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton  BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton),
  amount     DECIMAL(12, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE balance
  ADD COLUMN IF NOT EXISTS singleton BOOLEAN NOT NULL DEFAULT TRUE CHECK (singleton);

DELETE FROM balance
WHERE id NOT IN (
  SELECT id
  FROM balance
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS balance_singleton_idx ON balance (singleton);

-- Insert the one balance row (you'll update the amount in the app or via SQL)
INSERT INTO balance (singleton, amount) VALUES (TRUE, 0)
ON CONFLICT (singleton) DO NOTHING;


-- 2. BILLS TABLE
-- Each bill has a name, amount, due date, category, and optional recurrence
CREATE TABLE IF NOT EXISTS bills (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  amount             DECIMAL(12, 2) NOT NULL,
  due_date           DATE NOT NULL,
  category           TEXT NOT NULL DEFAULT 'Other',
  is_recurring       BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_period  TEXT CHECK (recurrence_period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
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
  payment_method TEXT,
  memo        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID REFERENCES bills(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  sent_to     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bill_id, due_date, sent_to)
);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Makes sure only logged-in family members can see/edit data
-- ============================================================

ALTER TABLE balance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Authenticated users can manage reminder log"
  ON reminder_log FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- ATOMIC MONEY OPERATIONS
-- Keep balance, bills, transactions, and recurring bills in sync.
-- ============================================================

CREATE OR REPLACE FUNCTION adjust_business_due_date(p_due_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE EXTRACT(ISODOW FROM p_due_date)
    WHEN 6 THEN p_due_date - INTERVAL '1 day'
    WHEN 7 THEN p_due_date - INTERVAL '2 days'
    ELSE p_due_date
  END::DATE;
$$;

CREATE OR REPLACE FUNCTION normalize_bill_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.due_date := adjust_business_due_date(NEW.due_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bills_normalize_due_date ON bills;

CREATE TRIGGER bills_normalize_due_date
BEFORE INSERT OR UPDATE OF due_date ON bills
FOR EACH ROW
EXECUTE FUNCTION normalize_bill_due_date();

CREATE OR REPLACE FUNCTION record_deposit(
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Deposit'
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance_id UUID;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be greater than zero';
  END IF;

  SELECT id
  INTO v_balance_id
  FROM balance
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    INSERT INTO balance (amount)
    VALUES (0)
    RETURNING id INTO v_balance_id;
  END IF;

  UPDATE balance
  SET amount = amount + p_amount,
      updated_at = NOW()
  WHERE id = v_balance_id
  RETURNING amount INTO v_new_balance;

  INSERT INTO transactions (type, amount, description, category)
  VALUES ('deposit', p_amount, COALESCE(NULLIF(TRIM(p_description), ''), 'Deposit'), 'Other');

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION pay_bill(
  p_bill_id UUID,
  p_payment_method TEXT DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_bill bills%ROWTYPE;
  v_balance_id UUID;
  v_new_balance NUMERIC;
  v_next_due_date DATE;
BEGIN
  SELECT *
  INTO v_bill
  FROM bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF v_bill.is_paid THEN
    RAISE EXCEPTION 'Bill is already paid';
  END IF;

  SELECT id
  INTO v_balance_id
  FROM balance
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    INSERT INTO balance (amount)
    VALUES (0)
    RETURNING id INTO v_balance_id;
  END IF;

  UPDATE balance
  SET amount = amount - v_bill.amount,
      updated_at = NOW()
  WHERE id = v_balance_id
  RETURNING amount INTO v_new_balance;

  UPDATE bills
  SET is_paid = TRUE,
      paid_date = NOW()
  WHERE id = v_bill.id;

  INSERT INTO transactions (
    type,
    amount,
    description,
    category,
    bill_id,
    payment_method,
    memo
  )
  VALUES (
    'payment',
    v_bill.amount,
    v_bill.name,
    v_bill.category,
    v_bill.id,
    NULLIF(TRIM(p_payment_method), ''),
    NULLIF(TRIM(p_memo), '')
  );

  IF v_bill.is_recurring AND v_bill.recurrence_period IS NOT NULL THEN
    v_next_due_date :=
      CASE v_bill.recurrence_period
        WHEN 'weekly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '7 days')
        WHEN 'monthly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '1 month')
        WHEN 'quarterly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '3 months')
        WHEN 'yearly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '1 year')
      END;

    INSERT INTO bills (
      name,
      amount,
      due_date,
      category,
      is_recurring,
      recurrence_period,
      is_paid,
      notes
    )
    VALUES (
      v_bill.name,
      v_bill.amount,
      v_next_due_date,
      v_bill.category,
      TRUE,
      v_bill.recurrence_period,
      FALSE,
      v_bill.notes
    );
  END IF;

  RETURN v_new_balance;
END;
$$;


-- ============================================================
-- OPTIONAL: Set your starting balance
-- Uncomment and edit the line below to set an initial balance
-- (you can also do this from the app's dashboard)
-- ============================================================

-- UPDATE balance SET amount = 5000.00 WHERE id = (SELECT id FROM balance LIMIT 1);


-- ============================================================
-- HOUSEHOLD SUPPORT
-- Adds multiple households and scopes balances, bills,
-- transactions, and reminder emails by household.
-- ============================================================

CREATE TABLE IF NOT EXISTS households (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS household_members_household_email_idx
  ON household_members (household_id, lower(email));

DO $$
DECLARE
  v_household_id UUID;
  v_owner_id UUID;
BEGIN
  SELECT id INTO v_household_id FROM households ORDER BY created_at LIMIT 1;
  SELECT id INTO v_owner_id FROM auth.users ORDER BY created_at LIMIT 1;

  IF v_household_id IS NULL THEN
    INSERT INTO households (name, created_by)
    VALUES ('Family Household', v_owner_id)
    RETURNING id INTO v_household_id;
  END IF;

  INSERT INTO household_members (household_id, user_id, email, role)
  SELECT
    v_household_id,
    users.id,
    users.email,
    CASE WHEN users.id = v_owner_id THEN 'owner' ELSE 'member' END
  FROM auth.users users
  WHERE users.email IS NOT NULL
  ON CONFLICT (household_id, user_id) DO UPDATE
  SET email = EXCLUDED.email;

  ALTER TABLE balance ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
  ALTER TABLE bills ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;
  ALTER TABLE reminder_log ADD COLUMN IF NOT EXISTS household_id UUID REFERENCES households(id) ON DELETE CASCADE;

  UPDATE balance SET household_id = v_household_id WHERE household_id IS NULL;
  UPDATE bills SET household_id = v_household_id WHERE household_id IS NULL;
  UPDATE transactions SET household_id = v_household_id WHERE household_id IS NULL;
  UPDATE reminder_log SET household_id = v_household_id WHERE household_id IS NULL;
END $$;

ALTER TABLE balance ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN household_id SET NOT NULL;
ALTER TABLE reminder_log ALTER COLUMN household_id SET NOT NULL;

DROP INDEX IF EXISTS balance_singleton_idx;
CREATE UNIQUE INDEX IF NOT EXISTS balance_household_idx ON balance (household_id);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage balance" ON balance;
DROP POLICY IF EXISTS "Authenticated users can manage bills" ON bills;
DROP POLICY IF EXISTS "Authenticated users can manage transactions" ON transactions;
DROP POLICY IF EXISTS "Authenticated users can manage reminder log" ON reminder_log;
DROP POLICY IF EXISTS "Members can view households" ON households;
DROP POLICY IF EXISTS "Authenticated users can create households" ON households;
DROP POLICY IF EXISTS "Owners can update households" ON households;
DROP POLICY IF EXISTS "Members can view memberships" ON household_members;
DROP POLICY IF EXISTS "Users can add themselves to households" ON household_members;
DROP POLICY IF EXISTS "Members can manage household balance" ON balance;
DROP POLICY IF EXISTS "Members can manage household bills" ON bills;
DROP POLICY IF EXISTS "Members can manage household transactions" ON transactions;
DROP POLICY IF EXISTS "Members can manage household reminder log" ON reminder_log;

CREATE POLICY "Members can view households"
  ON households FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
        AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create households"
  ON households FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owners can update households"
  ON households FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
        AND household_members.user_id = auth.uid()
        AND household_members.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = households.id
        AND household_members.user_id = auth.uid()
        AND household_members.role = 'owner'
    )
  );

CREATE POLICY "Members can view memberships"
  ON household_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can add themselves to households"
  ON household_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM households
      WHERE households.id = household_members.household_id
        AND households.created_by = auth.uid()
    )
  );

CREATE POLICY "Members can manage household balance"
  ON balance FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = balance.household_id
        AND household_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = balance.household_id
        AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage household bills"
  ON bills FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = bills.household_id
        AND household_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = bills.household_id
        AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage household transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = transactions.household_id
        AND household_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = transactions.household_id
        AND household_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage household reminder log"
  ON reminder_log FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = reminder_log.household_id
        AND household_members.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = reminder_log.household_id
        AND household_members.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION record_deposit(
  p_amount NUMERIC,
  p_description TEXT DEFAULT 'Deposit',
  p_household_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_household_id UUID;
  v_balance_id UUID;
  v_new_balance NUMERIC;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deposit amount must be greater than zero';
  END IF;

  v_household_id := p_household_id;

  IF v_household_id IS NULL THEN
    SELECT household_id
    INTO v_household_id
    FROM household_members
    WHERE user_id = auth.uid()
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Household is required';
  END IF;

  SELECT id
  INTO v_balance_id
  FROM balance
  WHERE household_id = v_household_id
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    INSERT INTO balance (household_id, amount)
    VALUES (v_household_id, 0)
    RETURNING id INTO v_balance_id;
  END IF;

  UPDATE balance
  SET amount = amount + p_amount,
      updated_at = NOW()
  WHERE id = v_balance_id
  RETURNING amount INTO v_new_balance;

  INSERT INTO transactions (household_id, type, amount, description, category)
  VALUES (v_household_id, 'deposit', p_amount, COALESCE(NULLIF(TRIM(p_description), ''), 'Deposit'), 'Other');

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION pay_bill(
  p_bill_id UUID,
  p_payment_method TEXT DEFAULT NULL,
  p_memo TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_bill bills%ROWTYPE;
  v_balance_id UUID;
  v_new_balance NUMERIC;
  v_next_due_date DATE;
BEGIN
  SELECT *
  INTO v_bill
  FROM bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF v_bill.is_paid THEN
    RAISE EXCEPTION 'Bill is already paid';
  END IF;

  SELECT id
  INTO v_balance_id
  FROM balance
  WHERE household_id = v_bill.household_id
  FOR UPDATE;

  IF v_balance_id IS NULL THEN
    INSERT INTO balance (household_id, amount)
    VALUES (v_bill.household_id, 0)
    RETURNING id INTO v_balance_id;
  END IF;

  UPDATE balance
  SET amount = amount - v_bill.amount,
      updated_at = NOW()
  WHERE id = v_balance_id
  RETURNING amount INTO v_new_balance;

  UPDATE bills
  SET is_paid = TRUE,
      paid_date = NOW()
  WHERE id = v_bill.id;

  INSERT INTO transactions (
    household_id,
    type,
    amount,
    description,
    category,
    bill_id,
    payment_method,
    memo
  )
  VALUES (
    v_bill.household_id,
    'payment',
    v_bill.amount,
    v_bill.name,
    v_bill.category,
    v_bill.id,
    NULLIF(TRIM(p_payment_method), ''),
    NULLIF(TRIM(p_memo), '')
  );

  IF v_bill.is_recurring AND v_bill.recurrence_period IS NOT NULL THEN
    v_next_due_date :=
      CASE v_bill.recurrence_period
        WHEN 'weekly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '7 days')
        WHEN 'monthly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '1 month')
        WHEN 'quarterly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '3 months')
        WHEN 'yearly' THEN adjust_business_due_date(v_bill.due_date + INTERVAL '1 year')
      END;

    INSERT INTO bills (
      household_id,
      name,
      amount,
      due_date,
      category,
      is_recurring,
      recurrence_period,
      is_paid,
      notes
    )
    VALUES (
      v_bill.household_id,
      v_bill.name,
      v_bill.amount,
      v_next_due_date,
      v_bill.category,
      TRUE,
      v_bill.recurrence_period,
      FALSE,
      v_bill.notes
    );
  END IF;

  RETURN v_new_balance;
END;
$$;
