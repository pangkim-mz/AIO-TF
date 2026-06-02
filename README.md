# OmniGuard

AI 기반 인프라/공급망 리스크 통합 관제 시스템.

상용 SaaS 목표. 현재는 **SW 공급망 수직 슬라이스**(MVP)를 구현 중입니다:
`package.json → 자산 추출 → OSV 취약점 조회 → 결정론적 리스크 점수`.

## 구조 (pnpm 모노레포)

| 패키지 | 역할 |
|---|---|
| `packages/schema` | 공통 정규화 스키마 (Asset / Finding / RiskScore, zod) |
| `packages/connector-npm` | package.json 스캐너 → 자산 추출 (lockfile로 정확한 버전 해석) |
| `packages/connector-vendor` | 벤더 인벤토리(YAML/JSON) → 자산 + 규칙 기반 컴플라이언스 평가 |
| `packages/enrich-osv` | OSV.dev API로 CVE 매칭 (타임아웃·재시도·동시성 제한) |
| `packages/scoring` | 결정론적 리스크 점수 (근거 분해 포함) |
| `packages/graph` | 자산 그래프 위험 전파 (순환 안전, 영향도 산정) |
| `packages/storage` | 멀티테넌트 영속화 (포트/어댑터: InMemory · Postgres+RLS) |
| `apps/cli` | 수직 슬라이스 오케스트레이터 |

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

마이그레이션: `packages/storage/migrations/001_init.sql`.

## 영향도 전파 (Asset Graph)

`packages/graph`는 자산 관계(`AssetRelationship`)를 따라 리스크를 전파한다.
엣지 `from -[depends_on]-> to`는 "from이 to에 영향받음"을 의미하므로 리스크가
근원(to) → 영향받는 자산(from)으로 흐른다: `impact(x) = max(own(x), max impact(자식))`.

- npm 커넥터는 루트 애플리케이션 자산 + 각 의존성에 대한 `depends_on` 엣지를 생성한다.
- 자체 취약점이 없는 애플리케이션도 의존성의 리스크를 상속받아 영향도 우선순위에 노출된다.
- 순환 참조는 안전하게 차단된다. CLI(`pnpm scan`)는 점수 테이블 뒤에 "영향도 전파" 섹션을 출력한다.

## 설계 원칙

- 정규화 스키마 하나로 세 도메인(SW 공급망/벤더/클라우드)을 흡수 → 파이프라인은 도메인 무관.
  벤더 도메인은 schema/scoring/storage **변경 없이** 추가됨(입력 파싱 + 규칙만 신규) — 스키마 범용성 검증 완료.
- 점수는 **결정론적**이고 `scoringVersion`으로 버전 관리(재현성). AI는 점수 *해석*만 담당.
- 외부 입력(OSV 응답, package.json)은 zod로 런타임 검증.

## 버전 해석

`connector-npm`은 package.json 옆의 lockfile에서 정확한 설치 버전을 읽는다
(`package-lock.json`, `pnpm-lock.yaml` 지원). lockfile이 없으면 레인지 근사치로 폴백하며,
각 자산의 `tags.versionSource`(`lockfile` | `range`)에 출처를 기록한다.

## 알려진 한계 (다음 단계)

- `yarn.lock`은 미지원(현재 npm/pnpm lockfile만). 없으면 레인지 폴백.
- OSV의 CVSS 숫자 점수 파싱 미구현(현재 GHSA 텍스트 심각도만 매핑).
