# OmniGuard IaC Scan — GitHub Action 사용 매뉴얼

다른(고객/사내) 레포의 CI에 **step 한 줄**을 추가해, 푸시·PR마다 Terraform plan을 떠서
OmniGuard로 보내 인프라(IaC) 리스크를 자동 스캔한다. 대시보드의 수동 붙여넣기를 자동화한다.

> 이 문서는 **처음 쓰는 사람도 그대로 따라 할 수 있게** 호스팅·연결·확인·문제 해결까지 모두 담았다.

---

## 0. 먼저 이해할 것 — 등장인물 3개

```
[대상 레포 my-infra]          [GitHub Actions 러너]            [OmniGuard API]
 Terraform(.tf)          →   plan 떠서 plan.json 생성     →   POST /v1/scans/iac
 .github/workflows/             (대상 레포 CI 안에서만)            (어딘가 떠 있어야 함)
   omniguard.yml                                          ←   대시보드에 결과 반영
```

- **대상 레포**: 자기 워크플로에 `uses:` 한 줄만 추가한다.
- **plan 생성은 대상 레포 CI 안에서만** 일어난다 → **클라우드 자격증명이 OmniGuard로 나가지 않는다**.
- **OmniGuard API는 러너가 네트워크로 닿을 수 있는 곳**에 떠 있어야 한다(아래 2장).

---

## 1. 미리 준비할 것 (체크리스트)

- [ ] **(a) Terraform으로 구성된 대상 레포** — `.tf` 파일이 있고 `terraform plan`이 도는 레포.
  - 이 Action은 **Terraform 전용**이다. Terraform을 안 쓰는 레포에는 적용되지 않는다.
  - 사내에 Terraform 레포가 없으면? → OmniGuard의 다른 스캐너(SW 공급망 `package.json`,
    웹 URL EASM)는 Terraform 없이도 가치를 보여줄 수 있다. 다만 **이 자동 연동 Action은 IaC만** 다룬다.
- [ ] **(b) 러너가 닿는 OmniGuard API URL** — 2장에서 만든다.
- [ ] **(c) OmniGuard API 토큰** — 2-3장 또는 4-1장에서 만든다.

---

## 2. OmniGuard API를 러너가 닿게 띄우기

GitHub의 클라우드 러너(ubuntu-latest 등)는 **인터넷에서 접근 가능한 URL**로만 OmniGuard에 닿을 수 있다.
사내 서버가 없다면 **내 PC를 켜둔 채 터널로 임시 공개 URL을 만드는 방법**(아래 2-A)이 가장 빠르다.

| 방식 | 요약 | 적합 |
|---|---|---|
| **2-A. 내 PC + Cloudflare 터널** | PC에서 API를 띄우고 `cloudflared`로 임시 공개 URL 발급 | **데모·파일럿(서버 없음)** |
| 2-B. self-hosted runner | 사내망에 GitHub self-hosted runner를 두고 `runs-on: self-hosted` | OmniGuard를 외부 노출 못 할 때 |
| 2-C. 서버/클라우드 배포 | 상시 URL + Postgres 영속 | 정식 상시 운영 |

아래는 **2-A(내 PC 호스팅)** 절차다(Windows / PowerShell 기준).

### 2-A-1. 강한 토큰 하나 만들기 (공개 노출용)

공개 URL로 띄우면 누구나 주소를 알면 접근을 시도할 수 있으므로, 기본 `dev-token` 대신 **추측 불가능한 토큰**을 쓴다.
PowerShell에서:

```powershell
$token = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$token   # 출력된 값을 복사해 둔다 (예: 3f1c...의 64자 문자열)
```

### 2-A-2. API 띄우기

```powershell
cd C:\Users\MZ01-PANGKIM\Desktop\AIO-TF

# 위에서 만든 토큰을 admin 권한으로 등록(JSON 형식). tenantId는 조직 식별자(아무 문자열).
$env:OMNIGUARD_TOKENS = '{"' + $token + '":{"tenantId":"my-org","role":"admin"}}'

# 사내 프록시(MITM) 환경이면 외부 fetch 위해 시스템 CA 사용(없으면 생략 가능)
$env:NODE_OPTIONS = "--use-system-ca"

pnpm serve     # http://0.0.0.0:3000 으로 뜸 (PC가 켜져 있는 동안만 동작)
```

