# OmniGuard — 프로젝트 작업 지침

AI 기반 인프라/공급망 리스크 통합 관제 SaaS. 전역 `~/.claude/CLAUDE.md`의 원칙을
따르되, 아래는 이 프로젝트에 한정된 컨텍스트다. 사용 방법 전반은 `README.md` 참고.

## 한 줄 요약

하나의 정규화 스키마(`Asset`/`Finding`/`RiskScore`)로 **SW공급망 · 벤더 · 클라우드(IaC)**
세 도메인을 흡수하고, 자산 그래프 전파로 **서비스 단위 통합 리스크**를 산출한다.
점수는 결정론적(`scoringVersion`), AI는 점수 *해석*만 담당.

## 진입점 / 명령어

```bash
pnpm install
pnpm test          # vitest, 네트워크 불필요(OSV 모킹). 현재 79 passed / 1 skipped(Postgres)
pnpm typecheck     # tsc --noEmit

# CLI 스캔
pnpm scan <package.json>              # SW 공급망(npm) — lockfile로 정확한 버전, --json 지원
pnpm scan:vendor <vendors.yaml>       # 벤더/서드파티 컴플라이언스
pnpm scan:iac <plan.json>             # Terraform plan JSON
pnpm scan:service <services.yaml>     # 도메인 간 엣지 연결(영속화된 자산 대상 → DATABASE_URL/TENANT_ID 권장)

# HTTP API (Fastify, 포트 3000)
pnpm serve         # OMNIGUARD_TOKENS 미설정 시 dev-token/admin 발급

# 대시보드 (Next.js, 별도 터미널)
pnpm web:dev       # env: API_BASE_URL(기본 localhost:3000), API_TOKEN(기본 dev-token)
```

## 아키텍처 핵심 — 새 도메인은 코어 변경 0줄로 추가

세 도메인 모두 `schema`/`scoring`/`graph`/`storage` **변경 없이** 추가됐다. 신규 도메인은
**입력 파싱 + 규칙(커넥터)만** 작성한다. 이 불변식을 깨야 한다면 먼저 이유를 설명할 것.

- `packages/schema` — 공통 정규화 스키마(zod). **여기를 바꾸면 전 도메인에 파급** → 신중히.
- `packages/scoring` — 결정론적 점수. 로직 변경 시 `scoringVersion`을 올려 재현성 보존.
- `packages/graph` — 관계 전파. `impact(x) = max(own(x), max impact(자식))`, 순환 안전.
- `packages/storage` — 포트/어댑터(`Repository`). InMemory · Postgres+RLS가 동일 계약.
  계약 테스트는 두 어댑터에 동일 적용(Postgres는 `DATABASE_URL` 있을 때만 실행).
- `packages/connector-*` — 도메인별 입력 파싱 + 규칙. 신규 도메인은 보통 여기만 추가.
- `packages/enrich-osv` — OSV.dev 보강(타임아웃·재시도·동시성 제한). 테스트는 Enricher 주입으로 네트워크 분리.
- `apps/{cli,api,web}` — 오케스트레이션/노출 계층. 비즈니스 로직 두지 말 것.

도메인 간 통합: `service` 자산이 `depends_on`(→패키지)·`hosted_on`(→클라우드)·`provided_by`(→벤더)
엣지로 세 도메인을 가로지른다. `buildTopology`가 기존 자산을 자연키로 조회해 연결 →
서비스 영향도가 모든 도메인 리스크의 통합 최악값이 된다(OmniGuard 최종 목적).

## 테넌트 격리 / 영속화

- 멀티테넌트: 코드 필터 + Postgres **RLS** 이중 방어. **운영은 비-슈퍼유저 역할로 접속해야**
  RLS가 강제됨(슈퍼유저 우회). 세션 변수 `omniguard.tenant_id`.
- 멱등 upsert(자연키: asset=purl, finding=assetId+sourceFindingId, score=findingId). 재스캔 중복 없음.
- 마이그레이션: `packages/storage/migrations/001_init.sql`(스캔 시 자동 적용).

## API 규약

- 인증: `Authorization: Bearer <token>` → `AuthProvider`가 테넌트/역할 해석(`apps/api/src/auth.ts`).
- RBAC: 읽기=인증된 전 역할, 쓰기(스캔)=`admin`/`analyst`.
- 응답 포맷 고정(`apps/api/src/envelope.ts`): 성공 `{ok:true,data}` / 실패 `{ok:false,error:{code,message}}`.
  code=디버깅용, message=사용자용. 내부 오류 상세는 비노출.

## 환경 주의사항 (Windows)

- pnpm v11.5.0, `npm i -g pnpm`으로 설치(corepack은 Program Files 권한 오류).
  **pnpm 11.5.0은 Node 22.13+ 요구** → 로컬·CI 모두 Node 22 이상(CI는 `node-version: 22`).
- 빌드 스크립트: pnpm 11은 `strictDepBuilds` 기본 활성 → 미승인 빌드가 있으면 `pnpm install`이
  `ERR_PNPM_IGNORED_BUILDS`로 실패. esbuild는 플랫폼 바이너리로 동작하므로
  `pnpm-workspace.yaml`의 `allowBuilds.esbuild: false`로 **빌드 비실행을 명시**(pnpm 10의
  `onlyBuiltDependencies`/`ignoredBuiltDependencies`는 11에서 제거됨). `.npmrc`의
  `verify-deps-before-run=false`는 실행 전 의존성 검증만 끈다.
- **vitest flaky**: Windows Temp transform 캐시에서 가끔 `UNKNOWN` 오류로 일부 파일 미실행 → **재실행하면 정상**.
- Next 실행은 pnpm 구조상 `apps/web`에서 `node node_modules/next/dist/bin/next start`
  (루트 `.bin/next` 셸심은 실패). `pnpm web:dev`/`web:build`는 정상.

## 컨벤션

- Conventional Commits(`feat:`/`fix:`/`refactor:`…), 한 커밋 한 변경. 커밋 전 test/typecheck 통과 확인.
- 커밋 메시지/문서는 한국어. 식별자·코드는 영어.

## 다음 단계 (로드맵 [예정])

1. **스캔 비동기화(큐)** — 현재 OSV/스캔이 동기. POST가 jobId 반환 + 상태 폴링/조회 엔드포인트. 코어 아키텍처 변경 수반.
2. **인증 고도화** — env 토큰 → 토큰 DB 또는 OIDC. 범위 큼/설계 결정 많음.

완료: CI 파이프라인(`.github/workflows/ci.yml`, GitHub 연결·가동·통과. Node 22 + pnpm 11 allowBuilds),
대시보드 서비스 뷰(`/services` + `lib/services.ts`).

### 알려진 한계

- `yarn.lock` 미지원(npm/pnpm lockfile만). 없으면 레인지 폴백.
- OSV CVSS 숫자 점수 파싱 미구현(현재 GHSA 텍스트 심각도만 매핑).
