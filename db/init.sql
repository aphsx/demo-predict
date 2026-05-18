-- 1Moby Analytics V2 — PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Model Versions ────────────────────────────────────────────────
CREATE TABLE model_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_type      TEXT NOT NULL,
  version         TEXT NOT NULL,
  trained_at      TIMESTAMPTZ DEFAULT NOW(),
  metrics_json    JSONB,
  model_file_path TEXT,
  is_active       BOOLEAN DEFAULT FALSE,
  UNIQUE(model_type, version)
);

-- ── Prediction Runs ──────────────────────────────────────────────
CREATE TABLE prediction_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  cutoff_date       DATE NOT NULL,
  total_customers   INTEGER,
  active_customers  INTEGER,
  error_message     TEXT,
  model_version_id  UUID REFERENCES model_versions(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
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

-- ── Predictions V2 (ML output — raw numbers only) ──────────────
CREATE TABLE predictions (
  id                   BIGSERIAL PRIMARY KEY,
  run_id               UUID REFERENCES prediction_runs(id) ON DELETE CASCADE,
  acc_id               INTEGER NOT NULL,

  -- Lifecycle (staging, not ML prediction)
  lifecycle_stage      TEXT,
  sub_stage            TEXT,

  -- Churn (Active Paid only)
  churn_probability    NUMERIC(5,4),

  -- CLV (Active Paid only)
  predicted_clv_6m     NUMERIC(14,2),
  clv_ci95_lo          NUMERIC(14,2),
  clv_ci95_hi          NUMERIC(14,2),
  clv_ci80_lo          NUMERIC(14,2),
  clv_ci80_hi          NUMERIC(14,2),
  p_alive              NUMERIC(5,4),

  -- Credit forecast (Active Paid repeat buyers)
  credit_p10           NUMERIC(8,2),
  credit_p25           NUMERIC(8,2),
  credit_p50           NUMERIC(8,2),
  credit_p75           NUMERIC(8,2),
  credit_p90           NUMERIC(8,2),
  n_purchases          INTEGER,
  forecast_confidence  NUMERIC(4,2),

  -- Win-back (Churned only)
  comeback_probability NUMERIC(5,4),

  -- Conversion (Active Free only)
  conversion_probability NUMERIC(5,4),

  -- Base metrics
  is_active            INTEGER,
  total_revenue        NUMERIC(14,2),
  days_since_last_activity INTEGER,
  ever_paid            BOOLEAN DEFAULT FALSE,

  -- Derived metrics (computed in predictor)
  revenue_at_risk      NUMERIC(14,2),
  avg_transaction_value NUMERIC(14,2),

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX idx_pred_run         ON predictions(run_id);
CREATE INDEX idx_pred_acc         ON predictions(acc_id);
CREATE INDEX idx_pred_lifecycle   ON predictions(lifecycle_stage);

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

-- ── better-auth tables ────────────────────────────────────────────
-- Schema matches better-auth's expected shape (snake_case columns,
-- camelCase mapped by the adapter).

CREATE TABLE IF NOT EXISTS "user" (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
  id           TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account (
  id                       TEXT PRIMARY KEY,
  "userId"                 TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accountId"              TEXT NOT NULL,
  "providerId"             TEXT NOT NULL,
  "accessToken"            TEXT,
  "refreshToken"           TEXT,
  "idToken"                TEXT,
  "accessTokenExpiresAt"   TIMESTAMPTZ,
  "refreshTokenExpiresAt"  TIMESTAMPTZ,
  scope                    TEXT,
  password                 TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("providerId", "accountId")
);

CREATE TABLE IF NOT EXISTS verification (
  id           TEXT PRIMARY KEY,
  identifier   TEXT NOT NULL,
  value        TEXT NOT NULL,
  "expiresAt"  TIMESTAMPTZ NOT NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_user  ON session("userId");
CREATE INDEX IF NOT EXISTS idx_session_token ON session(token);
CREATE INDEX IF NOT EXISTS idx_account_user  ON account("userId");