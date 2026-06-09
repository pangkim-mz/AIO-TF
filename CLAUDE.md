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
pnpm test          # vitest, 네트워크 불필요(OSV 모킹). 현재 182 passed / 4 skipped(Postgres 계약 4건)
pnpm typecheck     # tsc --noEmit

# CLI 스캔
pnpm scan <package.json>              # SW 공급망(npm) — lockfile로 정확한 버전, --json 지원
pnpm scan:vendor <vendors.yaml>       # 벤더/서드파티 컴플라이언스
pnpm scan:iac <plan.json>             # Terraform plan JSON
pnpm scan:service <services.yaml>     # 도메인 간 엣지 연결(영속화된 자산 대상 → DATABASE_URL/TENANT_ID 권장)
pnpm scan:web <url>                   # 웹 노출 표면(EASM/웹공급망) — TLS·보안헤더·노출JS(→OSV)·SRI
pnpm scan:web <url> --active          # 능동 점검(소유권 검증 시 서브도메인 열거·시크릿·탈취 후보 추가)
pnpm scan:web <url> --token           # 소유권 검증용 DNS TXT 레코드 출력(스캔 안 함, TENANT_ID 고정 권장)

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
  `connector-web`(EASM/웹공급망)은 예외적으로 `schema`에 `web_asset` 리터럴(+storage `assetIdentifier` 1 case)을
  추가했다 — 유니온의 의도된 additive 확장점(기존 4타입 불변). `probe.ts`(네트워크 side-effect: 내장 `fetch`+`node:tls`),
  `fingerprint.ts`(순수: script src→purl), `analyzeSite`(순수: web_asset+노출JS 자산+depends_on+TLS/헤더/SRI findings).
  노출 JS는 `software_component`로 emit해 `enrichWithOsv`가 CVE를 자동 부여(취약점 로직 재사용). 테스트는 SiteProbe 픽스처 주입(네트워크 없음).
  **능동 점검(Phase 2)**은 `activeScanUrl`이 오케스트레이션하며 **도메인 소유권(DNS TXT) 검증 후에만** 추가된다(안전장치): `ownership.ts`(`ownershipToken` 순수 결정론 파생 + `verifyOwnership` DNS TXT),
  `secrets.ts`(순수 `scanSecrets` — 고유접두 시크릿 6종, 원문 마스킹), `subdomains.ts`(`enumerateSubdomains` — 워드리스트+**CT 로그(crt.sh `parseCrtShNames`)** 합집합 후보를 DNS 해석 → `web_asset`+`contains` 엣지 + `classifyTakeover` CNAME→SaaS 후보 + `takeoverProbe` 본문 미점유 지문으로 `confirmTakeover` 확증 시 CRITICAL). DNS/fetch 전부 주입 격리. 미검증이면 `activeSkipped:true`로 passive만. CLI `--active`/`--token`, **API `POST /v1/scans/web` `active:true`**(별도 job type 없이 `web` 잡에 플래그 — `runScanJob`이 `activeScanUrl`로 분기, `ScanSummary`에 `ownershipVerified`/`activeSkipped`/`expectedToken`, 워커 `activeScan` 주입점), **대시보드 `/scan` 능동 점검 체크박스**(미검증 시 ⚠ TXT 안내).
- `packages/enrich-osv` — OSV.dev 보강(타임아웃·재시도·동시성 제한). 테스트는 Enricher 주입으로 네트워크 분리.
  CVSS 점수는 `src/cvss.ts`(순수 함수)가 v3.0/v3.1 벡터를 Base Score(0–10)로 계산해 `Finding.cvss`를 채우고,
  점수가 있으면 정성 등급 구간으로 severity 정밀화(없으면 GHSA 텍스트 라벨 폴백). v2/v4 미지원→폴백.
- `apps/{cli,api,web}` — 오케스트레이션/노출 계층. 비즈니스 로직 두지 말 것.

스캔 비동기화: API는 `POST /v1/scans/*`에서 검증 후 작업을 큐에 넣고(202+jobId), 인프로세스
워커(`apps/api/src/worker.ts`)가 클레임해 처리한다. 스캔 실행 로직은 `apps/api/src/scans.ts`
(`runScanJob` 디스패처)에 모으고 server/worker가 공유한다. 큐는 `packages/storage`의 `JobQueue`
포트(InMemory·Postgres). Postgres는 `FOR UPDATE SKIP LOCKED`로 클레임, `job` 테이블은 워커가
전 테넌트를 처리하므로 **RLS 비대상**(getJob만 코드레벨 tenant 필터). FIFO 보장은 `seq`(bigserial).

