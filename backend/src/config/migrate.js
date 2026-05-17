require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./database');

const schema = `
-- Roles: bdm, exec_pa, bde, sbde, pe, spe, bda, pa
-- CPF type: local, pr, foreign
-- Management cost: 1900 (bd roles), 1300 (project roles), 700 (assistants)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('bdm', 'exec_pa', 'bde', 'sbde', 'pe', 'spe', 'bda', 'pa')),
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
  confirmation_date DATE,
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

-- Update role constraint to include senior roles (safe to run on existing DB)
-- Add confirmation_date to projects if not exists
ALTER TABLE projects ADD COLUMN IF NOT EXISTS confirmation_date DATE;

-- Expand project_type to support event categories (drop old restrictive constraint)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_type_check;
ALTER TABLE projects ALTER COLUMN project_type TYPE VARCHAR(100);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_google_link TEXT;

-- Clients: new fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS project_name VARCHAR(200);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS project_type VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_details VARCHAR(200);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS estimated_revenue NUMERIC(12,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS estimated_gp NUMERIC(12,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_link TEXT;

-- Sales effort: separate pipeline/prospect counts
ALTER TABLE sales_effort ADD COLUMN IF NOT EXISTS prospect_count INTEGER NOT NULL DEFAULT 0;

-- Clients: lost category and loss reason
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_list_type_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_list_type_check;
ALTER TABLE clients ADD CONSTRAINT clients_list_type_check CHECK (list_type IN ('current', 'pipeline', 'prospect', 'lost', 'completed'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS loss_reason TEXT;

-- Projects: cancellation reason
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- GP distribution across crew members on a project
CREATE TABLE IF NOT EXISTS project_crew (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_lead BOOLEAN NOT NULL DEFAULT FALSE,
  gp_allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_crew_project ON project_crew(project_id);
CREATE INDEX IF NOT EXISTS idx_project_crew_user ON project_crew(user_id);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('bdm', 'exec_pa', 'bde', 'sbde', 'pe', 'spe', 'bda', 'pa'));

-- Individual GP target (T1); T0.5/T2/T3 derived on frontend
ALTER TABLE users ADD COLUMN IF NOT EXISTS gp_target_t1 NUMERIC(12,2);

-- CPF/Permit type: expand to cover all pass types
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cpf_type_check;
ALTER TABLE users ALTER COLUMN cpf_type TYPE VARCHAR(20);
UPDATE users SET cpf_type = 'cpf' WHERE cpf_type IN ('local', 'pr');
UPDATE users SET cpf_type = 'work_permit' WHERE cpf_type = 'foreign';
ALTER TABLE users ADD CONSTRAINT users_cpf_type_check CHECK (cpf_type IN ('cpf', 'work_permit', 's_pass', 'e_pass'));

CREATE INDEX IF NOT EXISTS idx_projects_assigned_to ON projects(assigned_to);
CREATE INDEX IF NOT EXISTS idx_projects_period ON projects(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_list_type ON clients(list_type);
CREATE INDEX IF NOT EXISTS idx_sales_effort_user_week ON sales_effort(user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_meetings_user_week ON weekly_meetings(user_id, week_start);

-- Advice Guru: DISC personality profiles
CREATE TABLE IF NOT EXISTS disc_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  d_score INTEGER NOT NULL DEFAULT 25,
  i_score INTEGER NOT NULL DEFAULT 25,
  s_score INTEGER NOT NULL DEFAULT 25,
  c_score INTEGER NOT NULL DEFAULT 25,
  dominant_type CHAR(1) NOT NULL DEFAULT 'D',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Advice Guru: Quarterly individual 1-1 reviews
CREATE TABLE IF NOT EXISTS individual_reviews (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  quarter INTEGER NOT NULL CHECK (quarter IN (1,2,3,4)),
  year INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  action_items TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, quarter, year)
);

-- Advice Guru: Quarterly team reviews
CREATE TABLE IF NOT EXISTS team_reviews (
  id SERIAL PRIMARY KEY,
  quarter INTEGER NOT NULL CHECK (quarter IN (1,2,3,4)),
  year INTEGER NOT NULL,
  total_gp NUMERIC(12,2) DEFAULT 0,
  total_projects INTEGER DEFAULT 0,
  total_prospects INTEGER DEFAULT 0,
  total_pipeline INTEGER DEFAULT 0,
  highlights TEXT,
  challenges TEXT,
  action_items TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(quarter, year)
);

-- Link non-BDM users to their reporting BDM
ALTER TABLE users ADD COLUMN IF NOT EXISTS bdm_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- 1-1 Catch-Up Reviews: session metadata
ALTER TABLE individual_reviews ADD COLUMN IF NOT EXISTS catch_up_date DATE;
ALTER TABLE individual_reviews ADD COLUMN IF NOT EXISTS location VARCHAR(200);
ALTER TABLE individual_reviews ADD COLUMN IF NOT EXISTS spend NUMERIC(10,2);

-- External Co-Broker GP splits on projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_brokers JSONB NOT NULL DEFAULT '[]';

-- Manpower / Co-broke client fields
ALTER TABLE clients ADD COLUMN IF NOT EXISTS project_lead_name VARCHAR(200);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS project_entity VARCHAR(100);

-- Resignation tracking for staff
ALTER TABLE users ADD COLUMN IF NOT EXISTS resignation_date DATE;

-- Billing records imported from monthly billing sheets
CREATE TABLE IF NOT EXISTS billing_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL,
  row_number INTEGER,
  account_type VARCHAR(50),
  client_name VARCHAR(300),
  billing_company VARCHAR(200),
  invoice_nos TEXT,
  quotation_no VARCHAR(100),
  invoice_amt_ex_gst NUMERIC(12,2),
  gst_amt NUMERIC(12,2),
  invoice_amt_inc_gst NUMERIC(12,2),
  estimated_cost NUMERIC(12,2),
  estimated_gp NUMERIC(12,2),
  gp_margin NUMERIC(8,4),
  personal_gp_pct NUMERIC(8,4),
  personal_gp NUMERIC(12,2),
  remarks_bd TEXT,
  remarks_finance TEXT,
  due_date DATE,
  payment_status VARCHAR(50),
  payment_date DATE,
  impairment_days INTEGER,
  impairment_amount NUMERIC(12,2),
  section VARCHAR(50) DEFAULT 'normal',
  confirmed_at TIMESTAMPTZ,
  confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  import_batch VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_records_user_period ON billing_records (user_id, period_year, period_month);
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
