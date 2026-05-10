require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./database');

const schema = `
-- Roles: bdm, bde, pe, bda, pa
-- CPF type: local, pr, foreign
-- Management cost: 1900 (bd roles), 1300 (project roles), 700 (assistants)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('bdm', 'bde', 'pe', 'bda', 'pa')),
  join_date DATE NOT NULL,
  salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  cpf_type VARCHAR(10) NOT NULL DEFAULT 'local' CHECK (cpf_type IN ('local', 'pr', 'foreign')),
  cpf_rate NUMERIC(5,4) NOT NULL DEFAULT 0.17,
  permit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  client_name VARCHAR(150) NOT NULL,
  project_type VARCHAR(20) NOT NULL DEFAULT 'events' CHECK (project_type IN ('events', 'non_events')),
  event_date DATE,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  gp NUMERIC(12,2) GENERATED ALWAYS AS (revenue - cost) STORED,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_month INTEGER,
  period_year INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  list_type VARCHAR(20) NOT NULL CHECK (list_type IN ('current', 'pipeline', 'prospect')),
  event_date DATE,
  estimated_value NUMERIC(12,2),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_meetings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  action_items TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

CREATE TABLE IF NOT EXISTS sales_effort (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meeting_id INTEGER REFERENCES weekly_meetings(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  cold_emails_target INTEGER NOT NULL DEFAULT 0,
  cold_emails_actual INTEGER NOT NULL DEFAULT 0,
  cold_calls_target INTEGER NOT NULL DEFAULT 0,
  cold_calls_actual INTEGER NOT NULL DEFAULT 0,
  new_clients_met_target INTEGER NOT NULL DEFAULT 0,
  new_clients_met_actual INTEGER NOT NULL DEFAULT 0,
  proposals_sent_target INTEGER NOT NULL DEFAULT 0,
  proposals_sent_actual INTEGER NOT NULL DEFAULT 0,
  existing_clients_count INTEGER NOT NULL DEFAULT 0,
  potential_clients_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_projects_assigned_to ON projects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_projects_period ON projects(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_list_type ON clients(list_type);
CREATE INDEX IF NOT EXISTS idx_sales_effort_user_week ON sales_effort(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_meetings_user_week ON weekly_meetings(user_id, week_start);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    await client.query(schema);
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
