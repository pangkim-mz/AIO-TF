# OmniGuard

AI 기반 인프라/공급망 리스크 통합 관제 시스템.

상용 SaaS 목표. 하나의 정규화 스키마로 **SW 공급망 · 벤더/서드파티 · 클라우드(IaC)** 세 도메인을
흡수하고, 그래프 전파로 **서비스 단위 통합 리스크**를 계산한다. 기본 파이프라인:
`입력 파싱 → 자산/발견 추출 → (OSV 등) 보강 → 결정론적 리스크 점수 → 그래프 영향도 전파 → 영속화`.
CLI · HTTP API(Fastify) · 대시보드(Next.js) 세 가지 진입점을 제공한다.

> 설계 근거와 진행 경위, 다음 세션 이어가기 가이드는 [`docs/PROJECT_NOTES.md`](docs/PROJECT_NOTES.md) 참고.

## 구조 (pnpm 모노레포)

| 패키지 | 역할 |
|---|---|
| `packages/schema` | 공통 정규화 스키마 (Asset / Finding / RiskScore, zod) |
| `packages/connector-npm` | package.json 스캐너 → 자산 추출 (lockfile로 정확한 버전 해석) |
| `packages/connector-vendor` | 벤더 인벤토리(YAML/JSON) → 자산 + 규칙 기반 컴플라이언스 평가 |
| `packages/connector-iac` | Terraform plan JSON → 클라우드 자산 + 미설정 규칙 평가 |
| `packages/connector-service` | 서비스 매니페스트 → 서비스 자산 + 도메인 간 엣지(통합 리스크) |
| `packages/enrich-osv` | OSV.dev API로 CVE 매칭 (타임아웃·재시도·동시성 제한) |
| `packages/scoring` | 결정론적 리스크 점수 (근거 분해 포함) |
| `packages/graph` | 자산 그래프 위험 전파 (순환 안전, 영향도 산정) |
| `packages/storage` | 멀티테넌트 영속화 (포트/어댑터: InMemory · Postgres+RLS) |
| `apps/cli` | 오케스트레이터 (`scan` · `scan:vendor` · `scan:iac` · `scan:service` · `scan:web`) |
| `apps/api` | HTTP API (Fastify): 토큰 인증·테넌트 라우팅·RBAC·일관 응답 포맷 |
| `apps/web` | 대시보드 (Next.js App Router): 자산·발견·영향도 시각화 |

## 사용법

```bash
pnpm install

# 테스트 (네트워크 불필요 — OSV는 모킹)
pnpm test

# 타입 체크
pnpm typecheck

# 실제 스캔 (OSV API 호출, 네트워크 필요)
# DATABASE_URL 미설정 시 인메모리에 영속화
pnpm scan <path/to/package.json>
pnpm scan <path/to/package.json> --json

# Postgres에 영속화 (마이그레이션 자동 적용)
$env:DATABASE_URL = "postgres://user:pass@localhost:5432/omniguard"; pnpm scan <path/to/package.json>

# 벤더/서드파티 스캔 (인증서 만료/누락 등 컴플라이언스 규칙)
pnpm scan:vendor <path/to/vendors.yaml>
pnpm scan:vendor <path/to/vendors.yaml> --json

# 클라우드/인프라 스캔 (Terraform plan JSON: terraform show -json plan.out > plan.json)
pnpm scan:iac <path/to/plan.json>

# 서비스 토폴로지 연결 (도메인 간) — 영속화된 자산 대상이라 DATABASE_URL 권장
$env:DATABASE_URL="postgres://..."; $env:TENANT_ID="<tenant>"; pnpm scan:service <path/to/services.yaml>

# 웹 노출 표면 스캔 (EASM/웹공급망: TLS·보안헤더·노출 JS(→OSV)·SRI)
pnpm scan:web https://example.com
```

## 영속화 (멀티테넌트)

`packages/storage`는 포트/어댑터 패턴이다. `Repository` 인터페이스 하나에
두 어댑터(`InMemoryRepository`, `PostgresRepository`)가 동일한 계약을 만족한다.

- **테넌트 격리**: 코드 레벨 필터 + Postgres **RLS**(`FORCE ROW LEVEL SECURITY`,
  세션 변수 `omniguard.tenant_id`) 이중 방어. 운영에서는 비-슈퍼유저 역할로 접속해야
  RLS가 강제된다(슈퍼유저는 RLS 우회).
- **멱등 upsert**: 자연키 기준(asset=purl, finding=assetId+sourceFindingId,
  score=findingId). 재스캔해도 중복 없이 `id`/`firstSeen`을 보존한다.
- **계약 테스트**: 동일 테스트를 두 어댑터에 적용. Postgres는 `DATABASE_URL`이 있을 때만 실행.

