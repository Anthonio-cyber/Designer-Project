-- =============================================================================
-- Designer Portfolio & Client Platform - relational schema
-- Dialect: SQLite (foreign keys enforced, WAL journal).
-- Every table uses TEXT ids (uuid v4) so the schema ports to PostgreSQL cleanly.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- identity ---
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deactivated')),
  avatar_file_id TEXT,
  last_seen_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS profiles (
  user_id   TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  company   TEXT,
  phone     TEXT,
  website   TEXT,
  location  TEXT,
  bio       TEXT,
  preferences TEXT NOT NULL DEFAULT '{}'
);

-- Refresh-token sessions. Only a hash of the token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip         TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- storage ---
CREATE TABLE IF NOT EXISTS files (
  id           TEXT PRIMARY KEY,
  uploader_id  TEXT REFERENCES users (id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  stored_path  TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  width        INTEGER,
  height       INTEGER,
  kind         TEXT NOT NULL DEFAULT 'attachment'
               CHECK (kind IN ('portfolio', 'attachment', 'reference', 'deliverable', 'avatar', 'branding')),
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  project_id   TEXT,
  conversation_id TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_project ON files (project_id);
CREATE INDEX IF NOT EXISTS idx_files_uploader ON files (uploader_id);

-- -------------------------------------------------------------- portfolio ---
CREATE TABLE IF NOT EXISTS portfolio_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_projects (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  category_id    TEXT REFERENCES portfolio_categories (id) ON DELETE SET NULL,
  summary        TEXT,
  description    TEXT,
  designer_notes TEXT,
  tools          TEXT NOT NULL DEFAULT '[]',
  thumbnail_url  TEXT,
  main_image_url TEXT,
  gallery        TEXT NOT NULL DEFAULT '[]',
  client_name    TEXT,
  project_date   TEXT,
  featured       INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  views          INTEGER NOT NULL DEFAULT 0,
  seo_title      TEXT,
  seo_description TEXT,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_status ON portfolio_projects (status, visibility);
CREATE INDEX IF NOT EXISTS idx_portfolio_category ON portfolio_projects (category_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_featured ON portfolio_projects (featured);

-- --------------------------------------------------------------- services ---
CREATE TABLE IF NOT EXISTS services (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  price_from    REAL,
  price_label   TEXT,
  delivery_time TEXT,
  icon          TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- requests ---
CREATE TABLE IF NOT EXISTS project_requests (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users (id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  project_type    TEXT,
  budget_range    TEXT,
  deadline        TEXT,
  preferred_style TEXT,
  brand_name      TEXT,
  colors          TEXT,
  dimensions      TEXT,
  target_audience TEXT,
  description     TEXT NOT NULL,
  style_example_note TEXT,
  reference_file_ids TEXT NOT NULL DEFAULT '[]',
  inspiration_project_id TEXT REFERENCES portfolio_projects (id) ON DELETE SET NULL,
  service_id      TEXT REFERENCES services (id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'reviewing', 'converted', 'declined')),
  admin_notes     TEXT,
  converted_project_id TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON project_requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_user ON project_requests (user_id);

-- --------------------------------------------------------- client projects ---
CREATE TABLE IF NOT EXISTS client_projects (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  client_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  request_id  TEXT REFERENCES project_requests (id) ON DELETE SET NULL,
  service_id  TEXT REFERENCES services (id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'request_received'
              CHECK (status IN ('request_received', 'discussion', 'designing', 'review', 'completed', 'cancelled')),
  budget      TEXT,
  deadline    TEXT,
  progress    INTEGER NOT NULL DEFAULT 10,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_client_projects_client ON client_projects (client_id);
CREATE INDEX IF NOT EXISTS idx_client_projects_status ON client_projects (status);

CREATE TABLE IF NOT EXISTS project_status_events (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  actor_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Design hand-offs the client approves or sends back for revision.
CREATE TABLE IF NOT EXISTS deliveries (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  version      INTEGER NOT NULL DEFAULT 1,
  title        TEXT NOT NULL,
  note         TEXT,
  file_ids     TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'revision_requested')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_project ON deliveries (project_id);

CREATE TABLE IF NOT EXISTS revisions (
  id          TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  project_id  TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  client_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message     TEXT NOT NULL,
  file_ids    TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- --------------------------------------------------------------- messaging ---
-- One private conversation per client. Only that client and admins may read it.
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  subject         TEXT,
  last_message_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body            TEXT NOT NULL DEFAULT '',
  project_id      TEXT REFERENCES client_projects (id) ON DELETE SET NULL,
  read_at         TEXT,
  deleted_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS message_attachments (
  message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  file_id    TEXT NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, file_id)
);

CREATE TABLE IF NOT EXISTS message_reports (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------- notifications ---
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_at);

-- --------------------------------------------------------------- features ---
CREATE TABLE IF NOT EXISTS features (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  status      TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('enabled', 'disabled')),
  config      TEXT NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  is_core     INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT NOT NULL DEFAULT 'system',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_versions (
  id          TEXT PRIMARY KEY,
  feature_id  TEXT NOT NULL REFERENCES features (id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  snapshot    TEXT NOT NULL,
  change_note TEXT,
  created_by  TEXT NOT NULL DEFAULT 'system',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_feature_versions ON feature_versions (feature_id, version);

-- --------------------------------------------------------------------- ai ---
CREATE TABLE IF NOT EXISTS ai_conversations (
  id         TEXT PRIMARY KEY,
  admin_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New conversation',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  meta            TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A proposed plan the AI produced. Nothing is applied until an admin approves.
CREATE TABLE IF NOT EXISTS ai_actions (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES ai_conversations (id) ON DELETE SET NULL,
  prompt       TEXT NOT NULL,
  summary      TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT '[]',
  risk         TEXT NOT NULL DEFAULT 'read' CHECK (risk IN ('read', 'write', 'dangerous')),
  status       TEXT NOT NULL DEFAULT 'proposed'
               CHECK (status IN ('proposed', 'approved', 'applied', 'rejected', 'failed', 'undone')),
  result       TEXT,
  undo_payload TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at   TEXT,
  undone_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_status ON ai_actions (status, created_at);

-- ---------------------------------------------------------------- auditing ---
CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  actor_type  TEXT NOT NULL DEFAULT 'system' CHECK (actor_type IN ('admin', 'client', 'system', 'ai', 'visitor')),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs (created_at);

-- ---------------------------------------------------------------- settings ---
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily rollups keep analytics cheap regardless of traffic volume.
CREATE TABLE IF NOT EXISTS analytics_events (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  day         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_unique
  ON analytics_events (type, COALESCE(entity_id, ''), day);

-- ---------------------------------------------------------------- payments ---
-- Money is stored in minor units (cents/kobo) as integers so no total is ever
-- subject to floating-point drift.
CREATE TABLE IF NOT EXISTS invoices (
  id             TEXT PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,
  client_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES client_projects (id) ON DELETE SET NULL,
  service_id     TEXT REFERENCES services (id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  amount_minor   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  method         TEXT NOT NULL DEFAULT 'stripe'
                 CHECK (method IN ('stripe', 'paystack', 'bank_transfer', 'other')),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'sent', 'paid', 'cancelled', 'refunded')),
  due_date       TEXT,
  notes          TEXT,
  provider_ref   TEXT,
  checkout_url   TEXT,
  checkout_expires_at TEXT,
  paid_at        TEXT,
  paid_method    TEXT,
  marked_paid_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  sent_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices (client_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices (project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_ref ON invoices (provider_ref);

-- Raw provider events, kept so a replayed or duplicated webhook is a no-op.
CREATE TABLE IF NOT EXISTS payment_events (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  invoice_id  TEXT REFERENCES invoices (id) ON DELETE SET NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_unique ON payment_events (provider, event_id);

-- ------------------------------------------------------------------- email ---
CREATE TABLE IF NOT EXISTS email_log (
  id          TEXT PRIMARY KEY,
  to_email    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  template    TEXT NOT NULL,
  provider    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at);
