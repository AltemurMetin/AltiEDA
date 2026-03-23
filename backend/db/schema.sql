-- AltiEDA PostgreSQL Schema
-- Uses JSONB for flexible storage of large nested EDA state objects.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  password_hash TEXT       NOT NULL,
  plan         TEXT        NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'enterprise'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_public       BOOLEAN     NOT NULL DEFAULT FALSE,
  schematic_state JSONB,     -- full schematic JSON (components, wires, nets)
  pcb_state       JSONB,     -- full PCB layout JSON (traces, vias, footprints)
  stackup_state   JSONB,     -- layer stack-up JSON
  simulation_state JSONB,    -- last simulation results
  thumbnail_url   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner   ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_name    ON projects USING GIN (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_projects_sch     ON projects USING GIN (schematic_state);
CREATE INDEX IF NOT EXISTS idx_projects_pcb     ON projects USING GIN (pcb_state);

-- ── Component Library ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS component_library (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  is_public     BOOLEAN     NOT NULL DEFAULT FALSE,
  part_id       TEXT        NOT NULL,
  part_name     TEXT        NOT NULL,
  category      TEXT        NOT NULL,
  symbol_data   JSONB,      -- SymbolEditor.toJSON()
  footprint_data JSONB,     -- FootprintEditor.toJSON()
  pin_pad_map   JSONB,
  spice_model   JSONB,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, part_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_lib_owner ON component_library(owner_id);
CREATE INDEX IF NOT EXISTS idx_comp_lib_pid   ON component_library(part_id);
CREATE INDEX IF NOT EXISTS idx_comp_lib_cat   ON component_library(category);

-- ── Collaboration: project members ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer',  -- 'viewer' | 'editor' | 'owner'
  invited_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- ── Audit log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,   -- 'save_schematic', 'export_gerber', etc.
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Helper: auto-update updated_at ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_complib_updated  BEFORE UPDATE ON component_library FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