큐 재시도/회수: 일시 실패는 영구 실패시키지 않고 **지수 백오프** 재시도한다. `Job.availableAt`
(이 시각 이후만 클레임)을 두고, 워커가 `attempts < maxAttempts`(기본 3)면 `retry(jobId, error, nextRetryAt)`
(base 1s·2^n)로 큐에 되돌린다. 워커 크래시로 `running`에 멈춘 잡은 `claimNext({leaseMs})`(기본 5분)가
`updatedAt` 리스 만료 기준으로 회수한다. `runScanJob`이 **멱등**이라 중복 실행이 안전한 게 회수의 전제.
시각 비교는 ISO 문자열 사전순(`now()`=`toISOString()`)으로 처리. 마이그레이션 `004_job_retry.sql`.

도메인 간 통합: `service` 자산이 `depends_on`(→패키지)·`hosted_on`(→클라우드)·`provided_by`(→벤더)
엣지로 세 도메인을 가로지른다. `buildTopology`가 기존 자산을 자연키로 조회해 연결 →
서비스 영향도가 모든 도메인 리스크의 통합 최악값이 된다(OmniGuard 최종 목적).

## 테넌트 격리 / 영속화

- 멀티테넌트: 코드 필터 + Postgres **RLS** 이중 방어. **운영은 비-슈퍼유저 역할로 접속해야**
  RLS가 강제됨(슈퍼유저 우회). 세션 변수 `omniguard.tenant_id`.
- 멱등 upsert(자연키: asset=purl, finding=assetId+sourceFindingId, score=findingId). 재스캔 중복 없음.
- 마이그레이션: `packages/storage/migrations/*.sql`(001 코어·002 토큰·003 작업큐·004 큐 재시도, 파일명 순 자동 적용).
  `applyMigrations`는 advisory lock(`pg_advisory_lock`)으로 동시 실행을 직렬화한다 — `CREATE TABLE IF NOT EXISTS`가
  동시 실행에 원자적이지 않아(다중 인스턴스 부팅·병렬 테스트) `pg_type` 유니크 충돌이 났던 것을 막는다.

## API 규약

- 인증: `Authorization: Bearer <token>` → `AuthProvider`가 테넌트/역할 해석(`apps/api/src/auth.ts`).
  토큰은 항상 `TokenStore` 기반 `DbAuthProvider`로 해석한다(`DATABASE_URL` 있으면 `PostgresTokenStore`,
  없으면 `InMemoryTokenStore`). 토큰 원문은 저장하지 않고 sha256 해시만, 시작 시 `OMNIGUARD_TOKENS` 멱등 시딩.
  토큰 영속화는 `packages/storage`의 `TokenStore` 포트(InMemory·Postgres).
  `api_token`은 인증이 테넌트 컨텍스트보다 먼저라 **RLS 비대상**(control-plane).
- 토큰 발급/폐기: admin 전용 `POST /v1/tokens`(발급, 원문 1회 노출 후 해시만 저장)·`GET /v1/tokens`(목록,
  메타데이터만)·`DELETE /v1/tokens/:tokenHash`(폐기). **tenantId는 본문이 아니라 발급자 principal에서** 가져와
  타 테넌트 토큰 발급/조회/폐기를 차단한다(control-plane이지만 코드레벨로 테넌트 격리). `buildServer`의
  `tokens?: TokenStore` deps가 있으면 라우트를 등록한다(index.ts가 양쪽 모드에서 주입).
- OIDC(하이브리드): `OMNIGUARD_OIDC`(JSON `{issuer,audience,jwksUri,tenantClaim?,roleClaim?}`) 설정 시
  `OidcAuthProvider`(jose, JWKS 서명 검증·`iss`/`aud`/`exp`)를 `CompositeAuthProvider`로 토큰 provider 앞에 합성
  (OIDC=사람 → DB 토큰=M2M 폴백). IdP 무관, claim 이름만 env 매핑(기본 `tenant_id`/`role`). 역할은 `isRole`로 좁힘.
- RBAC: 읽기=인증된 전 역할, 쓰기(스캔)=`admin`/`analyst`, 토큰 관리=`admin`만.
- 응답 포맷 고정(`apps/api/src/envelope.ts`): 성공 `{ok:true,data}` / 실패 `{ok:false,error:{code,message}}`.
  code=디버깅용, message=사용자용. 내부 오류 상세는 비노출.
- 스캔은 비동기: `POST /v1/scans/*` → 202 `{jobId,status}`, `GET /v1/jobs/:id`로 폴링. web `ApiClient`는
  완료까지 서버측 폴링해 기존 동기형 UI 유지(`apps/web/lib/api.ts`).
- 웹 능동 점검: `POST /v1/scans/web` 본문에 `active:true`(기본 false)를 주면 소유권(DNS TXT) 검증 후
  서브도메인 열거·시크릿 스캔을 더한다. 결과 `ScanSummary`에 `ownershipVerified`/`activeSkipped`/`expectedToken`을 싣는다
  (미검증이면 passive만 + 토큰 안내). 별도 job type가 아니라 `web` 잡의 플래그 — `runScanJob`이 `activeScanUrl`로 분기.

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
- **로컬 구동 env는 PowerShell 문법으로**: `PORT=3001 ... pnpm web:dev`(bash)는 PowerShell에서
  파싱 에러 → `$env:PORT="3001"; $env:API_BASE_URL="http://127.0.0.1:3000"; $env:API_TOKEN="dev-token"; pnpm web:dev`.
  API(:3000)와 대시보드(:3001)는 **별도 터미널 2개**로, API를 먼저 띄운다(구동 절차는 README·PROJECT_NOTES §6에 bash·PS 병기).

