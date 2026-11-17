-- 产业链智能体 · 单机演示库（SQLite）
-- 生产目标见 schema.pg.sql；两者字段一一对应，便于迁移。
--
-- 主键口径：company_key 一律作为主键。
--   有统一社会信用代码时，company_key = credit_code，key_status='verified'；
--   没有时（当前分片全部缺失），company_key = 'pending:<行业码>:<规范化名称哈希>'，
--   key_status='pending_credit_code'，等外部导入真码后原地升级，绝不伪造代码。

pragma journal_mode = wal;
pragma foreign_keys = on;

create table if not exists industry (
  code          text primary key,
  label         text not null,
  shard_file    text,
  imported_at   text not null,
  company_count integer not null default 0,
  counts_json   text
);

create table if not exists company (
  company_key    text primary key,
  credit_code    text,
  key_status     text not null check (key_status in ('verified', 'pending_credit_code')),
  name           text not null,
  norm_name      text not null,
  industry_code  text not null references industry(code),
  chain          text,
  sector         text,
  tertiary_sector text,
  company_type   text,
  is_listed      integer not null default 0,
  stock_code     text,
  province       text,
  city           text,
  district       text,
  address        text,
  lng            real,
  lat            real,
  geo_precision  text,
  products       text,
  core_technology text,
  source_file    text,
  raw_json       text,
  updated_at     text not null
);

create index if not exists idx_company_industry on company(industry_code);
create index if not exists idx_company_name on company(name);
-- 一家企业可同时属于多条产业链（如中国能建同时在算力与储能链），故唯一性限定在链内
create unique index if not exists ux_company_industry_credit
    on company(industry_code, credit_code) where credit_code is not null;
-- 名称不做唯一约束：同名不同码（如清单里腾讯云两条）、缺码主体按行独立建账都是合法情况。
-- 唯一性由主键 company_key 保证；名称索引只服务查询。
create index if not exists ix_company_name_industry on company(industry_code, norm_name);

create table if not exists company_alias (
  company_key text not null references company(company_key) on delete cascade,
  alias       text not null,
  alias_type  text,
  primary key (company_key, alias)
);
create index if not exists idx_alias_text on company_alias(alias);

create table if not exists company_chain_tag (
  company_key   text not null references company(company_key) on delete cascade,
  industry_code text not null,
  level1        text not null,
  level2        text not null default '',
  is_primary    integer not null default 1,
  confidence    real,
  evidence_id   text,
  assigned_by   text not null default 'source-shard',
  assigned_at   text not null,
  primary key (company_key, industry_code, level1, level2)
);
create index if not exists idx_tag_level on company_chain_tag(industry_code, level1, level2);

create table if not exists relation (
  id            integer primary key autoincrement,
  industry_code text not null,
  from_key      text,
  to_key        text,
  from_name     text,
  to_name       text,
  rel_type      text not null,
  confidence    real,
  evidence_id   text,
  source_note   text,
  -- 关系证据强度：强（年报/公告直述）/ 中（同集团归集）/ 弱（同名或同法定代表人推断）
  strength      text,
  -- 对端范围：in-chain（两端都在本链）/ outside（对端为链外主体）
  scope         text,
  -- 交易类关系的买卖方向：customer（本行主体是卖方）/ supplier（本行主体是买方）
  trade_side    text,
  amount        real,
  share_pct     real,
  rel_year      integer,
  rel_date      text,
  source_table  text
);
create index if not exists idx_rel_from on relation(from_key);
create index if not exists idx_rel_to on relation(to_key);
create index if not exists idx_rel_industry on relation(industry_code);

create table if not exists evidence (
  id         text primary key,
  doc_id     text,
  locator    text,
  quote      text,
  source_url text,
  fetched_at text
);

create table if not exists raw_document (
  id           text primary key,
  source_id    text,
  url          text,
  http_status  integer,
  content_hash text,
  storage_key  text,
  fetched_at   text,
  parser       text,
  parse_status text
);

create table if not exists doc_chunk (
  id            integer primary key autoincrement,
  doc_id        text not null,
  industry_code text,
  chunk_no      integer not null,
  title         text,
  content       text not null,
  meta          text
);
create index if not exists idx_chunk_doc on doc_chunk(doc_id, chunk_no);
create index if not exists idx_chunk_industry on doc_chunk(industry_code);

-- P1 预留：渠道卡片与智能体运行日志（本期只建表，不写入业务数据）
create table if not exists source_card (
  source_id     text primary key,
  name          text not null,
  kind          text,
  entry_url     text,
  rate_limit    text,
  needs_auth    integer not null default 0,
  robots_policy text,
  parser        text,
  last_ok_at    text,
  fail_streak   integer not null default 0,
  yield_score   real
);

create table if not exists run_log (
  run_id      text primary key,
  started_at  text not null,
  finished_at text,
  phase       text,
  industry_code text,
  summary     text,
  metrics     text
);

create table if not exists decision_log (
  id         integer primary key autoincrement,
  run_id     text,
  action     text not null,
  payload    text,
  approved_by text,
  approved_at text,
  result     text
);
