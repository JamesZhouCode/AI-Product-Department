-- 产业链智能体 · 生产目标库（PostgreSQL 16 + pgvector）
-- 与 schema.sqlite.sql 字段对齐；差异仅类型：uuid/jsonb/timestamptz/vector。

create extension if not exists pgcrypto;
create extension if not exists vector;

create table if not exists industry (
  code          text primary key,
  label         text not null,
  shard_file    text,
  imported_at   timestamptz not null default now(),
  company_count integer not null default 0,
  counts_json   jsonb
);

create table if not exists company (
  company_key     text primary key,           -- credit_code 或 pending:<industry>:<hash>
  credit_code     text unique,
  key_status      text not null check (key_status in ('verified', 'pending_credit_code')),
  name            text not null,
  norm_name       text not null,
  industry_code   text not null references industry(code),
  chain           text,
  sector          text,
  tertiary_sector text,
  company_type    text,
  is_listed       boolean not null default false,
  stock_code      text,
  province        text,
  city            text,
  district        text,
  address         text,
  lng             numeric,
  lat             numeric,
  geo_precision   text,
  products        text,
  core_technology text,
  source_file     text,
  raw_json        jsonb,
  updated_at      timestamptz not null default now()
);

create index if not exists idx_company_industry on company(industry_code);
create index if not exists idx_company_name on company(name);
create unique index if not exists ux_company_name_industry on company(industry_code, norm_name);
create index if not exists idx_company_pending on company(key_status) where key_status = 'pending_credit_code';

create table if not exists company_alias (
  company_key text not null references company(company_key) on delete cascade,
  alias       text not null,
  alias_type  text,
  primary key (company_key, alias)
);

create table if not exists company_chain_tag (
  company_key   text not null references company(company_key) on delete cascade,
  industry_code text not null,
  level1        text not null,
  level2        text not null default '',
  is_primary    boolean not null default true,
  confidence    numeric,
  evidence_id   text,
  assigned_by   text not null default 'source-shard',
  assigned_at   timestamptz not null default now(),
  primary key (company_key, industry_code, level1, level2)
);
create index if not exists idx_tag_level on company_chain_tag(industry_code, level1, level2);

create table if not exists relation (
  id            bigint generated always as identity primary key,
  industry_code text not null,
  from_key      text references company(company_key),
  to_key        text references company(company_key),
  from_name     text,
  to_name       text,
  rel_type      text not null,
  confidence    numeric,
  evidence_id   text,
  source_note   text
);
create index if not exists idx_rel_from on relation(from_key);
create index if not exists idx_rel_to on relation(to_key);

create table if not exists evidence (
  id         text primary key,
  doc_id     text references raw_document(id),
  locator    text,
  quote      text,
  source_url text,
  fetched_at timestamptz
);

create table if not exists raw_document (
  id           text primary key,
  source_id    text,
  url          text,
  http_status  int,
  content_hash text,
  storage_key  text not null,
  fetched_at   timestamptz not null,
  parser       text,
  parse_status text check (parse_status in ('ok', 'partial', 'failed'))
);

create table if not exists doc_chunk (
  id            bigint generated always as identity primary key,
  doc_id        text references raw_document(id),
  industry_code text,
  chunk_no      int not null,
  title         text,
  content       text not null,
  meta          jsonb,
  embedding     vector(1024),
  unique (doc_id, chunk_no)
);
create index if not exists idx_chunk_industry on doc_chunk(industry_code);

create table if not exists source_card (
  source_id     text primary key,
  name          text not null,
  kind          text,
  entry_url     text,
  rate_limit    text,
  needs_auth    boolean not null default false,
  robots_policy text,
  parser        text,
  last_ok_at    timestamptz,
  fail_streak   int not null default 0,
  yield_score   numeric
);

create table if not exists run_log (
  run_id        text primary key,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  phase         text,
  industry_code text,
  summary       text,
  metrics       jsonb
);

create table if not exists decision_log (
  id          bigint generated always as identity primary key,
  run_id      text references run_log(run_id),
  action      text not null,
  payload     jsonb,
  approved_by text,
  approved_at timestamptz,
  result      text
);