마이그레이션: `packages/storage/migrations/*.sql`(001 코어 · 002 인증 토큰 · 003 작업 큐 · 004 큐 재시도).
파일명 순으로 자동 적용되며, `applyMigrations`는 advisory lock으로 동시 실행을 직렬화한다(다중 인스턴스 부팅 안전).

## 영향도 전파 (Asset Graph)

`packages/graph`는 자산 관계(`AssetRelationship`)를 따라 리스크를 전파한다.
엣지 `from -[depends_on]-> to`는 "from이 to에 영향받음"을 의미하므로 리스크가
근원(to) → 영향받는 자산(from)으로 흐른다: `impact(x) = max(own(x), max impact(자식))`.

- npm 커넥터는 루트 애플리케이션 자산 + 각 의존성에 대한 `depends_on` 엣지를 생성한다.
- 자체 취약점이 없는 애플리케이션도 의존성의 리스크를 상속받아 영향도 우선순위에 노출된다.
- 순환 참조는 안전하게 차단된다. CLI(`pnpm scan`)는 점수 테이블 뒤에 "영향도 전파" 섹션을 출력한다.

## HTTP API (`apps/api`)

Fastify 기반. 토큰 → 주체(테넌트 + 역할) 해석으로 멀티테넌트 라우팅을 수행한다.

```bash
pnpm serve   # 기본 포트 3000. OMNIGUARD_TOKENS 미설정 시 개발용 "dev-token"(admin) 발급
```

- **인증**: `Authorization: Bearer <token>` → `AuthProvider`가 테넌트/역할 해석.
  - 토큰은 항상 `TokenStore`(`DbAuthProvider`)로 해석한다. 토큰 원문은 저장하지 않고
    **sha256 해시**만 보관한다. 시작 시 `OMNIGUARD_TOKENS`(JSON)를 저장소에 멱등 시딩.
  - `DATABASE_URL` 설정 시 Postgres(`api_token`), 미설정 시 인메모리 저장소(개발용 `dev-token`).
  - **OIDC(하이브리드)**: `OMNIGUARD_OIDC`(JSON) 설정 시 IdP 발급 JWT를 검증한다(`OidcAuthProvider`,
    리소스 서버 방식 — JWKS 서명 검증 + `iss`/`aud`/`exp`). `CompositeAuthProvider`가 OIDC(사람) →
    DB 토큰(M2M/CI) 순으로 폴백. 설정: `{ issuer, audience, jwksUri, tenantClaim?, roleClaim? }`
    (claim 기본값 `tenant_id`/`role`). IdP 무관 — claim 매핑만 env로 조정.
  - **토큰 발급/폐기 API**: admin이 런타임에 토큰을 발급·폐기한다(아래 라우트 표). 발급 시
    원문은 응답에 **1회만** 노출되고 저장은 해시만. 토큰은 발급자 본인 테넌트로만 범위가
    한정된다(`api_token`은 RLS 비대상 control-plane).
- **인가(RBAC)**: 읽기는 인증된 모든 역할, 쓰기(스캔)는 `admin`/`analyst`만.
- **일관 응답 포맷**: 성공 `{ ok: true, data }` / 실패 `{ ok: false, error: { code, message } }`
  (code=디버깅용, message=사용자용, 내부 오류는 비노출).
- **테넌트 격리**: 모든 조회/쓰기는 토큰의 테넌트로 스코프(+ Postgres RLS).

| 메서드 | 경로 | 권한 | 설명 |
|---|---|---|---|
| GET | `/health` | 공개 | 헬스 체크 |
| GET | `/v1/assets` `/findings` `/scores` `/relationships` | 인증 | 테넌트 데이터 조회 |
| GET | `/v1/impact` | 인증 | 그래프 영향도 전파 결과 |
| POST | `/v1/scans/vendor` | admin/analyst | 인벤토리 텍스트 스캔(비동기 접수) |
| POST | `/v1/scans/npm` | admin/analyst | package.json(+lockfile) 스캔·OSV 보강(비동기 접수) |
| POST | `/v1/scans/iac` | admin/analyst | Terraform plan JSON 스캔·미설정 평가(비동기 접수) |
| POST | `/v1/scans/service` | admin/analyst | 서비스 매니페스트 → 도메인 간 엣지 연결(비동기 접수) |
| GET | `/v1/jobs/:id` | 인증 | 스캔 작업 상태/결과 폴링(테넌트 범위) |
| POST | `/v1/tokens` | admin | 토큰 발급 — 원문 1회 노출, 저장은 해시만. 본문 `{ role, label? }` |
| GET | `/v1/tokens` | admin | 테넌트 토큰 목록(메타데이터만: `tokenHash`/`role`/`label`) |
| DELETE | `/v1/tokens/:tokenHash` | admin | 토큰 폐기(본인 테넌트 범위, 타 테넌트는 404) |

