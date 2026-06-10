# OmniGuard IaC Scan — GitHub Action

고객(타 프로젝트) 레포의 CI에 **한 step**을 추가해, 푸시/PR마다 Terraform plan을
떠서 OmniGuard로 인프라(IaC) 리스크를 스캔한다. 대시보드의 수동 붙여넣기 과정을
자동화한다.

## 왜 이 방식인가 (방향 B)

- **정확도 = 수동과 동일**: 정적 `.tf` 파싱이 아니라 `terraform show -json` 출력(plan.json)을
  그대로 보내므로 변수·모듈·remote state가 모두 해석된 결과를 스캔한다.
- **클라우드 credentials가 고객 CI 밖으로 나가지 않는다**: plan 생성은 고객 CI 안에서만
  일어나고, OmniGuard로는 `plan.json`만 전송된다(SaaS 신뢰 모델).
- **백엔드 코어 0줄**: 기존 `POST /v1/scans/iac` + 토큰 발급 API를 재사용한다.

## 사전 준비

1. OmniGuard 대시보드 `/scan` → 클라우드/인프라(IaC) 섹션에서 토큰을 발급한다
   (또는 admin이 `POST /v1/tokens`로 발급).
2. 고객 레포에 시크릿/변수를 등록한다.
   - `OMNIGUARD_TOKEN` (시크릿): 위에서 발급한 API 토큰.
   - `OMNIGUARD_URL` (변수): OmniGuard API base URL.

## 사용법

`.github/workflows/omniguard.yml`:

```yaml
- name: OmniGuard IaC Scan
  uses: pangkim-mz/AIO-TF/examples/github-action@main
  with:
    omniguard-url: ${{ vars.OMNIGUARD_URL }}
    omniguard-token: ${{ secrets.OMNIGUARD_TOKEN }}
    working-directory: infra
    stack-name: production
```

전체 예시는 [`example-workflow.yml`](./example-workflow.yml) 참고.

## 입력

| 입력 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `omniguard-url` | ✅ | — | OmniGuard API base URL |
| `omniguard-token` | ✅ | — | API 토큰(레포 시크릿) |
| `working-directory` | | `.` | `terraform init/plan` 실행 디렉터리 |
| `stack-name` | | `""` | 스택 이름(자산 식별용) |
| `terraform-version` | | `latest` | 설치할 Terraform 버전 |
| `poll-timeout-seconds` | | `180` | 스캔 완료 폴링 최대 대기 |

## 출력

| 출력 | 설명 |
|---|---|
| `job-id` | 생성된 스캔 작업 ID |
| `status` | 최종 상태(`succeeded`/`failed`) |

## 동작 흐름

```
terraform init → plan -out=tfplan → show -json tfplan > plan.json
  → POST {OMNIGUARD_URL}/v1/scans/iac  (Authorization: Bearer OMNIGUARD_TOKEN)  → 202 {jobId}
  → GET  {OMNIGUARD_URL}/v1/jobs/{jobId}  완료까지 폴링(queued/running → succeeded/failed)
  → 큐 → connector-iac → 점수 → 영속 → 대시보드 반영
```

## 한계 / 다음 단계

- 이 Action은 **결과를 보내기만** 한다. PR 코멘트나 Critical 발견 시 CI 실패(게이트)는
  포함하지 않는다 — 그건 GitHub 토큰 권한 추가가 필요한 다음 슬라이스다.
- 스캔이 `failed`로 끝나면 step도 실패한다(인프라/네트워크 오류 구분은 작업 `error` 메시지 참고).
