-- Lovelace protocol — Neon PostgreSQL schema
-- Run once: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS agents (
  address        TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  capabilities   INTEGER DEFAULT 0,
  price_wei      TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  stake_amount   TEXT,
  jobs_completed INTEGER DEFAULT 0,
  registered_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id        INTEGER PRIMARY KEY,
  agent_name    TEXT,
  agent_addr    TEXT,
  client_addr   TEXT,
  description   TEXT,
  result        TEXT,
  tx_hash       TEXT,
  tx_url        TEXT,
  escrow_mnt    TEXT,
  rating        INTEGER,
  completed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  job_id      INTEGER,
  actor       TEXT,
  detail      TEXT,
  tx_hash     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_is_active    ON agents(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_agent_addr     ON jobs(agent_addr);
CREATE INDEX IF NOT EXISTS idx_jobs_client_addr    ON jobs(client_addr);
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at   ON jobs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_job_id       ON events(job_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at   ON events(created_at DESC);
