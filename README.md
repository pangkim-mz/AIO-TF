# OmniGuard

AI 기반 인프라/공급망 리스크 통합 관제 시스템.

상용 SaaS 목표. 현재는 **SW 공급망 수직 슬라이스**(MVP)를 구현 중입니다:
`package.json → 자산 추출 → OSV 취약점 조회 → 결정론적 리스크 점수`.

## 구조 (pnpm 모노레포)

| 패키지 | 역할 |
|---|---|
| `packages/schema` | 공통 정규화 스키마 (Asset / Finding / RiskScore, zod) |
| `packages/connector-npm` | package.json 스캐너 → 자산 추출 |
| `packages/enrich-osv` | OSV.dev API로 CVE 매칭 (타임아웃·재시도·동시성 제한) |
| `packages/scoring` | 결정론적 리스크 점수 (근거 분해 포함) |
| `apps/cli` | 수직 슬라이스 오케스트레이터 |

## 사용법

```bash
pnpm install

# 테스트 (네트워크 불필요 — OSV는 모킹)
pnpm test

# 타입 체크
pnpm typecheck

# 실제 스캔 (OSV API 호출, 네트워크 필요)
pnpm scan <path/to/package.json>
pnpm scan <path/to/package.json> --json
```

## 설계 원칙

- 정규화 스키마 하나로 세 도메인(SW 공급망/벤더/클라우드)을 흡수 → 파이프라인은 도메인 무관.
- 점수는 **결정론적**이고 `scoringVersion`으로 버전 관리(재현성). AI는 점수 *해석*만 담당.
- 외부 입력(OSV 응답, package.json)은 zod로 런타임 검증.

## 알려진 한계 (다음 단계)

- `connector-npm`은 package.json의 버전 *레인지*에서 근사 버전을 추출. 정확한 설치 버전은
  pnpm-lock.yaml / node_modules 연동으로 보완 예정.
- OSV의 CVSS 숫자 점수 파싱 미구현(현재 GHSA 텍스트 심각도만 매핑).