**스캔은 비동기**다. `POST /v1/scans/*`는 본문을 검증한 뒤 작업을 큐에 넣고 `202`로
`{ jobId, status: "queued" }`를 즉시 반환한다. 인프로세스 워커가 OSV 보강까지 처리하며,
클라이언트는 `GET /v1/jobs/:id`로 상태(`queued`/`running`/`succeeded`/`failed`)와 결과를 폴링한다.
`/v1/scans/npm` 본문: `{ packageJson: string, lockfile?: string, lockfileType?: "npm"|"pnpm" }`
(lockfile 제공 시 정확한 버전, 없으면 레인지 근사치).

## 대시보드 (`apps/web`)

Next.js App Router. 서버 컴포넌트가 API를 호출해 렌더한다(토큰은 서버 환경변수, 클라이언트 비노출).

**터미널 2개**로 띄운다(API를 먼저). 환경변수: `API_BASE_URL`(기본 `http://localhost:3000`), `API_TOKEN`(기본 `dev-token`).

bash(Linux/macOS/Git Bash):
```bash
pnpm serve                                                                    # 터미널 A — API :3000
PORT=3001 API_BASE_URL=http://127.0.0.1:3000 API_TOKEN=dev-token pnpm web:dev  # 터미널 B — 대시보드 :3001
```

PowerShell(Windows / VSCode 기본 터미널 — `PORT=.. pnpm`은 파싱 에러라 `$env:`로 설정):
```powershell
pnpm serve                              # 터미널 A — API :3000
# 터미널 B — 대시보드 :3001
$env:PORT="3001"; $env:API_BASE_URL="http://127.0.0.1:3000"; $env:API_TOKEN="dev-token"; pnpm web:dev
```
> `API_BASE_URL`은 `127.0.0.1`(IPv4)로 — `localhost`(::1)면 Next가 자기 자신을 호출한다.

- 페이지: 대시보드(요약+상위 발견/영향도), **서비스(교차 도메인 통합 리스크)**, 자산,
  발견(심각도순), 영향도(전파/근원), 스캔(서버 액션으로 화면에서 직접 npm/벤더 스캔 실행 → 성공 시 조회 페이지 재검증).
  스캔은 API에서 비동기지만, `ApiClient`가 작업 완료까지 서버측에서 폴링해 기존 동기형 UI를 그대로 유지한다.
- 서비스 뷰는 별도 API 없이 조회 3종(assets·relationships·impact)을 클라이언트에서 조합한다
  (`lib/services.ts`, 순수 함수 + 단위 테스트). 서비스마다 통합 영향도·리스크 근원과
  도메인별(소프트웨어/클라우드/벤더) 의존 자산을 영향도순으로 보여준다.
- API 클라이언트(`lib/api.ts`)·포맷 로직(`lib/format.ts`)은 프레임워크 무관 순수 함수로 분리해 단위 테스트.
- API 미가동 시 각 페이지가 에러 안내를 표시(접근성: `role="alert"`).

## 설계 원칙

- 정규화 스키마 하나로 세 도메인(SW 공급망/벤더/클라우드)을 흡수 → 파이프라인은 도메인 무관.
  세 도메인 모두 schema/scoring/graph/storage **변경 없이** 추가됨(입력 파싱 + 규칙만 신규) — 스키마 범용성 검증 완료.
  IaC는 `contains` 엣지(스택→리소스)로 그래프에 연결되어 스택이 리소스 리스크를 상속한다.
- **도메인 간 통합**: `service` 자산이 `depends_on`(→패키지)·`hosted_on`(→클라우드)·`provided_by`(→벤더)
  엣지로 세 도메인을 가로질러 연결된다. 서비스의 영향도 점수는 모든 도메인 리스크의 통합값 —
  OmniGuard의 최종 목적인 "한 서비스의 통합 리스크"가 그래프 전파로 자연히 계산된다.
- 점수는 **결정론적**이고 `scoringVersion`으로 버전 관리(재현성). AI는 점수 *해석*만 담당.
- 외부 입력(OSV 응답, package.json)은 zod로 런타임 검증.

## 버전 해석

`connector-npm`은 package.json 옆의 lockfile에서 정확한 설치 버전을 읽는다
(`package-lock.json`, `pnpm-lock.yaml` 지원). lockfile이 없으면 레인지 근사치로 폴백하며,
각 자산의 `tags.versionSource`(`lockfile` | `range`)에 출처를 기록한다.

## 알려진 한계 (다음 단계)

- `yarn.lock`은 미지원(현재 npm/pnpm lockfile만). 없으면 레인지 폴백.
- OSV CVSS 숫자 점수 파싱은 v3.0/v3.1만 지원. v2·v4는 미계산→GHSA 텍스트 심각도 라벨 폴백.
- 작업 큐는 자체 구현(인프로세스 워커 + 자체 클레임). 일시 실패 **지수 백오프 재시도**(기본 3회)와
  워커 크래시 시 **리스 기반 stuck 잡 회수**(기본 5분)는 지원. 데드레터(DLQ)·별도 워커 프로세스 분리는 미구현.
