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
| 입력 | `connector-npm` `connector-vendor` `connector-iac` `connector-service` | 도메인 추가 = 여기만 |
| 모델 | `schema` | **건드리면 전 도메인 파급** — 신중히 |
| 보강 | `enrich-osv` | OSV.dev, 타임아웃·재시도·동시성 제한, 테스트는 주입으로 네트워크 분리 |
| 점수 | `scoring` | 결정론적, `scoringVersion` |
| 전파 | `graph` | 순환 안전, `impact=max(own,자식)` |
| 영속 | `storage` | 포트/어댑터(InMemory·Postgres). `Repository`(RLS), `TokenStore`/`JobQueue`(control-plane), 계약 테스트 |
| 큐/워커 | `storage`(`JobQueue`) + `apps/api`(`ScanWorker`·`scans.ts`) | 스캔 비동기 처리(D9). 실행 로직은 `runScanJob` 공유 |
| 노출 | `apps/cli` `apps/api` `apps/web` | 비즈니스 로직 두지 않음. 스캔은 enqueue→폴링 |

데이터 흐름의 핵심은 **모든 도메인이 같은 강을 흐른다**는 점이다(D1). 새 도메인은 강에 지류를
추가할 뿐, 강 자체(점수·그래프·저장)는 바꾸지 않는다.

---

## 4. 개발 프로세스 / 규칙

- **새 도메인 추가**: 커넥터에 입력 파싱 + 규칙만 작성. 코어(`schema`/`scoring`/`graph`/`storage`)는
  변경하지 않는다. 이 불변식을 깨야 한다면 PR/커밋에 이유를 명시.
- **테스트**: 기능과 함께 작성. 순수 로직은 프레임워크 무관 함수로 빼서 단위 테스트(예: `lib/format`, `lib/services`).
  현재 **123 passed / 4 skipped**(Postgres 계약 4건은 `DATABASE_URL` 있을 때만).
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

---

## 6. 다음 세션 시작 가이드

**0) 읽기 순서**: 이 문서 → `CLAUDE.md`(운영 지침) → `README.md`(사용법). 그리고 자동 메모리에
`omniguard-project`가 최신 진행 상황을 담고 있다.

**1) 환경 확인** (코드를 바꾸기 전에 현재 상태가 green인지):
```bash
cd C:\Users\MZ01-PANGKIM\Desktop\AIO-TF
node -v                         # v22.13+ 필요(pnpm 11.5.0 요구)
pnpm install
pnpm typecheck && pnpm test     # 123 passed / 4 skipped 기대
git log --oneline -6            # HEAD가 7ab4243(OSV CVSS 파싱 PR #8)인지
```
> vitest가 Windows Temp 캐시로 가끔 `UNKNOWN` 오류(flaky) → **재실행하면 정상**.
> 현재 로컬 브랜치는 `main`만 있고 origin/main과 동기 상태(이전 작업 브랜치는 머지 후 삭제됨).

**2) 직접 돌려보기**(선택, 로컬에서 실증 완료된 흐름):
```bash
# 포트 분리 필수: API와 Next 둘 다 기본 3000이라 충돌한다.
pnpm serve                                                   # API :3000 (dev-token/admin)
PORT=3001 API_BASE_URL=http://127.0.0.1:3000 API_TOKEN=dev-token pnpm web:dev  # 대시보드 :3001
# → http://localhost:3001/scan 에서 npm 폼에 {"name":"a","version":"1.0.0","dependencies":{"lodash":"4.17.4"}}
#   넣고 실행하면 비동기 큐→OSV→점수→영속 후 /findings·/impact에 실제 취약점이 라이브로 뜬다.
# 주의: API_BASE_URL은 127.0.0.1(IPv4)로 — localhost(::1)면 Next가 자기 자신을 호출한다.
# 무DB(인메모리)라 재시작 시 데이터 소멸. 종료는 :3000/:3001 프로세스 kill.
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

**3) 다음 작업 후보** (로드맵 [예정], 우선순위 의견 포함):

| 작업 | 왜/착수 지점 | 난이도 |
|---|---|---|
| **큐 고도화(선택)** | 자체 인프로세스 워커 완료(D9). 남은 것: 재시도/백오프, 데드레터, 별도 워커 프로세스 분리(`apps/worker`), 또는 외부 큐. 착수 지점: `ScanWorker`/`JobQueue` 포트. | 중간 |
| **CVSS v2/v4 점수 지원(선택)** | v3.0/v3.1은 완료(아래). v2(폐형식)·v4(MacroVector 룩업)는 미지원→텍스트 폴백. 착수 지점: `enrich-osv/src/cvss.ts`. | 중간 |
| ~~OSV CVSS 숫자 점수 파싱~~ | **완료**. `enrich-osv/src/cvss.ts`가 CVSS v3.0/v3.1 벡터→Base Score(0–10) 계산, `Finding.cvss` 채움·severity 정밀화(텍스트 폴백). 코어 0줄, 의존성 0. | — |
| ~~토큰 발급/폐기 API~~ | **완료**. admin 전용 `POST`/`GET`/`DELETE /v1/tokens`, `TokenStore.listByTenant` 추가, 발급자 테넌트 범위, 원문 1회 노출·해시만 저장 — D8 확장. | — |
| ~~스캔 비동기화(큐)~~ | **완료**. `JobQueue` 포트(InMemory·Postgres) + `ScanWorker`, `003_job.sql`, `POST→202+jobId`/`GET /v1/jobs/:id` — D9. | — |
| ~~인증 DB 토큰화 + OIDC~~ | **완료**. `TokenStore`+`DbAuthProvider`(sha256, `002_api_token.sql`), `OidcAuthProvider`+`CompositeAuthProvider`(jose, `OMNIGUARD_OIDC`). | — |
| ~~GitHub 연결 + CI 가동~~ | **완료**(2026-06-02). remote `pangkim-mz/AIO-TF` 연결, push 트리거로 CI 가동. Node 22·pnpm 11 호환 수정 후 첫 통과(`f20e1dd`). | — |

**권장 순서**: ~~GitHub 연결~~ → ~~인증 DB·OIDC~~ → ~~큐~~ → ~~토큰 발급 API~~ → ~~OSV CVSS 파싱~~(완료) → 큐 고도화 / CVSS v2·v4(선택).

**4) 작업 규칙**: §4를 따른다. 새 도메인/기능이라면 코어 0줄 원칙을 먼저 점검하고,
순수 로직은 `lib`/패키지로 분리해 단위 테스트. 끝나면 README·CLAUDE.md·이 문서·메모리를 갱신.

---

## 7. 알려진 한계

- `yarn.lock` 미지원(npm/pnpm lockfile만). 없으면 의존성 레인지 근사치로 폴백.
- OSV CVSS 점수 파싱은 **v3.0/v3.1만** 지원(`enrich-osv/src/cvss.ts`). v2(구형식)·v4(MacroVector 룩업)는 미계산 → GHSA 텍스트 심각도 라벨로 폴백.
- 작업 큐는 자체 구현(인프로세스 워커). 재시도/백오프·데드레터·별도 워커 프로세스 미구현.
- 토큰 발급/폐기 API는 admin 전용. 토큰은 발급자 본인 테넌트로만 범위가 한정된다(타 테넌트 토큰 관리 불가 — 의도된 격리).