## 컨벤션

- Conventional Commits(`feat:`/`fix:`/`refactor:`…), 한 커밋 한 변경. 커밋 전 test/typecheck 통과 확인.
- 커밋 메시지/문서는 한국어. 식별자·코드는 영어.

## 다음 단계 (로드맵 [예정])

1. **큐 고도화**(선택) — 재시도/지수 백오프·리스 stuck 회수 완료. 남은 것: 데드레터(DLQ), 별도 워커 프로세스(`apps/worker`), 외부 큐.
2. **CVSS v2/v4 점수 지원**(선택) — v3.0/v3.1은 완료(`enrich-osv/src/cvss.ts`). v2·v4는 미지원→텍스트 폴백.
3. **connector-web 시크릿 JS 본문 수집**(선택) — 능동 점검(CLI·API·대시보드)·CT 로그 열거·takeover 확증 완료(#32·#33·#34). 남은 것: 시크릿 스캔이 링크된 외부 JS 본문도 수집(현재 페이지 HTML만). 착수: `connector-web/src/index.ts` `activeScanUrl` + `secrets.ts`.

완료: **connector-web MVP + API/웹 연결**(EASM/웹공급망, `packages/connector-web` + CLI `scan:web` +
`POST /v1/scans/web`(`JOB_TYPES`에 `web`, `runWebScan`, 워커 `scanWeb` 주입) + 대시보드 `/scan` 웹 섹션·랜딩 히어로
URL 입력창. web_asset 리터럴, TLS·보안헤더·노출JS(→OSV 재사용)·SRI),
**connector-web Phase 2 능동 점검**(`activeScanUrl` — 소유권(DNS TXT) 게이트 후 서브도메인 열거·시크릿 스캔·CNAME 탈취 후보.
`ownership.ts`·`secrets.ts`·`subdomains.ts`·`finding.ts`. CLI `--active`/`--token`. 네트워크 주입 격리, 코어 0줄)
**+ 능동 점검 API/웹 연결**(`web` 잡에 `active` 플래그, `runScanJob`→`activeScanUrl` 분기, `ScanSummary` 소유권 메타,
워커 `activeScan` 주입, `/scan` 능동 점검 체크박스 + 미검증 ⚠ 안내)
**+ 능동 점검 고도화**(서브도메인 CT 로그 열거 `parseCrtShNames`/crt.sh, takeover 본문 미점유 확증 `confirmTakeover`→CRITICAL 격상, `ctSource`/`takeoverProbe` 주입),
**대시보드 발견·영향도 펼침 상세**(`lib/findings.ts`·`lib/impact.ts` 순수 조립 + `findings-table.tsx`·`impact-table.tsx`
클라이언트 펼침. 발견=요약 바+설명·점수 분해·전파, 영향도=자체↔전파·근원·직접 발견. 새 API 0, 코어 0줄),
**OSV CVSS 숫자 점수 파싱**(`enrich-osv/src/cvss.ts`, v3.0/v3.1 Base Score, `Finding.cvss`·severity 정밀화, 코어 0줄),
CI 파이프라인(`.github/workflows/ci.yml`, GitHub 연결·가동·통과. Node 22 + pnpm 11 allowBuilds),
대시보드 서비스 뷰(`/services` + `lib/services.ts`),
**인증 DB 토큰화**(`TokenStore` 포트 + `DbAuthProvider`, sha256 해시, `002_api_token.sql`),
**OIDC 하이브리드**(`OidcAuthProvider` + `CompositeAuthProvider`, jose, `OMNIGUARD_OIDC`),
**스캔 비동기화**(`JobQueue` 포트 + `ScanWorker`, `003_job.sql`, `POST→202+jobId`/`GET /v1/jobs/:id`),
**큐 재시도/회수**(지수 백오프 재시도 + 리스 기반 stuck 회수, `Job.availableAt`·`retry`·`claimNext({leaseMs})`, `004_job_retry.sql`),
**토큰 발급/폐기 API**(admin 전용 `POST`/`GET`/`DELETE /v1/tokens`, `TokenStore.listByTenant` 추가,
발급자 테넌트 범위, 원문 1회 노출·해시만 저장).

### 알려진 한계

- `yarn.lock` 미지원(npm/pnpm lockfile만). 없으면 레인지 폴백.
- OSV CVSS 점수 파싱은 v3.0/v3.1만 지원. v2·v4는 미계산→GHSA 텍스트 심각도 라벨 폴백.
