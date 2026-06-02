-- OmniGuard 영속화 스키마 (멀티테넌트 + RLS)
--
-- 테넌트 격리는 RLS로 강제한다. 세션마다
--   select set_config('omniguard.tenant_id', '<tenantId>', false)
-- 를 설정하면 해당 테넌트의 행만 보이고 쓸 수 있다.
--
-- 주의: RLS는 비-슈퍼유저 역할에만 적용된다(슈퍼유저는 항상 우회).
-- 운영에서는 애플리케이션 전용 비-슈퍼유저 역할로 접속해야 격리가 보장된다.
-- id/tenant_id는 애플리케이션이 생성하는 ULID(26자 text)이다.

create table if not exists asset (
  id          text primary key,
  tenant_id   text not null,
  type        text not null,
  identifier  text not null,            -- 자연키: purl / domain / resourceId
  data        jsonb not null,           -- 전체 Asset 객체
  unique (tenant_id, type, identifier)
);
create index if not exists asset_tenant_idx on asset (tenant_id);

create table if not exists finding (
  id                text primary key,
  tenant_id         text not null,
  asset_id          text not null,
  source_finding_id text not null,      -- CVE-xxxx / GHSA-xxxx
  data              jsonb not null,
  unique (tenant_id, asset_id, source_finding_id)
);
create index if not exists finding_tenant_idx on finding (tenant_id);

create table if not exists risk_score (
  id          text primary key,
  tenant_id   text not null,
  finding_id  text not null,
  data        jsonb not null,
  unique (tenant_id, finding_id)        -- finding당 현재 점수 1개
);
create index if not exists risk_score_tenant_idx on risk_score (tenant_id);

create table if not exists asset_relationship (
  id            text primary key,
  tenant_id     text not null,
  from_asset_id text not null,
  to_asset_id   text not null,
  type          text not null,          -- depends_on / provided_by / hosted_on / contains
  data          jsonb not null,
  unique (tenant_id, from_asset_id, to_asset_id, type)
);
create index if not exists asset_relationship_tenant_idx on asset_relationship (tenant_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table asset              enable row level security;
alter table asset              force  row level security;
alter table finding            enable row level security;
alter table finding            force  row level security;
alter table risk_score         enable row level security;
alter table risk_score         force  row level security;
alter table asset_relationship enable row level security;
alter table asset_relationship force  row level security;

drop policy if exists asset_tenant_isolation on asset;
create policy asset_tenant_isolation on asset
  using (tenant_id = current_setting('omniguard.tenant_id', true))
  with check (tenant_id = current_setting('omniguard.tenant_id', true));

drop policy if exists finding_tenant_isolation on finding;
create policy finding_tenant_isolation on finding
  using (tenant_id = current_setting('omniguard.tenant_id', true))
  with check (tenant_id = current_setting('omniguard.tenant_id', true));

drop policy if exists risk_score_tenant_isolation on risk_score;
create policy risk_score_tenant_isolation on risk_score
  using (tenant_id = current_setting('omniguard.tenant_id', true))
  with check (tenant_id = current_setting('omniguard.tenant_id', true));

drop policy if exists asset_relationship_tenant_isolation on asset_relationship;
create policy asset_relationship_tenant_isolation on asset_relationship
  using (tenant_id = current_setting('omniguard.tenant_id', true))
  with check (tenant_id = current_setting('omniguard.tenant_id', true));
