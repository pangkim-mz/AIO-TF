-- OmniGuard 작업 큐 재시도/회수 지원 (D9 고도화)
--
-- available_at: 이 시각(ISO text) 이후에만 클레임 가능. 백오프 재시도용.
--   기존 행은 created_at으로 백필해 즉시 클레임 가능 상태를 보존한다.
-- claimNext는 (status='queued' and available_at<=now) 또는 리스 만료된 running을 집는다.

alter table job add column if not exists available_at text not null default '';
update job set available_at = created_at where available_at = '';

-- 클레임 경로: queued를 available_at·seq 순으로 집는다.
create index if not exists job_claim_idx on job (status, available_at, seq);
-- 회수 경로: running 잡의 리스 만료(updated_at)를 본다.
create index if not exists job_lease_idx on job (status, updated_at);
