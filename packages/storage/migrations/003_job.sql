-- OmniGuard 비동기 스캔 작업 큐 (control-plane)
--
-- 워커는 전 테넌트의 작업을 가로질러 처리해야 하므로(claimNext) 테넌트 RLS를
-- 적용하지 않는다. 테넌트 격리는 조회(getJob)에서 코드 레벨 tenant_id 필터로 강제한다.
-- created_at/updated_at은 애플리케이션이 생성하는 ISO 문자열(text)이다.

create table if not exists job (
  id          text primary key,
  seq         bigserial,                -- 삽입 순서(FIFO 클레임용; ULID는 ms 내 단조증가 미보장)
  tenant_id   text not null,
  type        text not null,            -- npm / vendor / iac / service / web
  status      text not null default 'queued', -- queued / running / succeeded / failed
  payload     jsonb not null,           -- 스캔 입력(종류별)
  result      jsonb,                    -- 성공 시 요약(ScanSummary 등)
  error       text,                     -- 실패 시 사용자 메시지
  attempts    integer not null default 0,
  created_at  text not null,
  updated_at  text not null
);
-- claimNext가 status='queued'를 seq(삽입 순서)로 집는다.
create index if not exists job_status_idx on job (status, seq);
create index if not exists job_tenant_idx on job (tenant_id);
