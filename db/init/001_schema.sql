--
-- PostgreSQL database dump
--

\restrict EnaVIkDjUixGpzxwBNrQvQy4kVzIWtBHja9iZnilPTCr77czzFglKBNLe1gaQJ0

-- Dumped from database version 15.18
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    "userId" text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id text NOT NULL,
    run_id uuid,
    title text DEFAULT 'New chat'::text NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_knowledge_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_chunks (
    id bigint NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(768),
    token_count integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_knowledge_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_knowledge_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_knowledge_chunks_id_seq OWNED BY public.ai_knowledge_chunks.id;


--
-- Name: ai_knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_knowledge_documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    source text NOT NULL,
    content_hash text,
    uploaded_by text,
    chunk_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    id bigint NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    evidence_json jsonb,
    model text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: ai_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_messages_id_seq OWNED BY public.ai_messages.id;


--
-- Name: ml_data_validation_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_data_validation_reports (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    source_id uuid,
    source_kind text NOT NULL,
    training_run_id uuid,
    prediction_run_id uuid,
    validation_type text NOT NULL,
    status text NOT NULL,
    row_count integer,
    stats_json jsonb,
    anomalies_json jsonb,
    drift_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_feature_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_feature_sets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    version text NOT NULL,
    model_type text NOT NULL,
    feature_names_json jsonb NOT NULL,
    feature_schema_json jsonb NOT NULL,
    transform_config_json jsonb,
    feature_code_hash text,
    status text DEFAULT 'candidate'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_model_activation_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_model_activation_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    model_type text NOT NULL,
    previous_model_version_id uuid,
    new_model_version_id uuid,
    action text NOT NULL,
    reason text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_model_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_model_aliases (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    model_type text NOT NULL,
    alias text NOT NULL,
    model_version_id uuid NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_model_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_model_evaluations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    model_version_id uuid NOT NULL,
    training_run_id uuid NOT NULL,
    model_type text NOT NULL,
    evaluation_type text NOT NULL,
    dataset_split text NOT NULL,
    cutoff_date date,
    horizon_days integer,
    baseline_name text,
    feature_set_id uuid,
    metrics_json jsonb,
    confusion_matrix_json jsonb,
    calibration_json jsonb,
    lift_table_json jsonb,
    feature_importance_json jsonb,
    error_analysis_json jsonb,
    business_metrics_json jsonb,
    artifact_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_model_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_model_versions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    training_run_id uuid NOT NULL,
    feature_set_id uuid,
    model_type text NOT NULL,
    version text NOT NULL,
    status text DEFAULT 'candidate'::text NOT NULL,
    artifact_path text,
    artifact_checksum text,
    metrics_json jsonb,
    validation_metrics_json jsonb,
    test_metrics_json jsonb,
    feature_names_json jsonb,
    label_definition_json jsonb,
    training_data_snapshot_json jsonb,
    model_card_json jsonb,
    model_card_path text,
    is_active boolean DEFAULT false NOT NULL,
    activated_at timestamp with time zone,
    deactivated_at timestamp with time zone,
    trained_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_prediction_outputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_prediction_outputs (
    id bigint NOT NULL,
    prediction_run_id uuid NOT NULL,
    acc_id integer NOT NULL,
    lifecycle_stage text,
    sub_stage text,
    churn_probability numeric(5,4),
    churn_risk_level text,
    churn_factors_json jsonb,
    predicted_clv_6m numeric(14,2),
    p_alive numeric(5,4),
    customer_value_tier text,
    revenue_at_risk numeric(14,2),
    predicted_credit_usage_30d numeric(14,2),
    predicted_credit_usage_90d numeric(14,2),
    credit_forecast_interval_json jsonb,
    estimated_days_until_topup integer,
    credit_urgency_level text,
    usage_trend text,
    days_since_last_activity integer,
    n_purchases integer,
    total_revenue numeric(14,2),
    avg_transaction_value numeric(14,2),
    ever_paid boolean DEFAULT false NOT NULL,
    priority_score numeric(5,2),
    priority_reason text,
    ai_explanation text,
    ai_reasoning_json jsonb,
    ai_recommended_message text,
    ai_generated_at timestamp with time zone,
    ai_model text,
    ai_status text DEFAULT 'not_requested'::text NOT NULL,
    output_status text DEFAULT 'predicted'::text NOT NULL,
    output_notes text,
    model_eligibility_json jsonb,
    model_versions_json jsonb,
    profile_snapshot_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_prediction_outputs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ml_prediction_outputs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ml_prediction_outputs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ml_prediction_outputs_id_seq OWNED BY public.ml_prediction_outputs.id;


--
-- Name: ml_prediction_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_prediction_runs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text DEFAULT 'Prediction run'::text NOT NULL,
    predict_source_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    cutoff_date date NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    total_customers integer,
    progress_json jsonb,
    model_versions_json jsonb,
    error_message text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ml_training_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ml_training_runs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    source_id uuid NOT NULL,
    run_type text DEFAULT 'initial_train'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    cutoff_date date NOT NULL,
    horizon_days integer NOT NULL,
    training_config_json jsonb,
    progress_json jsonb,
    results_json jsonb,
    parent_training_run_id uuid,
    notes text,
    error_message text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_clean_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_clean_customers (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    raw_row_id bigint NOT NULL,
    excel_row integer NOT NULL,
    acc_id integer NOT NULL,
    status_sms text,
    credit_sms numeric,
    credit_email numeric,
    expire_sms date,
    expire_email date,
    status_email text,
    join_date date,
    last_access timestamp with time zone,
    last_send timestamp with time zone
);


--
-- Name: predict_clean_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_clean_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_clean_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_clean_customers_id_seq OWNED BY public.predict_clean_customers.id;


--
-- Name: predict_clean_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_clean_payments (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    raw_row_id bigint NOT NULL,
    excel_row integer NOT NULL,
    acc_id integer NOT NULL,
    payment_uid bigint,
    payment_date timestamp with time zone NOT NULL,
    amount numeric,
    credit_add numeric,
    credit_type text
);


--
-- Name: predict_clean_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_clean_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_clean_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_clean_payments_id_seq OWNED BY public.predict_clean_payments.id;


--
-- Name: predict_clean_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_clean_usage (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    raw_row_id bigint NOT NULL,
    excel_row integer NOT NULL,
    acc_id integer NOT NULL,
    year integer,
    month integer,
    usage numeric,
    channel text NOT NULL,
    usage_source text NOT NULL
);


--
-- Name: predict_clean_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_clean_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_clean_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_clean_usage_id_seq OWNED BY public.predict_clean_usage.id;


--
-- Name: predict_data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_data_sources (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    client_label text,
    original_filename text NOT NULL,
    file_checksum_sha256 text NOT NULL,
    file_size_bytes bigint,
    import_status text DEFAULT 'pending'::text NOT NULL,
    imported_at timestamp with time zone,
    sheet_manifest jsonb,
    notes text,
    error_message text,
    imported_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clean_manifest jsonb,
    cleaned_at timestamp with time zone,
    CONSTRAINT predict_data_sources_import_status_check CHECK ((import_status = ANY (ARRAY['pending'::text, 'importing'::text, 'cleaning'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: predict_raw_sheet_backend_payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_backend_payment (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_backend_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_backend_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_backend_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_backend_payment_id_seq OWNED BY public.predict_raw_sheet_backend_payment.id;


--
-- Name: predict_raw_sheet_email_usage_api; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_email_usage_api (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_email_usage_api_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_email_usage_api_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_email_usage_api_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_email_usage_api_id_seq OWNED BY public.predict_raw_sheet_email_usage_api.id;


--
-- Name: predict_raw_sheet_email_usage_bc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_email_usage_bc (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_email_usage_bc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_email_usage_bc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_email_usage_bc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_email_usage_bc_id_seq OWNED BY public.predict_raw_sheet_email_usage_bc.id;


--
-- Name: predict_raw_sheet_email_usage_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_email_usage_otp (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_email_usage_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_email_usage_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_email_usage_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_email_usage_otp_id_seq OWNED BY public.predict_raw_sheet_email_usage_otp.id;


--
-- Name: predict_raw_sheet_sms_usage_api; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_sms_usage_api (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_sms_usage_api_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_sms_usage_api_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_sms_usage_api_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_sms_usage_api_id_seq OWNED BY public.predict_raw_sheet_sms_usage_api.id;


--
-- Name: predict_raw_sheet_sms_usage_bc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_sms_usage_bc (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_sms_usage_bc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_sms_usage_bc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_sms_usage_bc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_sms_usage_bc_id_seq OWNED BY public.predict_raw_sheet_sms_usage_bc.id;


--
-- Name: predict_raw_sheet_sms_usage_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_sms_usage_otp (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_sms_usage_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_sms_usage_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_sms_usage_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_sms_usage_otp_id_seq OWNED BY public.predict_raw_sheet_sms_usage_otp.id;


--
-- Name: predict_raw_sheet_users_user_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predict_raw_sheet_users_user_profile (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predict_raw_sheet_users_user_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.predict_raw_sheet_users_user_profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: predict_raw_sheet_users_user_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.predict_raw_sheet_users_user_profile_id_seq OWNED BY public.predict_raw_sheet_users_user_profile.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "userId" text NOT NULL,
    token text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_clean_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_clean_customers (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    acc_id integer NOT NULL,
    status_sms text,
    credit_sms numeric,
    credit_email numeric,
    expire_sms date,
    expire_email date,
    status_email text,
    join_date date,
    last_access timestamp with time zone,
    last_send timestamp with time zone,
    excel_row integer NOT NULL,
    raw_row_id bigint NOT NULL
);


--
-- Name: train_clean_customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_clean_customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_clean_customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_clean_customers_id_seq OWNED BY public.train_clean_customers.id;


--
-- Name: train_clean_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_clean_payments (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    acc_id integer NOT NULL,
    payment_uid bigint,
    payment_date timestamp with time zone NOT NULL,
    amount numeric,
    credit_add numeric,
    credit_type text,
    excel_row integer NOT NULL,
    raw_row_id bigint NOT NULL
);


--
-- Name: train_clean_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_clean_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_clean_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_clean_payments_id_seq OWNED BY public.train_clean_payments.id;


--
-- Name: train_clean_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_clean_usage (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    acc_id integer NOT NULL,
    year integer,
    month integer,
    usage numeric,
    channel text NOT NULL,
    usage_source text NOT NULL,
    excel_row integer NOT NULL,
    raw_row_id bigint NOT NULL
);


--
-- Name: train_clean_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_clean_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_clean_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_clean_usage_id_seq OWNED BY public.train_clean_usage.id;


--
-- Name: train_data_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_data_sources (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    client_label text,
    original_filename text NOT NULL,
    file_checksum_sha256 text NOT NULL,
    file_size_bytes bigint,
    import_status text DEFAULT 'pending'::text NOT NULL,
    imported_at timestamp with time zone,
    sheet_manifest jsonb,
    notes text,
    error_message text,
    imported_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    clean_manifest jsonb,
    cleaned_at timestamp with time zone,
    CONSTRAINT train_data_sources_import_status_check CHECK ((import_status = ANY (ARRAY['pending'::text, 'importing'::text, 'cleaning'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: train_raw_sheet_backend_payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_backend_payment (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_backend_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_backend_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_backend_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_backend_payment_id_seq OWNED BY public.train_raw_sheet_backend_payment.id;


--
-- Name: train_raw_sheet_email_usage_api; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_email_usage_api (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_email_usage_api_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_email_usage_api_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_email_usage_api_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_email_usage_api_id_seq OWNED BY public.train_raw_sheet_email_usage_api.id;


--
-- Name: train_raw_sheet_email_usage_bc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_email_usage_bc (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_email_usage_bc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_email_usage_bc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_email_usage_bc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_email_usage_bc_id_seq OWNED BY public.train_raw_sheet_email_usage_bc.id;


--
-- Name: train_raw_sheet_email_usage_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_email_usage_otp (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_email_usage_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_email_usage_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_email_usage_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_email_usage_otp_id_seq OWNED BY public.train_raw_sheet_email_usage_otp.id;


--
-- Name: train_raw_sheet_sms_usage_api; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_sms_usage_api (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_sms_usage_api_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_sms_usage_api_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_sms_usage_api_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_sms_usage_api_id_seq OWNED BY public.train_raw_sheet_sms_usage_api.id;


--
-- Name: train_raw_sheet_sms_usage_bc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_sms_usage_bc (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_sms_usage_bc_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_sms_usage_bc_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_sms_usage_bc_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_sms_usage_bc_id_seq OWNED BY public.train_raw_sheet_sms_usage_bc.id;


--
-- Name: train_raw_sheet_sms_usage_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_sms_usage_otp (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_sms_usage_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_sms_usage_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_sms_usage_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_sms_usage_otp_id_seq OWNED BY public.train_raw_sheet_sms_usage_otp.id;


--
-- Name: train_raw_sheet_users_user_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.train_raw_sheet_users_user_profile (
    id bigint NOT NULL,
    source_id uuid NOT NULL,
    excel_row integer NOT NULL,
    row_payload jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: train_raw_sheet_users_user_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.train_raw_sheet_users_user_profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: train_raw_sheet_users_user_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.train_raw_sheet_users_user_profile_id_seq OWNED BY public.train_raw_sheet_users_user_profile.id;


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean DEFAULT false NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_knowledge_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_chunks ALTER COLUMN id SET DEFAULT nextval('public.ai_knowledge_chunks_id_seq'::regclass);


--
-- Name: ai_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages ALTER COLUMN id SET DEFAULT nextval('public.ai_messages_id_seq'::regclass);


--
-- Name: ml_prediction_outputs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_prediction_outputs ALTER COLUMN id SET DEFAULT nextval('public.ml_prediction_outputs_id_seq'::regclass);


--
-- Name: predict_clean_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_customers ALTER COLUMN id SET DEFAULT nextval('public.predict_clean_customers_id_seq'::regclass);


--
-- Name: predict_clean_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_payments ALTER COLUMN id SET DEFAULT nextval('public.predict_clean_payments_id_seq'::regclass);


--
-- Name: predict_clean_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_usage ALTER COLUMN id SET DEFAULT nextval('public.predict_clean_usage_id_seq'::regclass);


--
-- Name: predict_raw_sheet_backend_payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_backend_payment ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_backend_payment_id_seq'::regclass);


--
-- Name: predict_raw_sheet_email_usage_api id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_api ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_email_usage_api_id_seq'::regclass);


--
-- Name: predict_raw_sheet_email_usage_bc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_bc ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_email_usage_bc_id_seq'::regclass);


--
-- Name: predict_raw_sheet_email_usage_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_otp ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_email_usage_otp_id_seq'::regclass);


--
-- Name: predict_raw_sheet_sms_usage_api id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_api ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_sms_usage_api_id_seq'::regclass);


--
-- Name: predict_raw_sheet_sms_usage_bc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_bc ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_sms_usage_bc_id_seq'::regclass);


--
-- Name: predict_raw_sheet_sms_usage_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_otp ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_sms_usage_otp_id_seq'::regclass);


--
-- Name: predict_raw_sheet_users_user_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_users_user_profile ALTER COLUMN id SET DEFAULT nextval('public.predict_raw_sheet_users_user_profile_id_seq'::regclass);


--
-- Name: train_clean_customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_customers ALTER COLUMN id SET DEFAULT nextval('public.train_clean_customers_id_seq'::regclass);


--
-- Name: train_clean_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_payments ALTER COLUMN id SET DEFAULT nextval('public.train_clean_payments_id_seq'::regclass);


--
-- Name: train_clean_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_usage ALTER COLUMN id SET DEFAULT nextval('public.train_clean_usage_id_seq'::regclass);


--
-- Name: train_raw_sheet_backend_payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_backend_payment ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_backend_payment_id_seq'::regclass);


--
-- Name: train_raw_sheet_email_usage_api id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_api ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_email_usage_api_id_seq'::regclass);


--
-- Name: train_raw_sheet_email_usage_bc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_bc ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_email_usage_bc_id_seq'::regclass);


--
-- Name: train_raw_sheet_email_usage_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_otp ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_email_usage_otp_id_seq'::regclass);


--
-- Name: train_raw_sheet_sms_usage_api id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_api ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_sms_usage_api_id_seq'::regclass);


--
-- Name: train_raw_sheet_sms_usage_bc id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_bc ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_sms_usage_bc_id_seq'::regclass);


--
-- Name: train_raw_sheet_sms_usage_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_otp ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_sms_usage_otp_id_seq'::regclass);


--
-- Name: train_raw_sheet_users_user_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_users_user_profile ALTER COLUMN id SET DEFAULT nextval('public.train_raw_sheet_users_user_profile_id_seq'::regclass);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: account account_providerId_accountId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_providerId_accountId_key" UNIQUE ("providerId", "accountId");


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_pkey PRIMARY KEY (id);


--
-- Name: ai_knowledge_documents ai_knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: ml_data_validation_reports ml_data_validation_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_data_validation_reports
    ADD CONSTRAINT ml_data_validation_reports_pkey PRIMARY KEY (id);


--
-- Name: ml_feature_sets ml_feature_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_feature_sets
    ADD CONSTRAINT ml_feature_sets_pkey PRIMARY KEY (id);


--
-- Name: ml_model_activation_history ml_model_activation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_activation_history
    ADD CONSTRAINT ml_model_activation_history_pkey PRIMARY KEY (id);


--
-- Name: ml_model_aliases ml_model_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_aliases
    ADD CONSTRAINT ml_model_aliases_pkey PRIMARY KEY (id);


--
-- Name: ml_model_evaluations ml_model_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_evaluations
    ADD CONSTRAINT ml_model_evaluations_pkey PRIMARY KEY (id);


--
-- Name: ml_model_versions ml_model_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_versions
    ADD CONSTRAINT ml_model_versions_pkey PRIMARY KEY (id);


--
-- Name: ml_prediction_outputs ml_prediction_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_prediction_outputs
    ADD CONSTRAINT ml_prediction_outputs_pkey PRIMARY KEY (id);


--
-- Name: ml_prediction_runs ml_prediction_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_prediction_runs
    ADD CONSTRAINT ml_prediction_runs_pkey PRIMARY KEY (id);


--
-- Name: ml_training_runs ml_training_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_training_runs
    ADD CONSTRAINT ml_training_runs_pkey PRIMARY KEY (id);


--
-- Name: predict_clean_customers predict_clean_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_customers
    ADD CONSTRAINT predict_clean_customers_pkey PRIMARY KEY (id);


--
-- Name: predict_clean_payments predict_clean_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_payments
    ADD CONSTRAINT predict_clean_payments_pkey PRIMARY KEY (id);


--
-- Name: predict_clean_usage predict_clean_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_usage
    ADD CONSTRAINT predict_clean_usage_pkey PRIMARY KEY (id);


--
-- Name: predict_data_sources predict_data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_data_sources
    ADD CONSTRAINT predict_data_sources_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_backend_payment predict_raw_sheet_backend_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_backend_payment
    ADD CONSTRAINT predict_raw_sheet_backend_payment_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_email_usage_api predict_raw_sheet_email_usage_api_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_api
    ADD CONSTRAINT predict_raw_sheet_email_usage_api_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_email_usage_bc predict_raw_sheet_email_usage_bc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_bc
    ADD CONSTRAINT predict_raw_sheet_email_usage_bc_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_email_usage_otp predict_raw_sheet_email_usage_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_otp
    ADD CONSTRAINT predict_raw_sheet_email_usage_otp_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_sms_usage_api predict_raw_sheet_sms_usage_api_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_api
    ADD CONSTRAINT predict_raw_sheet_sms_usage_api_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_sms_usage_bc predict_raw_sheet_sms_usage_bc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_bc
    ADD CONSTRAINT predict_raw_sheet_sms_usage_bc_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_sms_usage_otp predict_raw_sheet_sms_usage_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_otp
    ADD CONSTRAINT predict_raw_sheet_sms_usage_otp_pkey PRIMARY KEY (id);


--
-- Name: predict_raw_sheet_users_user_profile predict_raw_sheet_users_user_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_users_user_profile
    ADD CONSTRAINT predict_raw_sheet_users_user_profile_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: train_clean_customers train_clean_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_customers
    ADD CONSTRAINT train_clean_customers_pkey PRIMARY KEY (id);


--
-- Name: train_clean_payments train_clean_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_payments
    ADD CONSTRAINT train_clean_payments_pkey PRIMARY KEY (id);


--
-- Name: train_clean_usage train_clean_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_usage
    ADD CONSTRAINT train_clean_usage_pkey PRIMARY KEY (id);


--
-- Name: train_data_sources train_data_sources_file_checksum_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_data_sources
    ADD CONSTRAINT train_data_sources_file_checksum_sha256_key UNIQUE (file_checksum_sha256);


--
-- Name: train_data_sources train_data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_data_sources
    ADD CONSTRAINT train_data_sources_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_backend_payment train_raw_sheet_backend_payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_backend_payment
    ADD CONSTRAINT train_raw_sheet_backend_payment_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_email_usage_api train_raw_sheet_email_usage_api_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_api
    ADD CONSTRAINT train_raw_sheet_email_usage_api_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_email_usage_bc train_raw_sheet_email_usage_bc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_bc
    ADD CONSTRAINT train_raw_sheet_email_usage_bc_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_email_usage_otp train_raw_sheet_email_usage_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_otp
    ADD CONSTRAINT train_raw_sheet_email_usage_otp_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_sms_usage_api train_raw_sheet_sms_usage_api_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_api
    ADD CONSTRAINT train_raw_sheet_sms_usage_api_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_sms_usage_bc train_raw_sheet_sms_usage_bc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_bc
    ADD CONSTRAINT train_raw_sheet_sms_usage_bc_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_sms_usage_otp train_raw_sheet_sms_usage_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_otp
    ADD CONSTRAINT train_raw_sheet_sms_usage_otp_pkey PRIMARY KEY (id);


--
-- Name: train_raw_sheet_users_user_profile train_raw_sheet_users_user_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_users_user_profile
    ADD CONSTRAINT train_raw_sheet_users_user_profile_pkey PRIMARY KEY (id);


--
-- Name: ml_feature_sets uq_ml_feature_sets_name_version_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_feature_sets
    ADD CONSTRAINT uq_ml_feature_sets_name_version_type UNIQUE (name, version, model_type);


--
-- Name: ml_model_aliases uq_ml_model_aliases_type_alias; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_aliases
    ADD CONSTRAINT uq_ml_model_aliases_type_alias UNIQUE (model_type, alias);


--
-- Name: ml_model_versions uq_ml_model_versions_type_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_versions
    ADD CONSTRAINT uq_ml_model_versions_type_version UNIQUE (model_type, version);


--
-- Name: ml_prediction_outputs uq_ml_prediction_outputs_run_acc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_prediction_outputs
    ADD CONSTRAINT uq_ml_prediction_outputs_run_acc UNIQUE (prediction_run_id, acc_id);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: idx_account_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_user ON public.account USING btree ("userId");


--
-- Name: ai_conversations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_conversations_user_idx ON public.ai_conversations USING btree (user_id, updated_at DESC);


--
-- Name: ai_knowledge_chunks_doc_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_chunks_doc_idx ON public.ai_knowledge_chunks USING btree (document_id, chunk_index);


--
-- Name: ai_knowledge_chunks_embed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_knowledge_chunks_embed_idx ON public.ai_knowledge_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: ai_knowledge_documents_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_knowledge_documents_source_idx ON public.ai_knowledge_documents USING btree (source);


--
-- Name: ai_messages_conv_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_messages_conv_idx ON public.ai_messages USING btree (conversation_id, id);


--
-- Name: idx_ml_activation_history_new_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_activation_history_new_version ON public.ml_model_activation_history USING btree (new_model_version_id);


--
-- Name: idx_ml_activation_history_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_activation_history_type ON public.ml_model_activation_history USING btree (model_type);


--
-- Name: idx_ml_evaluations_model_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_evaluations_model_version ON public.ml_model_evaluations USING btree (model_version_id);


--
-- Name: idx_ml_evaluations_training_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_evaluations_training_run ON public.ml_model_evaluations USING btree (training_run_id);


--
-- Name: idx_ml_evaluations_type_split; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_evaluations_type_split ON public.ml_model_evaluations USING btree (model_type, evaluation_type, dataset_split);


--
-- Name: idx_ml_feature_sets_model_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_feature_sets_model_type ON public.ml_feature_sets USING btree (model_type);


--
-- Name: idx_ml_feature_sets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_feature_sets_status ON public.ml_feature_sets USING btree (status);


--
-- Name: idx_ml_model_aliases_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_model_aliases_version ON public.ml_model_aliases USING btree (model_version_id);


--
-- Name: idx_ml_model_versions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_model_versions_active ON public.ml_model_versions USING btree (model_type, is_active);


--
-- Name: idx_ml_model_versions_feature_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_model_versions_feature_set ON public.ml_model_versions USING btree (feature_set_id);


--
-- Name: idx_ml_model_versions_training_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_model_versions_training_run ON public.ml_model_versions USING btree (training_run_id);


--
-- Name: idx_ml_model_versions_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_model_versions_type_status ON public.ml_model_versions USING btree (model_type, status);


--
-- Name: idx_ml_prediction_outputs_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_outputs_acc ON public.ml_prediction_outputs USING btree (acc_id);


--
-- Name: idx_ml_prediction_outputs_churn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_outputs_churn ON public.ml_prediction_outputs USING btree (churn_risk_level);


--
-- Name: idx_ml_prediction_outputs_lifecycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_outputs_lifecycle ON public.ml_prediction_outputs USING btree (lifecycle_stage);


--
-- Name: idx_ml_prediction_outputs_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_outputs_priority ON public.ml_prediction_outputs USING btree (priority_score);


--
-- Name: idx_ml_prediction_outputs_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_outputs_run ON public.ml_prediction_outputs USING btree (prediction_run_id);


--
-- Name: idx_ml_prediction_runs_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_runs_created_by ON public.ml_prediction_runs USING btree (created_by);


--
-- Name: idx_ml_prediction_runs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_runs_source ON public.ml_prediction_runs USING btree (predict_source_id);


--
-- Name: idx_ml_prediction_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_prediction_runs_status ON public.ml_prediction_runs USING btree (status);


--
-- Name: idx_ml_training_runs_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_training_runs_created_by ON public.ml_training_runs USING btree (created_by);


--
-- Name: idx_ml_training_runs_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_training_runs_source ON public.ml_training_runs USING btree (source_id);


--
-- Name: idx_ml_training_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_training_runs_status ON public.ml_training_runs USING btree (status);


--
-- Name: idx_ml_validation_reports_prediction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_validation_reports_prediction ON public.ml_data_validation_reports USING btree (prediction_run_id);


--
-- Name: idx_ml_validation_reports_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_validation_reports_source ON public.ml_data_validation_reports USING btree (source_kind, source_id);


--
-- Name: idx_ml_validation_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_validation_reports_status ON public.ml_data_validation_reports USING btree (status);


--
-- Name: idx_ml_validation_reports_training; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ml_validation_reports_training ON public.ml_data_validation_reports USING btree (training_run_id);


--
-- Name: idx_predict_clean_customers_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_customers_acc ON public.predict_clean_customers USING btree (source_id, acc_id);


--
-- Name: idx_predict_clean_customers_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_customers_lineage ON public.predict_clean_customers USING btree (source_id, excel_row);


--
-- Name: idx_predict_clean_customers_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_customers_source ON public.predict_clean_customers USING btree (source_id);


--
-- Name: idx_predict_clean_payments_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_payments_acc ON public.predict_clean_payments USING btree (source_id, acc_id);


--
-- Name: idx_predict_clean_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_payments_date ON public.predict_clean_payments USING btree (source_id, payment_date);


--
-- Name: idx_predict_clean_payments_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_payments_lineage ON public.predict_clean_payments USING btree (source_id, excel_row);


--
-- Name: idx_predict_clean_payments_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_payments_source ON public.predict_clean_payments USING btree (source_id);


--
-- Name: idx_predict_clean_usage_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_usage_acc ON public.predict_clean_usage USING btree (source_id, acc_id);


--
-- Name: idx_predict_clean_usage_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_usage_lineage ON public.predict_clean_usage USING btree (source_id, excel_row);


--
-- Name: idx_predict_clean_usage_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_usage_period ON public.predict_clean_usage USING btree (source_id, year, month);


--
-- Name: idx_predict_clean_usage_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_clean_usage_source ON public.predict_clean_usage USING btree (source_id);


--
-- Name: idx_predict_data_sources_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_data_sources_client ON public.predict_data_sources USING btree (client_label);


--
-- Name: idx_predict_data_sources_imported_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_data_sources_imported_by ON public.predict_data_sources USING btree (imported_by);


--
-- Name: idx_predict_data_sources_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_data_sources_status ON public.predict_data_sources USING btree (import_status);


--
-- Name: idx_predict_raw_email_api_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_email_api_source ON public.predict_raw_sheet_email_usage_api USING btree (source_id);


--
-- Name: idx_predict_raw_email_bc_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_email_bc_source ON public.predict_raw_sheet_email_usage_bc USING btree (source_id);


--
-- Name: idx_predict_raw_email_otp_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_email_otp_source ON public.predict_raw_sheet_email_usage_otp USING btree (source_id);


--
-- Name: idx_predict_raw_pay_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_pay_source ON public.predict_raw_sheet_backend_payment USING btree (source_id);


--
-- Name: idx_predict_raw_pay_source_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_pay_source_row ON public.predict_raw_sheet_backend_payment USING btree (source_id, excel_row);


--
-- Name: idx_predict_raw_sms_api_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_sms_api_source ON public.predict_raw_sheet_sms_usage_api USING btree (source_id);


--
-- Name: idx_predict_raw_sms_bc_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_sms_bc_source ON public.predict_raw_sheet_sms_usage_bc USING btree (source_id);


--
-- Name: idx_predict_raw_sms_otp_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_sms_otp_source ON public.predict_raw_sheet_sms_usage_otp USING btree (source_id);


--
-- Name: idx_predict_raw_users_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_users_source ON public.predict_raw_sheet_users_user_profile USING btree (source_id);


--
-- Name: idx_predict_raw_users_source_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_predict_raw_users_source_row ON public.predict_raw_sheet_users_user_profile USING btree (source_id, excel_row);


--
-- Name: idx_session_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_token ON public.session USING btree (token);


--
-- Name: idx_session_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_user ON public.session USING btree ("userId");


--
-- Name: idx_train_clean_customers_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_customers_acc ON public.train_clean_customers USING btree (source_id, acc_id);


--
-- Name: idx_train_clean_customers_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_customers_lineage ON public.train_clean_customers USING btree (source_id, excel_row);


--
-- Name: idx_train_clean_customers_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_customers_source ON public.train_clean_customers USING btree (source_id);


--
-- Name: idx_train_clean_payments_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_payments_acc ON public.train_clean_payments USING btree (source_id, acc_id);


--
-- Name: idx_train_clean_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_payments_date ON public.train_clean_payments USING btree (source_id, payment_date);


--
-- Name: idx_train_clean_payments_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_payments_lineage ON public.train_clean_payments USING btree (source_id, excel_row);


--
-- Name: idx_train_clean_payments_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_payments_source ON public.train_clean_payments USING btree (source_id);


--
-- Name: idx_train_clean_usage_acc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_usage_acc ON public.train_clean_usage USING btree (source_id, acc_id);


--
-- Name: idx_train_clean_usage_lineage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_usage_lineage ON public.train_clean_usage USING btree (source_id, excel_row);


--
-- Name: idx_train_clean_usage_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_usage_period ON public.train_clean_usage USING btree (source_id, year, month);


--
-- Name: idx_train_clean_usage_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_clean_usage_source ON public.train_clean_usage USING btree (source_id);


--
-- Name: idx_train_data_sources_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_data_sources_client ON public.train_data_sources USING btree (client_label);


--
-- Name: idx_train_data_sources_imported_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_data_sources_imported_by ON public.train_data_sources USING btree (imported_by);


--
-- Name: idx_train_data_sources_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_data_sources_status ON public.train_data_sources USING btree (import_status);


--
-- Name: idx_train_raw_email_api_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_email_api_source ON public.train_raw_sheet_email_usage_api USING btree (source_id);


--
-- Name: idx_train_raw_email_bc_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_email_bc_source ON public.train_raw_sheet_email_usage_bc USING btree (source_id);


--
-- Name: idx_train_raw_email_otp_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_email_otp_source ON public.train_raw_sheet_email_usage_otp USING btree (source_id);


--
-- Name: idx_train_raw_pay_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_pay_source ON public.train_raw_sheet_backend_payment USING btree (source_id);


--
-- Name: idx_train_raw_pay_source_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_pay_source_row ON public.train_raw_sheet_backend_payment USING btree (source_id, excel_row);


--
-- Name: idx_train_raw_sms_api_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_sms_api_source ON public.train_raw_sheet_sms_usage_api USING btree (source_id);


--
-- Name: idx_train_raw_sms_bc_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_sms_bc_source ON public.train_raw_sheet_sms_usage_bc USING btree (source_id);


--
-- Name: idx_train_raw_sms_otp_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_sms_otp_source ON public.train_raw_sheet_sms_usage_otp USING btree (source_id);


--
-- Name: idx_train_raw_users_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_users_source ON public.train_raw_sheet_users_user_profile USING btree (source_id);


--
-- Name: idx_train_raw_users_source_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_train_raw_users_source_row ON public.train_raw_sheet_users_user_profile USING btree (source_id, excel_row);


--
-- Name: uq_ml_model_versions_one_active_per_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ml_model_versions_one_active_per_type ON public.ml_model_versions USING btree (model_type) WHERE (is_active = true);


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: ai_conversations ai_conversations_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ml_prediction_runs(id) ON DELETE SET NULL;


--
-- Name: ai_conversations ai_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_chunks ai_knowledge_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_chunks
    ADD CONSTRAINT ai_knowledge_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE;


--
-- Name: ai_knowledge_documents ai_knowledge_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_knowledge_documents
    ADD CONSTRAINT ai_knowledge_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ml_data_validation_reports ml_data_validation_reports_prediction_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_data_validation_reports
    ADD CONSTRAINT ml_data_validation_reports_prediction_run_id_fkey FOREIGN KEY (prediction_run_id) REFERENCES public.ml_prediction_runs(id) ON DELETE CASCADE;


--
-- Name: ml_data_validation_reports ml_data_validation_reports_training_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_data_validation_reports
    ADD CONSTRAINT ml_data_validation_reports_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES public.ml_training_runs(id) ON DELETE CASCADE;


--
-- Name: ml_model_activation_history ml_model_activation_history_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_activation_history
    ADD CONSTRAINT ml_model_activation_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: ml_model_activation_history ml_model_activation_history_new_model_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_activation_history
    ADD CONSTRAINT ml_model_activation_history_new_model_version_id_fkey FOREIGN KEY (new_model_version_id) REFERENCES public.ml_model_versions(id) ON DELETE SET NULL;


--
-- Name: ml_model_activation_history ml_model_activation_history_previous_model_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_activation_history
    ADD CONSTRAINT ml_model_activation_history_previous_model_version_id_fkey FOREIGN KEY (previous_model_version_id) REFERENCES public.ml_model_versions(id) ON DELETE SET NULL;


--
-- Name: ml_model_aliases ml_model_aliases_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_aliases
    ADD CONSTRAINT ml_model_aliases_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: ml_model_aliases ml_model_aliases_model_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_aliases
    ADD CONSTRAINT ml_model_aliases_model_version_id_fkey FOREIGN KEY (model_version_id) REFERENCES public.ml_model_versions(id) ON DELETE CASCADE;


--
-- Name: ml_model_evaluations ml_model_evaluations_feature_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_evaluations
    ADD CONSTRAINT ml_model_evaluations_feature_set_id_fkey FOREIGN KEY (feature_set_id) REFERENCES public.ml_feature_sets(id) ON DELETE SET NULL;


--
-- Name: ml_model_evaluations ml_model_evaluations_model_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_evaluations
    ADD CONSTRAINT ml_model_evaluations_model_version_id_fkey FOREIGN KEY (model_version_id) REFERENCES public.ml_model_versions(id) ON DELETE CASCADE;


--
-- Name: ml_model_evaluations ml_model_evaluations_training_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_evaluations
    ADD CONSTRAINT ml_model_evaluations_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES public.ml_training_runs(id) ON DELETE CASCADE;


--
-- Name: ml_model_versions ml_model_versions_feature_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_versions
    ADD CONSTRAINT ml_model_versions_feature_set_id_fkey FOREIGN KEY (feature_set_id) REFERENCES public.ml_feature_sets(id) ON DELETE SET NULL;


--
-- Name: ml_model_versions ml_model_versions_training_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_model_versions
    ADD CONSTRAINT ml_model_versions_training_run_id_fkey FOREIGN KEY (training_run_id) REFERENCES public.ml_training_runs(id) ON DELETE CASCADE;


--
-- Name: ml_prediction_outputs ml_prediction_outputs_prediction_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_prediction_outputs
    ADD CONSTRAINT ml_prediction_outputs_prediction_run_id_fkey FOREIGN KEY (prediction_run_id) REFERENCES public.ml_prediction_runs(id) ON DELETE CASCADE;


--
-- Name: ml_prediction_runs ml_prediction_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_prediction_runs
    ADD CONSTRAINT ml_prediction_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: ml_training_runs ml_training_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_training_runs
    ADD CONSTRAINT ml_training_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: ml_training_runs ml_training_runs_parent_training_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ml_training_runs
    ADD CONSTRAINT ml_training_runs_parent_training_run_id_fkey FOREIGN KEY (parent_training_run_id) REFERENCES public.ml_training_runs(id) ON DELETE SET NULL;


--
-- Name: predict_clean_customers predict_clean_customers_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_customers
    ADD CONSTRAINT predict_clean_customers_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_clean_payments predict_clean_payments_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_payments
    ADD CONSTRAINT predict_clean_payments_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_clean_usage predict_clean_usage_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_clean_usage
    ADD CONSTRAINT predict_clean_usage_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_backend_payment predict_raw_sheet_backend_payment_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_backend_payment
    ADD CONSTRAINT predict_raw_sheet_backend_payment_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_email_usage_api predict_raw_sheet_email_usage_api_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_api
    ADD CONSTRAINT predict_raw_sheet_email_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_email_usage_bc predict_raw_sheet_email_usage_bc_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_bc
    ADD CONSTRAINT predict_raw_sheet_email_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_email_usage_otp predict_raw_sheet_email_usage_otp_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_email_usage_otp
    ADD CONSTRAINT predict_raw_sheet_email_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_sms_usage_api predict_raw_sheet_sms_usage_api_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_api
    ADD CONSTRAINT predict_raw_sheet_sms_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_sms_usage_bc predict_raw_sheet_sms_usage_bc_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_bc
    ADD CONSTRAINT predict_raw_sheet_sms_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_sms_usage_otp predict_raw_sheet_sms_usage_otp_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_sms_usage_otp
    ADD CONSTRAINT predict_raw_sheet_sms_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: predict_raw_sheet_users_user_profile predict_raw_sheet_users_user_profile_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predict_raw_sheet_users_user_profile
    ADD CONSTRAINT predict_raw_sheet_users_user_profile_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.predict_data_sources(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: train_clean_customers train_clean_customers_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_customers
    ADD CONSTRAINT train_clean_customers_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_clean_payments train_clean_payments_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_payments
    ADD CONSTRAINT train_clean_payments_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_clean_usage train_clean_usage_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_clean_usage
    ADD CONSTRAINT train_clean_usage_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_backend_payment train_raw_sheet_backend_payment_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_backend_payment
    ADD CONSTRAINT train_raw_sheet_backend_payment_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_email_usage_api train_raw_sheet_email_usage_api_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_api
    ADD CONSTRAINT train_raw_sheet_email_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_email_usage_bc train_raw_sheet_email_usage_bc_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_bc
    ADD CONSTRAINT train_raw_sheet_email_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_email_usage_otp train_raw_sheet_email_usage_otp_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_email_usage_otp
    ADD CONSTRAINT train_raw_sheet_email_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_sms_usage_api train_raw_sheet_sms_usage_api_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_api
    ADD CONSTRAINT train_raw_sheet_sms_usage_api_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_sms_usage_bc train_raw_sheet_sms_usage_bc_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_bc
    ADD CONSTRAINT train_raw_sheet_sms_usage_bc_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_sms_usage_otp train_raw_sheet_sms_usage_otp_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_sms_usage_otp
    ADD CONSTRAINT train_raw_sheet_sms_usage_otp_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- Name: train_raw_sheet_users_user_profile train_raw_sheet_users_user_profile_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.train_raw_sheet_users_user_profile
    ADD CONSTRAINT train_raw_sheet_users_user_profile_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.train_data_sources(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict EnaVIkDjUixGpzxwBNrQvQy4kVzIWtBHja9iZnilPTCr77czzFglKBNLe1gaQJ0

