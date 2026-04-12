-- Family Finance baseline schema and atomic money operations.

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

INSERT INTO balance (singleton, amount) VALUES (TRUE, 0)
ON CONFLICT (singleton) DO NOTHING;

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

CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('deposit', 'payment')),
  amount      DECIMAL(12, 2) NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Other',
  bill_id     UUID REFERENCES bills(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE balance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'balance'
      AND policyname = 'Authenticated users can manage balance'
  ) THEN
    CREATE POLICY "Authenticated users can manage balance"
      ON balance FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bills'
      AND policyname = 'Authenticated users can manage bills'
  ) THEN
    CREATE POLICY "Authenticated users can manage bills"
      ON bills FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transactions'
      AND policyname = 'Authenticated users can manage transactions'
  ) THEN
    CREATE POLICY "Authenticated users can manage transactions"
      ON transactions FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

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

CREATE OR REPLACE FUNCTION pay_bill(p_bill_id UUID)
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

  INSERT INTO transactions (type, amount, description, category, bill_id)
  VALUES ('payment', v_bill.amount, v_bill.name, v_bill.category, v_bill.id);

  IF v_bill.is_recurring AND v_bill.recurrence_period IS NOT NULL THEN
    v_next_due_date :=
      CASE v_bill.recurrence_period
        WHEN 'weekly' THEN v_bill.due_date + INTERVAL '7 days'
        WHEN 'monthly' THEN v_bill.due_date + INTERVAL '1 month'
        WHEN 'yearly' THEN v_bill.due_date + INTERVAL '1 year'
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
