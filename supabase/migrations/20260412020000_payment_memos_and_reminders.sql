-- Store payment details and support due-date email reminders.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS memo TEXT;

CREATE TABLE IF NOT EXISTS reminder_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     UUID REFERENCES bills(id) ON DELETE CASCADE,
  due_date    DATE NOT NULL,
  sent_to     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bill_id, due_date, sent_to)
);

ALTER TABLE reminder_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reminder_log'
      AND policyname = 'Authenticated users can manage reminder log'
  ) THEN
    CREATE POLICY "Authenticated users can manage reminder log"
      ON reminder_log FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
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