> 인메모리 모드라 **API를 끄면 스캔 데이터가 사라진다.** 데이터를 유지하려면 `DATABASE_URL`로 Postgres를 연결한다(상시 운영 권장).

### 2-A-3. Cloudflare 터널로 공개 URL 만들기

`cloudflared`가 없으면 설치한다(계정 불필요한 quick tunnel 사용):

```powershell
winget install --id Cloudflare.cloudflared      # 또는 https://github.com/cloudflare/cloudflared/releases
```

**새 터미널**에서(API는 계속 켜둔 채):

```powershell
cloudflared tunnel --url http://localhost:3000
```

출력에 다음과 같은 줄이 나온다 — 이 주소가 **`OMNIGUARD_URL`**이다:

```
https://random-words-1234.trycloudflare.com
```

확인:

```powershell
curl https://random-words-1234.trycloudflare.com/health    # {"ok":true,...} 나오면 성공
```

> quick tunnel URL은 **터널을 재시작할 때마다 바뀐다.** 바뀌면 대상 레포의 `OMNIGUARD_URL` 변수도 갱신해야 한다(데모의 한계).
> 고정 주소가 필요하면 Cloudflare 계정 + named tunnel을 쓰거나 2-C(서버 배포)로 간다.

---

## 3. (참고) 대시보드에서 워크플로 YAML 받기

OmniGuard 대시보드 `/scan` → **클라우드/인프라(IaC)** 섹션 → **"GitHub로 자동 연동"** 토글을 열면
아래 4-3의 워크플로 YAML을 **복사 버튼**으로 바로 받을 수 있다. 손으로 작성하지 않아도 된다.

---

## 4. 대상 레포에 연결하기

예: `my-infra`라는 Terraform 레포에 붙인다고 하자.

### 4-1. 토큰 준비

2-A-1에서 만든 토큰을 그대로 쓴다(또는 대시보드/`POST /v1/tokens`로 발급한 토큰).

### 4-2. 대상 레포에 시크릿·변수 등록

GitHub 대상 레포 → **Settings → Secrets and variables → Actions**:

- **Secrets** 탭 → `New repository secret`
  - 이름 `OMNIGUARD_TOKEN`, 값 = 위 토큰
  - (클라우드 plan에 필요하면) `AWS_ROLE_ARN` 등 클라우드 자격증명
- **Variables** 탭 → `New repository variable`
  - 이름 `OMNIGUARD_URL`, 값 = 2-A-3의 공개 URL(예: `https://random-words-1234.trycloudflare.com`)

### 4-3. 워크플로 파일 추가

대상 레포에 `.github/workflows/omniguard.yml` 생성(전체 예시는 [`example-workflow.yml`](./example-workflow.yml)):

```yaml
name: OmniGuard IaC Scan
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
jobs:
  iac-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 클라우드 자격증명은 대상 레포 CI 시크릿으로만 주입(plan 생성용, OmniGuard로 안 나감).
      # AWS가 아니거나 자격증명 없이 plan이 되면 이 step은 생략 가능.
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-northeast-2

      - name: OmniGuard IaC Scan
        uses: pangkim-mz/AIO-TF/examples/github-action@main
        with:
          omniguard-url: ${{ vars.OMNIGUARD_URL }}
          omniguard-token: ${{ secrets.OMNIGUARD_TOKEN }}
          working-directory: infra      # .tf 파일이 있는 디렉터리
          stack-name: production
```

커밋·푸시하면 끝이다.

---

## 5. 동작 확인

1. 대상 레포 → **Actions** 탭 → 방금 실행된 `OmniGuard IaC Scan` 잡 클릭.
2. 로그에서 순서대로:
   - `plan.json 생성: NNNN bytes`
   - `작업 큐 등록됨: <jobId>`
   - `✅ 스캔 완료` (+ 결과 JSON)
3. **OmniGuard 대시보드**(`/findings`·`/impact`)에 스캔 결과가 반영된다.

---

