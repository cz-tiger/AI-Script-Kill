import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'postgres',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Test1',
  max: 10, family: 4,
  ssl: { rejectUnauthorized: false }
});

export async function checkDb() {
  try { await pool.query('select 1'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

export async function initDb() {
  await pool.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      phone varchar(20) unique,
      wechat_openid varchar(100) unique,
      nickname text,
      created_at timestamptz default now()
    );
    create table if not exists subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) unique,
      plan_tier text default 'free',
      daily_practice_limit int default 10,
      daily_tutor_limit int default 0,
      expire_at timestamptz,
      created_at timestamptz default now()
    );
    create table if not exists daily_usage (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id),
      date date not null,
      practice_count int default 0,
      tutor_count int default 0,
      unique(user_id, date)
    );
    create table if not exists scripts (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      title text not null,
      theme text not null,
      difficulty text not null default 'intermediate',
      player_count integer not null default 4,
      duration integer not null default 120,
      characters jsonb not null default '[]',
      timeline jsonb not null default '[]',
      clues jsonb not null default '[]',
      acts jsonb not null default '[]',
      host_manual jsonb default '{}',
      background text default '',
      status text not null default 'draft',
      source text not null default 'ai',
      word_count integer default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists script_versions (
      id uuid primary key default gen_random_uuid(),
      script_id uuid not null references scripts(id) on delete cascade,
      version_number integer not null default 1,
      characters jsonb, timeline jsonb, clues jsonb, acts jsonb, host_manual jsonb,
      change_description text,
      created_at timestamptz not null default now()
    );
    create index if not exists scripts_user_id_idx on scripts(user_id);
    create index if not exists script_versions_script_id_idx on script_versions(script_id);
  `);
}
