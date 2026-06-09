# OmniGuard — 설계 노트 & 인수인계

이 문서는 **"왜 이렇게 만들었는가"** 와 **"다음 세션에서 어떻게 이어가는가"** 를 설명한다.
세 문서의 역할은 다음과 같이 나뉜다.

| 문서 | 독자 | 내용 |
|---|---|---|
| `README.md` | 사용자/개발자 | **무엇을·어떻게 쓰는가** (설치·명령어·API·페이지) |
| `CLAUDE.md` | AI 에이전트 | 간결한 **운영 지침** (명령어·아키텍처 불변식·환경 주의) |
| `docs/PROJECT_NOTES.md` (이 문서) | 다음 작업자(사람/AI) | **설계 근거(why) + 진행 경위 + 이어가기 가이드** |

---

## 1. 무엇을 만들고 있나

**OmniGuard** — AI 기반 인프라/공급망 리스크 통합 관제 SaaS(목표). 한 조직의
**소프트웨어 공급망·벤더/서드파티·클라우드(IaC)** 리스크를 하나의 모델로 흡수하고,
자산 간 관계를 그래프로 전파해 **"한 서비스의 통합 리스크"** 를 산출한다.

핵심 가치 가설: 리스크는 도메인별 사일로로 흩어져 있다. 이를 **하나의 정규화 모델 +
그래프**로 합치면, "이 서비스가 지금 얼마나 위험한가"를 도메인을 가로질러 답할 수 있다.

---

## 2. 핵심 설계 결정과 근거 (WHY)

### D1. 정규화 스키마 하나로 모든 도메인을 흡수
- **결정**: `Asset` / `Finding` / `RiskScore` / `AssetRelationship` 네 타입(zod)으로
  세 도메인을 모두 표현. 도메인 차이는 `Asset.attributes`의 discriminated union으로만 흡수.
- **근거**: 도메인마다 별도 파이프라인을 두면 점수·영속화·그래프가 N배로 늘고 일관성이 깨진다.
  모델을 하나로 두면 스캐너(커넥터)만 추가해도 점수·그래프·저장·API·UI가 **공짜로** 따라온다.
- **검증된 증거**: 벤더·IaC·서비스 3개 도메인을 추가하는 동안 `schema`/`scoring`/`graph`/`storage`
  **코드 변경 0줄**. 신규 코드는 전부 커넥터(입력 파싱 + 규칙)였다. → 스키마 범용성이 실측으로 입증됨.

### D2. 점수는 결정론적, AI는 "해석"만
- **결정**: 리스크 점수는 순수 함수로 계산하고 `scoringVersion`으로 버전을 박는다.
  AI/LLM은 점수 산정에 개입하지 않고, 산출된 점수를 *설명*하는 데만 쓴다(향후).
- **근거**: 상용 관제 제품에서 점수가 비결정적이면 재현·감사·회귀 테스트가 불가능하다.
  규제/감사 대응과 신뢰성을 위해 숫자는 결정론적이어야 한다. AI의 가치는 "왜 위험한가"의 서술에 있다.

### D3. 그래프 전파로 영향도와 서비스 통합 리스크를 계산
- **결정**: 자산을 노드, 관계를 엣지로 두고 `impact(x) = max(own(x), max impact(자식))` 전파.
  엣지 `from -[depends_on]-> to` 는 "from이 to에 영향받음"을 뜻해 리스크가 근원→영향받는 쪽으로 흐른다.
- **근거**: 취약점은 직접 가진 자산보다 *그것에 의존하는* 자산에서 문제가 된다.
  자체 취약점이 없는 앱/서비스도 의존성 리스크를 상속해야 우선순위가 맞다.
- **귀결**: `service` 자산이 `depends_on`(→패키지)·`hosted_on`(→클라우드)·`provided_by`(→벤더)
  엣지로 세 도메인을 가로지르면, 서비스의 영향도가 자연히 **모든 도메인 리스크의 통합 최악값**이 된다.
  이것이 제품의 최종 목적이고, 별도 "통합 로직" 없이 그래프 전파로 떨어진다.

### D4. 영속화는 포트/어댑터 + RLS 이중 격리
- **결정**: `Repository` 인터페이스 하나에 `InMemory`/`Postgres` 두 어댑터. 동일 계약 테스트를 양쪽에 적용.
  멀티테넌트 격리는 **코드 레벨 `where tenant_id` + Postgres RLS** 이중 방어.
- **근거**: 개발/테스트는 DB 없이 인메모리로 빠르게, 운영은 Postgres로. 인터페이스가 같으면 교체 비용 0.
  격리는 보안 핵심이라 한 겹(코드 필터)이 뚫려도 DB(RLS)가 막도록 이중화.
- **주의**: RLS는 비-슈퍼유저 역할에만 강제된다(슈퍼유저 우회). 운영은 앱 전용 역할로 접속해야 한다.

### D5. API는 일관 응답 포맷 + 토큰→테넌트→RBAC
- **결정**: 모든 응답을 `{ok:true,data}` / `{ok:false,error:{code,message}}` 로 통일.
  `Authorization: Bearer` 토큰 → 테넌트/역할 해석 → 읽기=전 역할, 쓰기=admin/analyst.
- **근거**: 클라이언트가 성공/실패를 한 가지 방식으로 다루게 하면 UI·SDK가 단순해진다.
  `code`(디버깅)와 `message`(사용자)를 분리해 내부 오류를 노출하지 않는다.

### D6. 대시보드 서비스 뷰는 "새 API 없이" 조회를 조합
- **결정**: `/services` 페이지는 백엔드에 전용 엔드포인트를 추가하지 않고,
  기존 조회 3종(`assets`·`relationships`·`impact`)을 `apps/web/lib/services.ts`(순수 함수)에서 조합.
- **근거**: 필요한 데이터가 이미 그래프 전파 결과(impact)와 관계(relationships)에 다 있다.
  새 엔드포인트는 중복 로직·추가 테스트·버전 관리 부담만 만든다. 조합 로직을 순수 함수로 빼면
  프레임워크 무관하게 단위 테스트가 가능하다(분류/집계/정렬/폴백 5건). → D1의 "모델이 좋으면 UI가 공짜" 재확인.

