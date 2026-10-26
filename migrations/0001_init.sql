PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  objective TEXT NOT NULL DEFAULT '' CHECK(length(objective) <= 4000),
  scope TEXT NOT NULL DEFAULT 'authorized-data-only' CHECK(length(scope) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','review','closed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  source_note TEXT NOT NULL DEFAULT '' CHECK(length(source_note) <= 2000),
  collected_by TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 8000),
  confidence TEXT NOT NULL DEFAULT 'unverified' CHECK(confidence IN ('unverified','low','medium','high','confirmed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_time TEXT NOT NULL,
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 2000),
  evidence_id TEXT REFERENCES evidence(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON cases(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_observations_case_id ON observations(case_id);
CREATE INDEX IF NOT EXISTS idx_timeline_case_time ON timeline_events(case_id, event_time);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at DESC);
