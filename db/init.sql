-- 1Moby Analytics — PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Prediction Runs ──────────────────────────────────────────────
CREATE TABLE prediction_runs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  -- pending | validating | processing | done | failed
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

-- ── Predictions (ML output) ───────────────────────────────────────
CREATE TABLE predictions (
  id                   BIGSERIAL PRIMARY KEY,
  run_id               UUID REFERENCES prediction_runs(id) ON DELETE CASCADE,
  acc_id               INTEGER NOT NULL,

  -- Churn
  churn_probability    NUMERIC(5,4),
  churn_tier           TEXT,

  -- CLV
  predicted_clv_6m     NUMERIC(14,2),
  clv_ci95_lo          NUMERIC(14,2),
  clv_ci95_hi          NUMERIC(14,2),
  clv_ci80_lo          NUMERIC(14,2),
  clv_ci80_hi          NUMERIC(14,2),
  p_alive              NUMERIC(5,4),
  rfm_segment          TEXT,
  r_score              INTEGER,
  f_score              INTEGER,
  m_score              INTEGER,

  -- Credit forecast
  credit_p10           NUMERIC(8,2),
  credit_p25           NUMERIC(8,2),
  credit_p50           NUMERIC(8,2),
  credit_p75           NUMERIC(8,2),
  credit_p90           NUMERIC(8,2),
  urgency              TEXT,
  alert_date           DATE,
  n_purchases          INTEGER,
  forecast_confidence  NUMERIC(4,2),

  -- Combined
  priority_score       NUMERIC(5,4),
  revenue_at_risk      NUMERIC(14,2),
  is_active            INTEGER,

  -- SHAP top 3
  risk_factor_1        TEXT,
  risk_factor_2        TEXT,
  risk_factor_3        TEXT,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX idx_predictions_run_id     ON predictions(run_id);
CREATE INDEX idx_predictions_acc_id     ON predictions(acc_id);
CREATE INDEX idx_predictions_churn_tier ON predictions(churn_tier);
CREATE INDEX idx_predictions_urgency    ON predictions(urgency);
CREATE INDEX idx_predictions_rfm        ON predictions(rfm_segment);
CREATE INDEX idx_raw_customers_run      ON raw_customers(run_id);
CREATE INDEX idx_raw_payments_run       ON raw_payments(run_id);
CREATE INDEX idx_raw_usage_run          ON raw_usage(run_id);

-- ── Auto-update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_runs_updated_at
  BEFORE UPDATE ON prediction_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