### D7. 수직 슬라이스로 키운다
- **결정**: 가로(레이어)로 다 만들지 않고, 세로(한 도메인의 입력→점수→저장→노출)로 얇게 관통한 뒤 확장.
- **근거**: 첫 슬라이스(npm→OSV→점수)에서 스키마/파이프라인의 타당성을 일찍 검증하고,
  이후 도메인은 검증된 뼈대 위에 커넥터만 얹어 리스크를 줄인다.

### D8. 인증 토큰은 control-plane 저장소에 해시로
- **결정**: 토큰을 `packages/storage`의 별도 포트 `TokenStore`(InMemory·Postgres)에 두고,
  `apps/api`의 `DbAuthProvider`가 sha256 해시로 조회한다. 토큰 원문은 어디에도 저장하지 않는다.
  토큰 테이블(`api_token`)은 테넌트 RLS를 적용하지 않는다.
- **근거**: 인증은 "어떤 테넌트인지"를 토큰으로 *알아내는* 단계라 테넌트 컨텍스트보다 먼저 일어난다.
  따라서 토큰 조회 자체는 테넌트 범위 밖(control-plane)이고, RLS를 걸면 조회가 막힌다. 데이터 평면
  테이블(asset/finding/…)의 RLS와는 역할이 다르다. 해시 저장은 DB 유출 시에도 토큰 원문 노출을 막는다.
- **귀결**: `AuthProvider` 인터페이스는 그대로 두고 구현체만 교체(`InMemory`↔`Db`). 코어
  (`schema`/`scoring`/`graph`) 변경 0줄.
- **확장(OIDC, 완료)**: 같은 `AuthProvider` 인터페이스에 `OidcAuthProvider`(jose, JWKS 서명 검증 +
  `iss`/`aud`/`exp`, claim→Principal 매핑)를 추가하고, `CompositeAuthProvider`로 [OIDC(사람) → DB 토큰(M2M)]
  순서로 합성한다. API는 토큰을 발급하지 않는 **리소스 서버**(IdP가 발급, 우리는 검증만)라 로그인 플로우가
  필요 없다. IdP는 미지정 — issuer/audience/jwksUri와 claim 이름을 `OMNIGUARD_OIDC`(env)로 받아 IdP 무관.
  인터페이스가 토큰 문자열만 받으므로 opaque/JWT 두 방식이 한 진입점에 자연히 공존(D8의 설계 이점 재확인).

### D9. 스캔은 비동기 — 자체 큐 포트 + 인프로세스 워커
- **결정**: `POST /v1/scans/*`는 입력을 검증한 뒤 작업을 큐에 넣고 `202 {jobId}`만 반환한다.
  `packages/storage`에 `JobQueue` 포트(InMemory·Postgres)를 두고, API 프로세스 안의 워커
  (`ScanWorker`)가 작업을 클레임해 OSV 보강까지 처리한다. 클라이언트는 `GET /v1/jobs/:id`로 폴링한다.
- **근거**: OSV 호출이 동기라 대용량·장시간 스캔이 요청을 막았다. 큐로 분리하면 요청은 즉시 반환되고
  처리량/지연을 워커가 흡수한다. 외부 큐(pg-boss/Redis) 대신 **자체 포트**를 택한 건 의존성 0 + 기존
  `Repository`/`TokenStore` 패턴과의 일관성, 이미 있는 Postgres 재사용 때문이다.
- **격리/정합성**: 워커는 전 테넌트의 작업을 가로질러 처리하므로 `job` 테이블은 **RLS 비대상**
  (control-plane). 테넌트 격리는 `getJob`의 코드 레벨 `tenant_id` 필터로 강제한다. 클레임은
  Postgres `FOR UPDATE SKIP LOCKED`(다중 워커 안전), FIFO는 `seq`(bigserial)로 보장
  (ULID는 동일 ms 내 단조증가가 보장되지 않음 — 계약 테스트로 드러난 함정).
- **코어/노출 영향**: `schema`/`scoring`/`graph` 0줄. 스캔 실행 로직은 `apps/api/src/scans.ts`
  (`runScanJob`)로 모아 server/worker가 공유. 대시보드는 `ApiClient`가 완료까지 서버측 폴링해
  기존 동기형 UI(액션·폼)를 **무수정**으로 유지(D6의 "모델/계층이 좋으면 UI가 공짜" 재확인).
- **확장(재시도·리스 회수, 완료)**: 일시 실패(예: OSV 장애)는 영구 실패시키지 않고 **지수 백오프**로
  재시도한다. `Job.availableAt`(이 시각 이후만 클레임 가능)을 추가하고, 워커는 `attempts < maxAttempts`면
  `retry(jobId, error, nextRetryAt)`로 큐에 되돌린다(기본 3회, base 1s·2^n). 워커 크래시로 `running`에
  멈춘 잡은 **리스 회수**로 복구한다: `claimNext({leaseMs})`가 `updatedAt`이 리스(기본 5분)보다 오래된
  `running` 잡도 회수 대상에 넣는다. `runScanJob`이 **멱등 upsert**라 중복 실행이 안전한 게 회수의 전제다.
  포트(`JobQueue`)에 `retry`/`ClaimOptions` 추가, 마이그레이션 `004_job_retry.sql`(available_at + 인덱스),
  양 어댑터 계약 테스트(재시도·백오프·회수) + 워커 단위 테스트(백오프 순수 함수·재시도 소진). 코어 0줄.

---

## 3. 시스템 구조

```
입력(커넥터) → 정규화(schema) → 보강(enrich-osv) → 점수(scoring) → 전파(graph) → 영속(storage)
                                                                            │
                                              CLI / HTTP API(Fastify) / 웹(Next.js) 가 노출

비동기 스캔:  API POST → JobQueue(enqueue, 202+jobId)
                              │
              ScanWorker(claim → runScanJob[위 파이프라인] → complete/fail) ── 인프로세스
                              │
              클라이언트 GET /v1/jobs/:id 로 상태/결과 폴링
```

