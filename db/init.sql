-- ─────────────────────────────────────────────────────────────
--  Churn CRM — PostgreSQL Schema
--  Auto-run by Docker on first container start
-- ─────────────────────────────────────────────────────────────

-- ── Customers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
    acc_id          VARCHAR(20)   PRIMARY KEY,
    status          VARCHAR(20)   NOT NULL DEFAULT 'trial',
    credit          INTEGER       NOT NULL DEFAULT 0,
    credit_premium  INTEGER       NOT NULL DEFAULT 0,
    credit_email    INTEGER       NOT NULL DEFAULT 0,
    expire          DATE,
    join_date       DATE,
    last_access     TIMESTAMP,
    last_send       TIMESTAMP,
    paid_email      VARCHAR(20),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
    id              BIGSERIAL       PRIMARY KEY,
    acc_id          VARCHAR(20)     NOT NULL REFERENCES customers(acc_id) ON DELETE CASCADE,
    payment_date    TIMESTAMP       NOT NULL,
    amount          NUMERIC(14, 2)  NOT NULL DEFAULT 0,
    sms_volume      INTEGER         NOT NULL DEFAULT 0,
    product_name    VARCHAR(100),
    credit_type     VARCHAR(50),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_acc_id ON payments(acc_id);
CREATE INDEX IF NOT EXISTS idx_payments_date   ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_amount ON payments(amount DESC);

-- ── Predictions (updated by ML pipeline / seed_db.py) ────────
CREATE TABLE IF NOT EXISTS predictions (
    acc_id                  VARCHAR(20)  PRIMARY KEY REFERENCES customers(acc_id) ON DELETE CASCADE,
    churn_probability       FLOAT        NOT NULL DEFAULT 0,
    churn_predicted         BOOLEAN      NOT NULL DEFAULT FALSE,
    risk_tier               VARCHAR(10)  NOT NULL DEFAULT 'Low',
    rfm_segment             VARCHAR(30),
    risk_factor             TEXT,
    recommended_action      TEXT,
    days_since_last_access  FLOAT,
    days_until_expire       FLOAT,
    account_age_days        FLOAT,
    total_payments          FLOAT        DEFAULT 0,
    total_amount_paid       FLOAT        DEFAULT 0,
    ltv                     FLOAT        DEFAULT 0,
    avg_amount_per_tx       FLOAT        DEFAULT 0,
    last_payment_recency    FLOAT,
    avg_payment_gap_days    FLOAT,
    total_sms_volume        FLOAT        DEFAULT 0,
    avg_sms_volume          FLOAT        DEFAULT 0,
    unique_products         FLOAT        DEFAULT 0,
    downgraded              INTEGER      DEFAULT 0,
    churned                 INTEGER      DEFAULT 0,
    computed_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pred_risk  ON predictions(risk_tier);
CREATE INDEX IF NOT EXISTS idx_pred_churn ON predictions(churn_probability DESC);
CREATE INDEX IF NOT EXISTS idx_pred_ltv   ON predictions(ltv DESC);
CREATE INDEX IF NOT EXISTS idx_pred_rfm   ON predictions(rfm_segment);

-- ── Prediction Runs (named sessions for each predict batch) ──
CREATE TABLE IF NOT EXISTS prediction_runs (
    id               SERIAL        PRIMARY KEY,
    name             VARCHAR(100)  NOT NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
    users_uploaded    BOOLEAN       NOT NULL DEFAULT FALSE,
    payments_uploaded BOOLEAN       NOT NULL DEFAULT FALSE,
    customers_count   INTEGER       NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runs_status     ON prediction_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON prediction_runs(created_at DESC);
