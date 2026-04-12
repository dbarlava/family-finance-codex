-- Add quarterly recurrence and guarantee payable bills never land on weekends.

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

ALTER TABLE bills
  DROP CONSTRAINT IF EXISTS bills_recurrence_period_check;

ALTER TABLE bills
  ADD CONSTRAINT bills_recurrence_period_check
  CHECK (recurrence_period IN ('weekly', 'monthly', 'quarterly', 'yearly'));

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

UPDATE bills
SET due_date = adjust_business_due_date(due_date)
WHERE NOT is_paid
  AND due_date <> adjust_business_due_date(due_date);

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
