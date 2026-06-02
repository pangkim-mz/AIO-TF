-- OmniGuard 인증 토큰 (control-plane)
--
-- 이 테이블은 토큰 → 테넌트/역할 매핑을 보관한다. 인증은 테넌트 컨텍스트가
-- 정해지기 *전*에 일어나므로(어떤 테넌트인지 토큰으로 알아낸다), 테넌트 RLS를
-- 적용하지 않는다. 토큰 원문은 저장하지 않고 sha256 hex 해시만 보관한다.

create table if not exists api_token (
  token_hash text primary key,          -- 토큰 원문의 sha256 hex
  tenant_id  text not null,
  role       text not null,             -- admin / analyst / viewer
  label      text not null default '',  -- 사람이 식별하기 위한 라벨(감사/폐기용)
  created_at timestamptz not null default now()
);
create index if not exists api_token_tenant_idx on api_token (tenant_id);