| 레이어 | 패키지 | 비고 |
|---|---|---|
| 입력 | `connector-npm` `connector-vendor` `connector-iac` `connector-service` `connector-web` | 도메인 추가 = 여기만 (web은 schema에 `web_asset` 리터럴 1개 추가) |
| 모델 | `schema` | **건드리면 전 도메인 파급** — 신중히 |
| 보강 | `enrich-osv` | OSV.dev, 타임아웃·재시도·동시성 제한, 테스트는 주입으로 네트워크 분리 |
| 점수 | `scoring` | 결정론적, `scoringVersion` |
| 전파 | `graph` | 순환 안전, `impact=max(own,자식)` |
| 영속 | `storage` | 포트/어댑터(InMemory·Postgres). `Repository`(RLS), `TokenStore`/`JobQueue`(control-plane), 계약 테스트 |
| 큐/워커 | `storage`(`JobQueue`) + `apps/api`(`ScanWorker`·`scans.ts`) | 스캔 비동기 처리(D9). 실행 로직은 `runScanJob` 공유. 재시도/백오프(`availableAt`)·리스 회수(`claimNext({leaseMs})`) |
| 노출 | `apps/cli` `apps/api` `apps/web` | 비즈니스 로직 두지 않음. 스캔은 enqueue→폴링 |

데이터 흐름의 핵심은 **모든 도메인이 같은 강을 흐른다**는 점이다(D1). 새 도메인은 강에 지류를
추가할 뿐, 강 자체(점수·그래프·저장)는 바꾸지 않는다.

---

## 4. 개발 프로세스 / 규칙

- **새 도메인 추가**: 커넥터에 입력 파싱 + 규칙만 작성. 코어(`schema`/`scoring`/`graph`/`storage`)는
  변경하지 않는다. 이 불변식을 깨야 한다면 PR/커밋에 이유를 명시.
- **테스트**: 기능과 함께 작성. 순수 로직은 프레임워크 무관 함수로 빼서 단위 테스트(예: `lib/format`, `lib/services`, `lib/assets`).
  현재 **160 passed / 4 skipped**(Postgres 계약 4건은 `DATABASE_URL` 있을 때만).
- **커밋**: Conventional Commits, 한 커밋 한 변경, 커밋 전 `pnpm typecheck && pnpm test` 통과.
- **CI**(`.github/workflows/ci.yml`): push/PR(main)에서 build-test(typecheck·test·web:build) +
  postgres(실제 DB로 계약 테스트). **단, git remote 미연결 → GitHub 연결 후 첫 push에 실행됨.**

---

## 5. 지금까지의 여정 (커밋 = 단계)

1. `959b530` SW 공급망 수직 슬라이스 + 공통 정규화 스키마 — 뼈대 검증(D7).
2. `82fdd75` lockfile 기반 정확한 버전 해석(npm/pnpm).
3. `d17e7c3` 멀티테넌트 영속화(포트/어댑터 + Postgres RLS) — D4.
4. `073e768` 벤더 도메인 커넥터 — 코어 0줄 변경으로 흡수(D1 1차 증거).
5. `5c84990` Asset Graph 위험 전파 + 관계 영속화 — D3.
6. `a255e30` Fastify HTTP API(인증·테넌트·RBAC·일관 포맷) — D5.
7. `129bc07` npm 스캔 엔드포인트(콘텐츠 기반 커넥터).
8. `91a20dd` Next.js 대시보드(자산·발견·영향도).
9. `ab70eac` 대시보드 스캔 트리거 UI(서버 액션).
10. `63b45ef` IaC 도메인 — 코어 0줄(D1 2차 증거), `contains` 엣지로 그래프 확장.
11. `8901bef` 서비스 도메인 — 도메인 간 엣지로 통합 리스크(D3 귀결).
12. `189fb24` 문서 정리 + 프로젝트 CLAUDE.md.
13. `ebdbfb1` CI 파이프라인.
14. `92d9e3c` 대시보드 서비스 뷰 — 새 API 없이 조회 조합(D6).
15. `8c6f049` CI Node 20→22 — pnpm 11.5.0이 Node 22.13+ 요구(GitHub 연결 후 첫 실패 수정).
16. `f20e1dd` pnpm 11 `allowBuilds.esbuild: false` — `strictDepBuilds`로 인한 `ERR_PNPM_IGNORED_BUILDS` 해소. **CI 첫 통과.**
17. 인증 DB 토큰화 — `TokenStore` 포트(InMemory·Postgres) + `DbAuthProvider`(sha256 해시 조회) — D8.
18. OIDC 하이브리드 — `OidcAuthProvider`(jose, JWKS 검증) + `CompositeAuthProvider`(OIDC→토큰 폴백) — D8 확장.
19. 스캔 비동기화 — `JobQueue` 포트(InMemory·Postgres) + `ScanWorker`(인프로세스), `POST→202+jobId`/`GET /v1/jobs/:id` — D9.

