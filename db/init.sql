-- 1Moby Analytics V2 — PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Prediction Runs ──────────────────────────────────────────────
CREATE TABLE prediction_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  cutoff_date  DATE NOT NULL,
  total_customers  INTEGER,
  active_customers INTEGER,
  error_message    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Raw Data (uploaded per run) ───────────────────────────────────
CREATE TABLE raw_customers (
  id           BIGSERIAL PRIMARY KEY,
  run_id       UUID REFERENCES prediction_runs(id) ON DELETE CASCADE,
  acc_id       INTEGER NOT NULL,
  status_sms   TEXT,
  credit_sms   NUMERIC,
  credit_email NUMERIC,
  expire_sms   DATE,
  expire_email DATE,
  status_email TEXT,
  join_date    DATE,
  last_access  TIMESTAMPTZ,
  last_send    TIMESTAMPTZ
);

CREATE TABLE raw_payments (
  id            BIGSERIAL PRIMARY KEY,
  run_id        UUID REFERENCES prediction_runs(id) ON DELETE CASCADE,
  acc_id        INTEGER NOT NULL,
  payment_date  TIMESTAMPTZ NOT NULL,
  amount        NUMERIC,
  credit_add    NUMERIC,
  credit_type   TEXT
);

CREATE TABLE raw_usage (
  id       BIGSERIAL PRIMARY KEY,
  run_id   UUID REFERENCES prediction_runs(id) ON DELETE CASCADE,
  acc_id   INTEGER NOT NULL,
  year     INTEGER,
  month    INTEGER,
  usage    NUMERIC,
  channel  TEXT,
  source   TEXT
);

-- ── Predictions V2 (ML output — all lifecycle stages) ─────────────
CREATE TABLE predictions (
  id                   BIGSERIAL PRIMARY KEY,
  run_id               UUID REFERENCES prediction_runs(id) ON DELETE CASCADE,
  acc_id               INTEGER NOT NULL,

  -- V2: Lifecycle
  lifecycle_stage      TEXT,
  sub_stage            TEXT,
  recommended_action   TEXT,

  -- Churn (Active Paid only)
  churn_probability    NUMERIC(5,4),
  churn_tier           TEXT,

  -- CLV (Active Paid only)
  predicted_clv_6m     NUMERIC(14,2),
  clv_ci95_lo          NUMERIC(14,2),
  clv_ci95_hi          NUMERIC(14,2),
  clv_ci80_lo          NUMERIC(14,2),
  clv_ci80_hi          NUMERIC(14,2),
  p_alive              NUMERIC(5,4),
  rfm_segment          TEXT,

  -- Credit forecast (Active Paid repeat buyers)
  credit_p10           NUMERIC(8,2),
  credit_p25           NUMERIC(8,2),
  credit_p50           NUMERIC(8,2),
  credit_p75           NUMERIC(8,2),
  credit_p90           NUMERIC(8,2),
  urgency              TEXT,
  alert_date           DATE,
  n_purchases          INTEGER,
  forecast_confidence  NUMERIC(4,2),

  -- V2: Win-back (Churned only)
  comeback_probability NUMERIC(5,4),
  winback_tier         TEXT,
  winback_action       TEXT,

  -- V2: Conversion (Active Free only)
  conversion_probability NUMERIC(5,4),
  conversion_tier      TEXT,
  conversion_action    TEXT,

  -- Combined scores
  priority_score       NUMERIC(6,4),
  revenue_at_risk      NUMERIC(14,2),
  is_active            INTEGER,
  total_revenue        NUMERIC(14,2),
  days_since_last_activity INTEGER,
  ever_paid            BOOLEAN DEFAULT FALSE,

  -- SHAP top 3
  risk_factor_1        TEXT,
  risk_factor_2        TEXT,
  risk_factor_3        TEXT,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX idx_pred_run         ON predictions(run_id);
CREATE INDEX idx_pred_acc         ON predictions(acc_id);
CREATE INDEX idx_pred_lifecycle   ON predictions(lifecycle_stage);
CREATE INDEX idx_pred_churn_tier  ON predictions(churn_tier);
CREATE INDEX idx_pred_urgency     ON predictions(urgency);
CREATE INDEX idx_pred_rfm         ON predictions(rfm_segment);
CREATE INDEX idx_pred_winback     ON predictions(winback_tier);
CREATE INDEX idx_pred_conversion  ON predictions(conversion_tier);
CREATE INDEX idx_raw_cust_run     ON raw_customers(run_id);
CREATE INDEX idx_raw_pay_run      ON raw_payments(run_id);
CREATE INDEX idx_raw_usage_run    ON raw_usage(run_id);

-- ── Auto-update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_runs_updated_at
  BEFORE UPDATE ON prediction_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