## 6. 입력 / 출력 레퍼런스

**inputs**

| 입력 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `omniguard-url` | ✅ | — | OmniGuard API base URL |
| `omniguard-token` | ✅ | — | API 토큰(레포 시크릿) |
| `working-directory` | | `.` | `terraform init/plan` 실행 디렉터리 |
| `stack-name` | | `""` | 스택 이름(자산 식별용) |
| `terraform-version` | | `latest` | 설치할 Terraform 버전 |
| `poll-timeout-seconds` | | `180` | 스캔 완료 폴링 최대 대기(초) |

**outputs**

| 출력 | 설명 |
|---|---|
| `job-id` | 생성된 스캔 작업 ID |
| `status` | 최종 상태(`succeeded`/`failed`) |

**동작 흐름**

```
terraform init → plan -out=tfplan → show -json tfplan > plan.json
  → POST {OMNIGUARD_URL}/v1/scans/iac  (Authorization: Bearer OMNIGUARD_TOKEN)  → 202 {jobId}
  → GET  {OMNIGUARD_URL}/v1/jobs/{jobId}  완료까지 폴링(queued/running → succeeded/failed)
  → 큐 → connector-iac → 점수 → 영속 → 대시보드 반영
```

---

## 7. 문제 해결 (Troubleshooting)

| 증상 | 원인 / 해결 |
|---|---|
| 러너가 `curl: (6/7) Could not resolve/connect` | `OMNIGUARD_URL`이 잘못됨 또는 터널이 꺼짐. PC에서 API + `cloudflared`가 둘 다 켜져 있는지, `/health`가 응답하는지 확인. |
| `401 unauthenticated` | `OMNIGUARD_TOKEN`이 API의 `OMNIGUARD_TOKENS`에 등록된 토큰과 다름. 2-A-2에서 등록한 값과 레포 시크릿이 같은지 확인. |
| `terraform plan` 실패 | 클라우드 자격증명/백엔드(remote state) 설정 문제. 대상 레포 CI에서 평소 `terraform plan`이 되는 상태여야 함. `working-directory`가 맞는지 확인. |
| 스캔이 `failed`로 끝남 | API 로그 확인. plan JSON 형식 문제거나 OmniGuard 측 오류. Action 출력의 작업 `error` 메시지 참고. |
| 터널 URL이 자꾸 바뀜 | quick tunnel 특성. 재시작 때마다 `OMNIGUARD_URL` 변수 갱신, 또는 named tunnel/서버 배포로 고정. |
| 사내 프록시로 OmniGuard 외부 fetch 실패 | API를 `$env:NODE_OPTIONS="--use-system-ca"; pnpm serve`로 띄움(Windows CA 저장소 사용). |

---

## 8. 한계 / 주의

- **이 Action은 결과를 "보내기만" 한다.** PR 코멘트나 Critical 발견 시 CI 실패(게이트)는 **미포함** —
  GitHub 토큰 권한 추가가 필요한 다음 슬라이스다.
- **내 PC 호스팅은 데모/파일럿용이다.** PC가 꺼지면 중단되고, 인메모리는 재시작 시 데이터가 사라지며,
  quick tunnel URL은 바뀐다. **상시 운영은 서버/클라우드 배포 + Postgres**가 필요하다.
- **보안**: 공개 URL로 노출하는 동안에는 추측 불가능한 토큰을 쓰고, 데모가 끝나면 API/터널을 내린다.
- 기존 **수동 붙여넣기 UI**(대시보드 textarea)는 온보딩·일회성용으로 계속 병행 사용할 수 있다.

---

## 9. (선택) 정식 배포로 가기

- **고정 URL**: Cloudflare named tunnel, 사내 리버스 프록시, 또는 클라우드(예: 작은 VM/컨테이너)에 배포.
- **데이터 영속**: `DATABASE_URL`로 Postgres 연결(인메모리 → 영구 저장).
- **Action 배포**: 지금은 `pangkim-mz/AIO-TF/examples/github-action@main` 경로 참조다. 별도 공개 레포로 떼어
  `your-org/omniguard-action@v1`처럼 버전 태그로 배포하면 더 깔끔하다.