> 위 17~19는 PR #1(`78683c2`)로 main 머지. 이후 머지 후 CI/로컬 검증에서 두 건을 고쳤다:
20. `e1f23b6` advisory lock으로 동시 마이그레이션 직렬화 — PR #1 머지 후 CI postgres job이 병렬 `CREATE TABLE IF NOT EXISTS` 충돌(`pg_type` 23505)로 실패한 것 수정. 운영 다중 인스턴스에도 동일 레이스라 실버그. 재현 테스트 추가. PR #2(`ac8a2f1`).
21. `5bf0d31` 대시보드 reads `no-store` — 로컬 구동 중 Next fetch 디스크 캐시(`.next/cache`)로 스캔 후에도 빈 화면이 남던 것 수정. 관제 대시보드는 항상 라이브. PR #3(`353e998`).
22. `6f8e840` 토큰 발급/폐기 API — admin 전용 `POST`/`GET`/`DELETE /v1/tokens`. `TokenStore`에 `listByTenant` 추가(InMemory·Postgres + 계약 테스트). tenantId를 발급자 principal에서 가져와 타 테넌트 토큰 발급/조회/폐기 차단. 발급 시 원문 1회 노출 후 sha256 해시만 저장. index.ts를 양쪽 모드 모두 `DbAuthProvider`+`TokenStore`로 통일(무DB 모드도 발급 가능) — D8 확장. PR #5(squash 머지, CI build-test·postgres green).
23. `3cda948` docs — PROJECT_NOTES에 토큰 발급 API(#5) 머지 결과 반영. PR #6.
24. `7ab4243` OSV CVSS 숫자 점수 파싱 — `enrich-osv/src/cvss.ts`(순수 함수)가 CVSS v3.0/v3.1 벡터를 명세 그대로 Base Score(0–10)로 계산. `Finding.cvss`를 채우고, 점수가 있으면 정성 등급 구간으로 severity를 정밀화(없으면 기존 GHSA 텍스트 라벨로 폴백). 의존성 0(공식 직접 구현), 코어(`schema`/`scoring`/`graph`/`storage`) 0줄 — `Finding.cvss` 필드는 원래 스키마에 있었음. 단위 테스트 12건 추가(123 passed). v2/v4는 미지원→텍스트 폴백(§7). PR #8(squash 머지).
25. `8b7250f` 큐 재시도·리스 회수 — 일시 실패를 지수 백오프로 재시도(`Job.availableAt`+`retry`, 기본 3회·base 1s·2^n), 워커 크래시로 멈춘 `running` 잡을 리스 만료(`claimNext({leaseMs})`, 기본 5분) 기준으로 회수. `runScanJob` 멱등이라 회수 중복 실행 안전. Postgres는 `FOR UPDATE SKIP LOCKED` 유지, 시각 비교는 ISO 문자열 사전순. 마이그레이션 `004_job_retry.sql`(available_at+인덱스). 양 어댑터 계약 + 워커 단위 테스트. 코어 0줄(129 passed) — D9 확장(§2). 데드레터·별도 워커 프로세스는 미구현(§7).
26. `6454cd1` connector-web MVP(EASM/웹공급망) — "URL 넣어 보안 점검" 신규 커넥터. `schema`에 `web_asset` 리터럴(url 자연키) 추가 + `storage/src/port.ts` `assetIdentifier`에 1 case = **코어 0줄 불변식의 의도된 예외**(D1, additive·하위호환). `packages/connector-web`: `probe.ts`(네트워크 side-effect — 내장 `fetch` 헤더·HTML + `node:tls` 인증서/프로토콜), `fingerprint.ts`(순수 — script src→{lib,version,purl}, jsDelivr/unpkg·cdnjs·파일명 임베드 3패턴), `analyzeSite`(순수 — web_asset 자산 + 노출JS `software_component` 자산 + `depends_on` 엣지 + TLS(미적용·만료·미신뢰·약한프로토콜)·헤더(HSTS·CSP·XFO·XCTO 누락)·SRI(서드파티 무결성 누락) findings), 오케스트레이터 `scanUrl`. CLI `scan:web <url>`이 `scanUrl→upsert→enrichWithOsv(노출JS→CVE 재사용)→finishRun`. 의존성 0(내장 모듈), 코어(`scoring`/`graph`) 0줄. 단위 테스트 14건(SiteProbe 픽스처 주입, 네트워크 없음 — **143 passed**). `example.com` 실연으로 보안헤더 4종 누락 탐지 확인. **API `POST /v1/scans/web`·워커·랜딩 히어로 입력 연결은 다음 슬라이스(§6).**
27. `f6dc8d1` connector-web API/웹 연결 — connector-web을 비동기 큐·대시보드에 연결(다음 슬라이스 완료). `JOB_TYPES`에 `"web"` 추가(`job.type`이 `text`라 Postgres 제약 영향 없음). `apps/api/src/scans.ts`에 `ScanWebBody{url}` + `runWebScan`(커넥터 findings를 영속화 id로 재매핑 + `enrich` 재사용 — CLI `web.ts` 미러) + 디스패처 `case "web"`. **네트워크(`scanUrl`)는 `enrich`처럼 주입 가능**하게 설계(`runScanJob` 4번째 인자 `scanWeb=scanUrl`, 워커 `WorkerDeps.scanWeb`) → 테스트가 네트워크 없이 stub 주입. `POST /v1/scans/web` 라우트. 웹: `ApiClient.scanWeb`·`performWebScan`(URL 검증)·`scanWebAction`·`WebScanForm`(compact) → `/scan` 웹 섹션 + **랜딩 히어로 URL 입력창**(`hero-scan`). `revalidate`에 `/services` 추가. 테스트 api 2건(end-to-end web 스캔·web_asset의 노출JS CVE 상속, 본문 누락 400) + scan 3건 = **148 passed**. 라이브 검증: `POST /v1/scans/web`(jsdelivr) → 자산 12·발견 22(노출JS→CVE·SRI·헤더). 코어(`scoring`/`graph`) 0줄.
28. `161b085` 스캔 성공 링크 /dashboard 수정 (PR #14) — `apps/web/app/scan/forms.tsx`의 `ScanResult` "대시보드 보기" 링크가 `href="/"`라 NordVPN 리디자인(대시보드 `/`→`/dashboard` 이동) 후 랜딩 홈으로 가던 것을 `/dashboard`로 수정. **교훈**: 리디자인으로 라우트가 이동하면 산재한 링크/`revalidatePath` 목록을 함께 갱신해야 한다(이 누락이 #30으로 재발).
29. `5053f19` 발견·영향도 테이블 행 펼침 상세 (PR #15) — 대시보드 상위 발견·영향도 + `/findings`·`/impact` 테이블 행을 클릭하면 펼쳐져 상세를 본다. 점수만 보던 테이블에 "왜 위험한가"·"어디서 왔나"·"어디까지 번지나"를 더한다. 순수 조립(`lib/findings.ts` `buildFindingDetails`, `lib/impact.ts` `buildImpactDetails`)이 발견·자산·점수·관계·영향도 조회를 행별 상세로 합치고, 클라이언트 컴포넌트(`findings-table.tsx`·`impact-table.tsx`)가 클릭 펼침(`useState`·`aria-expanded`)을 담당(D6 "모델이 좋으면 UI가 공짜" 재확인 — 새 API 0). 발견 패널: 강조 요약 바(심각도·CVE·CVSS·종합점수) + 카드(설명·위험 점수 분해 `factors` 막대·대상 자산·영향 전파). 영향도 패널: 자체↔전파 비교 막대·상속 해석 문장·전파 경로(나가는 의존)·직접 걸린 발견. 가시성은 헤드리스 캡처→진단→카드 분리 재설계로 끌어올림(평면 4열→요약 바+카드). 단위 테스트 7건(findings 4·impact 3). 코어 0줄.
30. 대시보드 캐시 무효화 fix (PR #16) — 스캔 후 대시보드 통계(자산·발견·Critical·최고 영향도·상속)가 안 바뀌던 문제. 원인은 `scan/actions.ts`의 `revalidateViews`가 `/`만 무효화하고 **`/dashboard`가 빠진 것**(#14와 같은 라우트 이동 누락). 서버 SSR·`force-dynamic`은 정상이라 F5 하면 최신이지만, 스캔 직후 소프트 내비게이션 시 클라이언트 라우터 캐시가 옛 통계를 노출. 무효화 목록을 데이터 페이지(`/dashboard`·`/assets`·`/findings`·`/impact`·`/services`)로 교정. 데이터·스캔 자체는 정상이었음(megazone.com·megazone.digital 자산 정상 영속).
31. `71265c4` 자산 탭 상세 보강 (main 직접 푸시) — `/assets`가 `이름·유형·식별자·중요도` 4열짜리 평면 테이블이라 부실했던 것을, #15(발견·영향도)와 **동일한 "순수 함수 + 펼침형 테이블" 패턴**으로 정보량·구성을 끌어올림. 새 순수 조립 `apps/web/lib/assets.ts`(`buildAssetDetails`)가 자산·발견·영향도·관계 조회를 자산별 상세로 합친다(영향도순 정렬, 심각도별 발견 개수, own↔impact·상속 근원, 도메인별 속성 펼침, 나가는/들어오는 엣지 수). 클라이언트 `apps/web/app/assets-table.tsx`가 클릭 펼침(`useState`·`aria-expanded`) — 패널 4카드: 개요(식별자·담당자·의존/피의존·최초/최근), 도메인별 속성(SW=에코시스템·버전·PURL·라이선스 / 벤더·클라우드·웹별 분기), 위험 요약(심각도 개수 + 전파 해석), 걸린 발견 목록. 페이지 상단에 안내 문단 + 통계 카드(전체/발견 보유/최고 영향도/유형별 분포) 추가. `ASSET_TYPE_LABEL`을 `lib/assets.ts`로 공용화(findings/impact 테이블의 로컬 상수와 중복은 범위상 미리팩터). 기존 CSS 토큰 재사용 + `.sev-counts`/`.fd-risk-note`/`.asset-tags` 3종 추가. 새 API 0, 코어 0줄. 단위 테스트 5건(`test/assets.test.ts`) → **160 passed / 4 skipped**.
32. connector-web Phase 2 — 능동 점검(소유권 게이트) — passive MVP(#26·#27)에 **능동 점검**을 추가하되, 타 도메인 무단 스캔을 막는 안전장치로 **도메인 소유권(DNS TXT) 검증**을 게이트로 둔다. 신규 모듈 4종(전부 `packages/connector-web`, 네트워크는 주입 격리): `ownership.ts`(`ownershipToken` 순수 — (테넌트,호스트) sha256 결정론적 파생, 저장 불필요·재생성 가능 / `verifyOwnership` — `node:dns` TXT 조회로 토큰 일치 확인, 청크 분할 합침), `secrets.ts`(순수 `scanSecrets` — AWS키·GCP키·GitHub토큰·Slack·Stripe·개인키블록 6종 고유접두 패턴, 원문 마스킹(`AKIA…`)·중복 제거), `subdomains.ts`(`enumerateSubdomains` — 흔한 라벨 23종 능동 DNS 열거, 발견 서브도메인→`web_asset`+부모 `contains` 엣지(리스크 상속) / 순수 `classifyTakeover` — CNAME이 SaaS 지문(S3·GitHub Pages·Heroku·Azure·Netlify 등 9종)이면 dangling=HIGH·live=MEDIUM 탈취 후보). 오케스트레이터 `activeScanUrl`: 소유권 검증되면 passive + 시크릿 + 서브도메인, **미검증이면 `activeSkipped:true`로 능동 점검 생략(passive만)**. `makeFinding`/`makeWebAsset`을 `finding.ts`로 추출해 index/subdomains 공유. CLI `scan:web` 확장: `--active`(능동, 소유권 미검증 시 추가할 TXT 안내), `--token`(스캔 없이 DNS TXT 레코드만 출력), `TENANT_ID` env(토큰 재현용). 의존성 0(`node:crypto`/`node:dns` 내장), 코어(`schema`/`scoring`/`graph`/`storage`) 0줄. 단위 테스트 13건(소유권 토큰/검증·시크릿·탈취 분류·서브도메인 열거·능동 게이트) → **173 passed / 4 skipped**. `--token` 실연 확인(결정론적 TXT 출력). **API `POST /v1/scans/web?active`·워커·대시보드 연결은 다음 슬라이스**(#26→#27 분리 패턴). 라이브 네트워크 점검은 사내 MITM 프록시(`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`)로 이 환경에선 미실연 — 주입 테스트로 검증.
33. connector-web Phase 2 능동 점검 API/웹 연결 — #32(커넥터·CLI)를 비동기 큐·대시보드에 연결(#26→#27 분리 패턴 반복). **별도 job type 없이** 기존 `web` 잡에 `active` 플래그를 추가: `ScanWebBody`에 `active: z.boolean().default(false)`, `runScanJob`이 `active`면 주입된 `activeScan`(기본 `activeScanUrl`)으로, 아니면 기존 `scanWeb`(passive)으로 분기. 능동 결과의 소유권 메타를 `ScanSummary`에 실어 노출: `ownershipVerified`·`activeSkipped`·`expectedToken`(옵셔널 필드라 passive·타 도메인 스캔에 영향 0). 워커 `WorkerDeps.activeScan` 주입점 추가(테스트가 네트워크 없이 stub). API tenantId는 발급자 principal이라 **소유권 토큰이 안정적**(CLI의 임시 tenant 한계 해소). 웹: `ApiClient.scanWeb(url, active)`, `performWebScan(client, url, active)`(미검증 시 `activeSkipped`+`expectedToken`을 안내 메시지로), `scanWebAction`이 `active` 체크박스 읽기, `/scan` `WebScanForm`에 능동 점검 체크박스(compact 랜딩 히어로는 passive 유지), `ScanResult`에 ⚠ 안내 줄. CSS `.notice-note`·`.checkbox-field` 2종. 코어 0줄, 의존성 0. 테스트 +3(API e2e 능동 검증/미검증 2건 — `ActiveWebScanner` stub 주입, 웹 active 1건) → **176 passed / 4 skipped**, `pnpm web:build` 타입 통과. 라이브 네트워크는 동일 MITM 프록시 제약으로 미실연 — 주입 테스트로 검증.
34. connector-web 능동 점검 고도화 — 서브도메인 탈취 탐지 강화 — `subdomains.ts`의 두 약점(워드리스트 23종 한정·CNAME 휴리스틱)을 보강. **① CT 로그 전수 열거**: `parseCrtShNames`(순수 — crt.sh JSON `name_value`에서 루트의 서브도메인만 추출, 와일드카드 `*.` 제거·apex 제외·중복 제거) + `defaultCtSource`(crt.sh fetch, 실패는 빈 결과로 흡수). 후보 = 워드리스트(앞) + CT 합집합, 상한 100(과도한 DNS 팬아웃 방지, 워드리스트 우선 보존). **② 실제 takeover 점유 확인**: `TAKEOVER_FINGERPRINTS`에 서비스별 미점유 본문 마커 추가(S3 `NoSuchBucket`, GitHub Pages·Heroku·Azure·CloudFront·Fastly·Netlify·Shopify·Zendesk 9종), 순수 `confirmTakeover(service, body)`가 마커 포함 여부 판정. 탈취 후보를 `takeoverProbe`(기본 HTTPS fetch)로 본문 받아 확증되면 **CRITICAL로 격상**(미확증은 기존 dangling=HIGH·live=MEDIUM 휴리스틱 유지), finding 제목/`raw.confirmed` 반영. 네트워크 3종(DNS·CT·프로브) 전부 주입 격리 — 기존 테스트도 `ctSource: noCt`·`takeoverProbe`로 네트워크 차단(누출 시 실네트워크 호출 위험을 막음). `activeScanUrl`/`ActiveScanOptions`에 `ctSource`·`takeoverProbe` 통과. 의존성 0(`AbortSignal.timeout` 내장), 코어 0줄. 단위 테스트 +4(parseCrtShNames 2·confirmTakeover 1·CT 합류+확증 격상 1) → **180 passed / 4 skipped**. 시크릿 JS 본문 수집은 별개 테마(secrets.ts)라 다음 슬라이스. 라이브는 MITM 프록시로 미실연.

---

## 6. 다음 세션 시작 가이드

**0) 읽기 순서**: 이 문서 → `CLAUDE.md`(운영 지침) → `README.md`(사용법). 그리고 자동 메모리에
`omniguard-project`가 최신 진행 상황을 담고 있다.

**1) 환경 확인** (코드를 바꾸기 전에 현재 상태가 green인지):
```bash
cd C:\Users\MZ01-PANGKIM\Desktop\AIO-TF
node -v                         # v22.13+ 필요(pnpm 11.5.0 요구)
pnpm install
pnpm typecheck && pnpm test     # 155 passed / 4 skipped 기대
git log --oneline -6            # HEAD가 7ab4243(OSV CVSS 파싱 PR #8)인지
```
> vitest가 Windows Temp 캐시로 가끔 `UNKNOWN` 오류(flaky) → **재실행하면 정상**.
> 현재 로컬 브랜치는 `main`만 있고 origin/main과 동기 상태(이전 작업 브랜치는 머지 후 삭제됨).

**2) 직접 돌려보기**(선택, 로컬에서 실증 완료된 흐름):

**포트 분리 필수**: API와 Next 둘 다 기본 3000이라 충돌한다. **터미널 2개**로 띄운다(VSCode면
`Ctrl+\`` → 패널 `+`로 하나 더). API를 먼저 켜야 대시보드가 데이터를 불러온다.

bash(Linux/macOS/Git Bash):
```bash
# 터미널 A — API :3000 (dev-token/admin)
pnpm serve
# 터미널 B — 대시보드 :3001
PORT=3001 API_BASE_URL=http://127.0.0.1:3000 API_TOKEN=dev-token pnpm web:dev
```

PowerShell(Windows / VSCode 기본 터미널 — `PORT=.. pnpm`은 PowerShell에서 파싱 에러라 `$env:`로 설정):
```powershell
# 터미널 A — API :3000
cd C:\Users\MZ01-PANGKIM\Desktop\AIO-TF
pnpm serve
# 터미널 B — 대시보드 :3001
cd C:\Users\MZ01-PANGKIM\Desktop\AIO-TF
$env:PORT="3001"
$env:API_BASE_URL="http://127.0.0.1:3000"
$env:API_TOKEN="dev-token"
pnpm web:dev
```
```text
# → http://localhost:3001/scan 에서 npm 폼에 {"name":"a","version":"1.0.0","dependencies":{"lodash":"4.17.4"}}
#   넣고 실행하면 비동기 큐→OSV→점수→영속 후 /findings·/impact에 실제 취약점이 라이브로 뜬다.
# 주의: API_BASE_URL은 127.0.0.1(IPv4)로 — localhost(::1)면 Next가 자기 자신을 호출한다.
# 무DB(인메모리)라 재시작 시 데이터 소멸. 종료는 각 터미널 Ctrl+C(또는 :3000/:3001 프로세스 kill).
```

**[최근 세션 메모, 2026-06-04]** 진행 보고용 자료를 별도로 제작했다(**레포 코드 변경 0줄**).
라이브로 API(:3000)+대시보드(:3001)를 구동하고 4개 도메인을 스캔(자산 15·발견 41·통합 영향도 82,
**OSV 실연동** — lodash 4.17.4의 실제 GHSA 권고가 그래프 전파로 서비스까지 상속됨을 실증)한 뒤,
단일 HTML 보고서 + pptx(12슬라이드)를 생성했다. 산출물은 보고용이라 레포 외부에 둔다(빌드 산출물 불커밋
원칙). 데모 시딩→스크린샷→보고서 빌드 절차는 재현 가능. 코드 진행(큐/CVSS)은 아래 후보 그대로.

**[세션 메모, 2026-06-04 #2]** 자체 제작 데모 사이트(풋살 대관 `pitch-booking`, Next.js 15)를 OmniGuard로
검증했다(**레포 코드 변경 0줄**). API 인메모리에 실제 `package.json`+`package-lock.json`을 `POST /v1/scans/npm`으로
스캔(의존성 38·발견 20). **실제 GHSA 권고를 탐지**: Critical 1(next 미들웨어 인증 우회 CVE-2025-29927)·High 6·
Medium 10·Low 3, 전부 `next@15.1.11`에 집중. 루트 앱이 자체 취약점(own=0)이 없어도 의존성 리스크 82를 그래프
전파로 상속함을 실증 → "외부 의존 위험이 서비스로 전파"되는 핵심 가치를 외부 코드베이스로 검증(커넥터·코어 무수정).
데모 데이터 교체는 **API 재시작=인메모리 초기화** 후 대상만 재스캔하면 된다(같은 dev-token 테넌트). 진행보고서는 AIO TF
정기보고 양식으로 제작(`~/Downloads/aio-item-report-omniguard.html`) — 대시보드 캡처를 **base64 인라인**해 단일 HTML로
자족 공유(슬랙은 파일 업로드/PDF 권장). 보고 산출물·캡처·시딩 스크립트는 레포 외부(불커밋). 코드 진행은 아래 후보 그대로.

**[세션 메모, 2026-06-05] 대시보드 NordVPN 디자인 + connector-web 설계 확정(미착수)**

이 세션은 두 갈래였다. 둘 다 인수인계 메모로 남긴다.

**(a) 대시보드 디자인 — 완료, 브랜치 `feat/web-nordvpn-design`(커밋 `26369ca`, 미푸시).**
`designlang`(npm 패키지, `apps/web`에 설치됨)으로 NordVPN link-checker에서 디자인 토큰을 추출(시스템
Chrome 사용해야 봇차단 우회 — 번들 Chromium은 빈 페이지)해 `apps/web`에 적용했다. 변경: `app/globals.css`
(토큰 레이어 + NordVPN 라이트 테마 + 랜딩 스타일), `app/layout.tsx`(next/font로 Inter·Noto Sans KR
self-host), **랜딩 홈 신규**(`app/page.tsx` = 히어로→기능카드→동작방식→CTA→푸터), 기존 대시보드는
`app/dashboard/page.tsx`로 이동, nav 갱신, `.gitignore`에 `design-extract-output*/` 추가(추출 산출물은
`apps/web/design-extract-output-v3/`에 참고용으로 남아있음, 불커밋). **히어로의 CTA/입력 자리**는 아래
connector-web 풀슬라이스에서 "URL 보안 점검" 폼으로 실제 연결될 곳이다.

**(b) connector-web (EASM + 웹 공급망) — 설계·결정 확정, 코드 미착수.** "타 도메인 URL을 넣어 보안 점검"
기능을 신규 커넥터로 추가하기로 함. 상용성(EASM 성장 시장 + 웹 공급망은 PCI DSS 4.0 규제 강제) + 고위험
탐지(서브도메인 탈취·시크릿 노출·Magecart·노출 CVE)를 노리되, 핵심 차별점은 **웹 위험을 기존 그래프로
서비스 통합 리스크에 전파**하는 것. 확정된 결정:

- **모델링**: `Asset` 유니온에 `web_asset` 리터럴 추가(자연키 = origin URL). 이건 `schema` +1줄,
  `storage/src/port.ts`의 `assetIdentifier` switch +1 case. → **코어 0줄 불변식의 의도된 예외**(D1).
  유니온의 확장점이고 하위호환 additive(기존 4타입 불변)라 안전. exhaustive switch라 컴파일러가 케이스 강제.
- **MVP 점검 4종**: ① TLS/인증서(미적용·만료·약한 프로토콜) ② 보안헤더 누락(HSTS·CSP·X-Frame-Options·
  X-Content-Type-Options) ③ **노출 JS 라이브러리 → `software_component` 자산 emit → 기존
  `enrichWithOsv`가 CVE/CVSS 자동 부여**(취약점 로직 0줄 재사용) ④ SRI 누락/서드파티 스크립트 인벤토리.
- **Finding 카테고리는 스키마 변경 0**: TLS·헤더=`misconfiguration`, 노출JS=`vulnerability`,
  SRI/서드파티/시크릿=`integrity`. 기존 `FindingCategory` enum이 그대로 수용.
- **이번 슬라이스 범위**: `packages/connector-web` + `apps/cli` `scan:web` + vitest. (API
  `POST /v1/scans/web`·워커·랜딩 히어로 입력창 연결은 **다음 슬라이스**.)
- **안전장치**: passive 위주(브라우저 동급 HTTP/TLS 핸드셰이크). 능동 포트스캔·서브도메인 열거·시크릿
  스캔은 Phase 2 + 도메인 소유권 검증(DNS TXT 토큰) 도입 시.
- **의존성**: HTTP는 Node 22 내장 `fetch`, TLS는 `node:tls` — 새 의존성 0(의존성 최소 원칙).

**착수 To-Do (파일 단위, 순서대로):**
1. `packages/schema/src/index.ts`: `WebAssetAttrs = z.object({ type: z.literal("web_asset"),
   url: z.string(), hostname: z.string() })` 추가 → `AssetAttributes` 유니온에 등록.
2. `packages/storage/src/port.ts`: `assetIdentifier`에 `case "web_asset": return asset.attributes.url;`.
3. `packages/connector-web/`(신규): `package.json`(`@omniguard/connector-web`, deps `@omniguard/schema`·
   `zod`, `type:module`, `exports: ./src/index.ts`) / `src/probe.ts`(네트워크 side-effect:
   `fetchSiteProbe(url)`=내장 fetch 헤더·HTML + `node:tls` 인증서) / `src/fingerprint.ts`(순수: script
   src→{lib,version,purl}) / `src/index.ts`(순수 `analyzeSite(probe,tenantId)` = web_asset 자산 +
   노출JS software_component 자산 + `web_asset -depends_on-> JS` 엣지 + TLS·헤더 findings; 오케스트레이터
   `scanUrl(url,tenantId)`) / `test/connector-web.test.ts`(SiteProbe 픽스처 주입, 네트워크 없음 —
   `enrich-osv` 테스트 패턴 그대로).
4. `apps/cli/src/web.ts`: `scan:web` 오케스트레이터 — `scanUrl`→`upsertAssets`→`enrichWithOsv(assets)`
   (노출JS→CVE)→`finishRun`. `apps/cli/src/index.ts`(npm) 미러. 단일 URL 인자.
5. `apps/cli/package.json`에 `@omniguard/connector-web: workspace:*`, 루트 `package.json` scripts에
   `"scan:web": "tsx apps/cli/src/web.ts"`.
6. (다음 슬라이스) `apps/api/src/scans.ts` `runScanJob` 디스패처에 web 케이스 + `POST /v1/scans/web` +
   랜딩 히어로 입력창 연결.

**검증**: `pnpm typecheck && pnpm test`, `pnpm scan:web https://example.com` 수동 실연.
**주의**: `enrichWithOsv`는 `software_component`(purl)만 조회 → `web_asset` 자체는 OSV 대상 아님(설계대로).

**3) 다음 작업 후보** (로드맵 [예정], 우선순위 의견 포함):

| 작업 | 왜/착수 지점 | 난이도 |
|---|---|---|
| **큐 고도화(선택)** | 재시도/지수 백오프·리스 기반 stuck 회수 **완료**(D9 확장). 남은 것: 데드레터(DLQ), 별도 워커 프로세스 분리(`apps/worker`), 또는 외부 큐. 착수 지점: `ScanWorker`/`JobQueue` 포트. | 중간 |
| ~~connector-web Phase 2 — 능동 점검 API/웹 연결~~ | **완료**(#33). `web` 잡에 `active` 플래그 + `runScanJob`이 `activeScanUrl`로 분기, `ScanSummary`에 `ownershipVerified`/`activeSkipped`/`expectedToken`, 워커 `activeScan` 주입점, 웹 `/scan` 능동 점검 체크박스 + 미검증 안내. 코어 0줄. | — |
| ~~대시보드 발견·영향도 펼침 상세~~ | **완료**(#29). 테이블 행 클릭 시 펼침 — 발견(설명·위험 점수 분해·전파)·영향도(자체↔전파·근원·직접 발견). `lib/findings.ts`·`lib/impact.ts` 순수 조립 + `*-table.tsx` 클라이언트. 코어 0줄. | — |
| ~~connector-web API/웹 연결~~ | **완료**(#27). `POST /v1/scans/web`(`JOB_TYPES`+`runWebScan`+워커 `scanWeb` 주입) + `/scan` 웹 섹션 + 랜딩 히어로 URL 입력창. 라이브 검증 완료. | — |
| ~~connector-web (EASM+웹공급망) MVP~~ | **완료**(#26). `packages/connector-web`(probe·fingerprint·analyzeSite) + CLI `scan:web`, web_asset 리터럴, TLS·헤더·노출JS(→OSV 재사용)·SRI 4종, 단위 테스트 14건. 의존성 0, 코어 0줄. | — |
| **CVSS v2/v4 점수 지원(선택)** | v3.0/v3.1은 완료(아래). v2(폐형식)·v4(MacroVector 룩업)는 미지원→텍스트 폴백. 착수 지점: `enrich-osv/src/cvss.ts`. | 중간 |
| ~~OSV CVSS 숫자 점수 파싱~~ | **완료**. `enrich-osv/src/cvss.ts`가 CVSS v3.0/v3.1 벡터→Base Score(0–10) 계산, `Finding.cvss` 채움·severity 정밀화(텍스트 폴백). 코어 0줄, 의존성 0. | — |
| ~~토큰 발급/폐기 API~~ | **완료**. admin 전용 `POST`/`GET`/`DELETE /v1/tokens`, `TokenStore.listByTenant` 추가, 발급자 테넌트 범위, 원문 1회 노출·해시만 저장 — D8 확장. | — |
| ~~스캔 비동기화(큐)~~ | **완료**. `JobQueue` 포트(InMemory·Postgres) + `ScanWorker`, `003_job.sql`, `POST→202+jobId`/`GET /v1/jobs/:id` — D9. | — |
| ~~인증 DB 토큰화 + OIDC~~ | **완료**. `TokenStore`+`DbAuthProvider`(sha256, `002_api_token.sql`), `OidcAuthProvider`+`CompositeAuthProvider`(jose, `OMNIGUARD_OIDC`). | — |
| ~~GitHub 연결 + CI 가동~~ | **완료**(2026-06-02). remote `pangkim-mz/AIO-TF` 연결, push 트리거로 CI 가동. Node 22·pnpm 11 호환 수정 후 첫 통과(`f20e1dd`). | — |

**권장 순서**: ~~GitHub 연결~~ → ~~인증 DB·OIDC~~ → ~~큐~~ → ~~토큰 발급 API~~ → ~~OSV CVSS 파싱~~ → ~~큐 재시도·회수~~ → ~~connector-web MVP~~(#26) → ~~connector-web API/웹 연결~~(#27) → ~~Phase 2 능동 점검~~(#32) → ~~Phase 2 API/웹 연결~~(#33) → ~~능동 점검 고도화: CT 로그·takeover 확증~~(#34) → **시크릿 JS 본문 수집 / 데드레터·별도 워커 / CVSS v2·v4(모두 선택)**.

**4) 작업 규칙**: §4를 따른다. 새 도메인/기능이라면 코어 0줄 원칙을 먼저 점검하고,
순수 로직은 `lib`/패키지로 분리해 단위 테스트. 끝나면 README·CLAUDE.md·이 문서·메모리를 갱신.

---

## 7. 알려진 한계

- `yarn.lock` 미지원(npm/pnpm lockfile만). 없으면 의존성 레인지 근사치로 폴백.
- OSV CVSS 점수 파싱은 **v3.0/v3.1만** 지원(`enrich-osv/src/cvss.ts`). v2(구형식)·v4(MacroVector 룩업)는 미계산 → GHSA 텍스트 심각도 라벨로 폴백.
- 작업 큐는 자체 구현(인프로세스 워커). 재시도/지수 백오프·리스 기반 stuck 회수는 완료. **데드레터(DLQ)·별도 워커 프로세스 분리는 미구현**. 리스 회수는 heartbeat가 없어 리스(기본 5분)보다 오래 걸리는 잡은 중복 실행될 수 있다(멱등 upsert라 데이터는 안전).
- 토큰 발급/폐기 API는 admin 전용. 토큰은 발급자 본인 테넌트로만 범위가 한정된다(타 테넌트 토큰 관리 불가 — 의도된 격리).
- connector-web(EASM) 능동 점검(#32·#33, Phase 2)은 CLI(`scan:web --active`)·API(`POST /v1/scans/web` `active:true`)·대시보드(`/scan` 능동 점검 체크박스) 모두 연결됐다. 능동 점검은 **도메인 소유권(DNS TXT) 검증 통과 시에만** 실행된다 — 미검증이면 passive만(`activeSkipped`+`expectedToken` 안내). 서브도메인 열거는 워드리스트 23종 + **CT 로그(crt.sh)** 합집합이되 후보 상한 100(초과분 절단·재귀 열거 미구현). 탈취 후보는 CNAME→SaaS 지문 9종이고, **본문 미점유 지문으로 확증되면 CRITICAL**·미확증은 휴리스틱(dangling=HIGH·live=MEDIUM) — 확증은 9종 마커에 한정. 시크릿 스캔은 페이지 HTML 본문만 대상(링크된 JS 본문 미수집 — 다음 슬라이스)이고 고유접두 6종 패턴만(범용 토큰·엔트로피 기반 미탐지). 노출 JS 핑거프린트는 CDN/파일명 패턴 3종만 인식.
