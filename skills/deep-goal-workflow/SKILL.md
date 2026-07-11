---
name: deep-goal-workflow
description: deep-goal 코어 워크플로우 — 감지/적합성평가/재구성/레시피매칭/사전준비물탐색/컴파일제시 6단계와 references 정의. deep-goal 진입 스킬이 자동 로드한다.
user-invocable: false
---

# deep-goal-workflow — 코어 6단계 워크플로우

## 개요

deep-goal은 사용자의 장기 작업 요청을 받아 (1) goal 기능에 적합한지 평가하고, (2) 맞는 형태로 다듬고, (3) 필요한 사전 준비물을 발굴해, (4) Claude Code / Codex의 네이티브 `/goal`에 그대로 붙여 넣을 수 있는 완성된 조건을 컴파일해 제시하는 **메타-Guide** 플러그인이다.

**활성화 모델**: 네이티브 `/goal`은 플러그인/스킬이 프로그래밍적으로 자동 호출할 수 없다(docs/superpowers/specs/2026-05-27-deep-goal-design.md §3 검증 완료). deep-goal의 역할은 완성된 `/goal` 조건을 제시하는 데서 끝나고, **활성화 트리거는 사용자가 직접 누른다**. 활성화 마찰은 "한 줄 복사-붙여넣기"로 최소화한다.

---

## References 로드 규칙과 공통 runtime

이 workflow는 다음 references를 사용한다:
- `references/fitness-rubric.md` — goal 적합성 판정 기준
- `references/condition-compiler.md` — 조건 4요소 + 평가자 표면화 규칙
- `references/platform-matrix.md` — Claude vs Codex 분기표
- `references/prep-scout.md` — 사전 준비물 탐색 절차
- `references/recipes/` — 시너지 레시피 라이브러리

workflow는 entry가 이미 로드한 상태에서 실행되므로 자기 자신을 다시 로드하지 않는다.

<!-- deep-goal:claude:start -->
### Claude Code reference 경로

workflow의 `references/` children은 description routing으로 로드한다. 특정 reference가 필요하면 현재
로드된 workflow skill의 파일 경로를 기준으로 `references/<file>`을 읽는다. 이 branch는 **감지 →
적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의 여섯 단계를 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고 Node에 분리된 인자를 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 변경 없이 다음
호출의 별도 인자로 forward한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin-root current working
directory나 Git Bash에 의존하지 않는다. reference나 runtime을 읽을 수 없는 degraded mode는
fail-closed로 동작하여 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:claude:end -->

<!-- deep-goal:codex:start -->
### Codex reference 경로

현재 로드된 workflow skill의 파일 경로에서 `references/<file>`을 이 파일 기준 상대 경로로 읽는다.
이 branch는 **감지 → 적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의
여섯 단계를 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고 Node에 분리된 인자를 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 변경 없이 다음
호출의 별도 인자로 forward한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin-root current working
directory나 Git Bash에 의존하지 않는다. reference나 runtime을 읽을 수 없는 degraded mode는
fail-closed로 동작하여 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:codex:end -->

---

## 6단계 절차

### 1단계: 감지

요청과 실행 환경을 파악한다.

- **요청 파싱**: 사용자의 장기 작업 요청 내용과 의도 파악
- **플랫폼 감지**: 현재 런타임이 자기 자신을 안다 (Claude Code / Codex). 사용자가 "반대 플랫폼용도 달라"고 하면 양쪽 제시
- **git 여부 확인**: git 저장소인지 확인 (prep-scout 분기에 영향)
- **설치된 deep-* 플러그인 감지**: 사용 가능한 스킬/슬래시 목록에서 다음을 확인
  - `deep-work` — robust-implementation 레시피 트리거
  - `deep-review` 또는 `deep-review-loop` — robust-implementation / ship-and-document 레시피 트리거
  - `deep-evolve` — autonomous-evolution 레시피 트리거
  - `deep-docs` — ship-and-document 레시피 트리거
  - `deep-wiki` — ship-and-document 레시피 트리거
  - 불확실하면 사용자에게 1회 확인

### 2단계: 적합성 평가

`references/fitness-rubric.md`를 로드하여 요청을 판정한다.

판정 결과:
- ✅ **적합** → 4~6단계로 직행
- 🔧 **재구성 필요** → 3단계 재구성 대화 진입
- ⛔ **반려** → 이유 + 대안 제시 후 종료

### 3단계: 재구성 대화 (균형 게이트, 필요 시)

재구성이 필요한 경우 대화로 보강한다. 구조적으로 수습이 안 되면 명확히 반려한다.

- **종료조건 모호** → 측정 가능하게 보강 제안 (어떤 커맨드/아티팩트로 증명할 수 있는가)
- **범위 과대** → 단계 분해 제안 (한 goal이 감당할 수 있는 크기로)
- **증명 방법 없음** → 검증 커맨드 식별 제안 (테스트/빌드/lint 등)
- **구조적 부적합** (검증 불가 주관 목표 / 단발성 / 무관한 잡다 목록) → **명확히 반려** + 대안(`/loop`, 일반 작업) 제시

### 4단계: 레시피 매칭

`references/recipes/README.md`의 플러그인 감지 규칙으로 적용 가능한 시너지 레시피를 제안한다.

- 복수 레시피가 매칭되면 사용자에게 선택받는다
- 아무 레시피도 매칭되지 않으면 **단발 goal**로 진행
- 감지된 플러그인이 없으면 단발 goal로 폴백

### 5단계: 사전 준비물 탐색

`references/prep-scout.md`의 절차로 코드베이스를 인라인 스캔한다.

발굴 대상:
- **먼저 읽을 파일** (goal 진행 전 필요한 컨텍스트)
- **진행 증명 커맨드** (테스트/빌드/lint — package.json scripts, Makefile, CI 설정 등에서 식별)
- **불변 제약** (goal 진행 중 바뀌면 안 되는 것)

### 6단계: 컴파일 + 제시

`references/condition-compiler.md`와 `references/platform-matrix.md`를 사용하여 플랫폼 맞춤 `/goal` 조건을 생성하고 제시한다.

- **4요소 적용**: 종료상태 / 증명 방법 / 불변 제약 / 상한
- **평가자 표면화 지침 삽입**: 각 단계·게이트 결과를 대화에 명시 보고하라는 지침을 조건에 반드시 포함
- **플랫폼 분기**: Claude 또는 Codex에 맞는 문구로 컴파일
- **복잡 조건 처리**: 컴파일된 조건이 ~2,800자 초과 예상 또는 순차 게이트 3개 이상이면 시퀀스를 `PLAN.md`로 분리, 조건은 "PLAN.md 단계대로 완수, 각 게이트 통과까지"로 압축
- **근거 요약** + **복사용 코드블록**으로 제시

제시 후 아래 활성화 안내를 표시한다.

---

## 감지 방법 (상세)

### 플랫폼 감지

현재 런타임이 자기 자신을 안다 (Claude Code / Codex). 사용자가 "반대 플랫폼용 조건도 줘"라고 요청하면 Claude 버전과 Codex 버전을 모두 제시한다.

### 설치된 deep-* 플러그인 감지

현재 세션에서 사용 가능한 스킬/슬래시 커맨드 목록을 확인하여 다음 플러그인 존재를 판별한다:

| 플러그인 | 감지 신호 | 연결 레시피 |
|---|---|---|
| `deep-work` | `/deep-work` 또는 `deep-work:*` 스킬 존재 | robust-implementation |
| `deep-review` / `deep-review-loop` | `/deep-review` 또는 `deep-review:*` 존재 | robust-implementation, ship-and-document |
| `deep-evolve` | `/deep-evolve` 또는 `deep-evolve:*` 존재 | autonomous-evolution |
| `deep-docs` | `/deep-docs` 또는 `deep-docs:*` 존재 | ship-and-document |
| `deep-wiki` | `/deep-wiki` 또는 `deep-wiki:*` 존재 | ship-and-document |

불확실하면 사용자에게 1회 확인: "다음 플러그인 중 현재 프로젝트에 설치된 것을 알려주세요."

---

## 활성화 안내 템플릿

컴파일된 조건을 제시한 후, 다음 형태로 활성화 안내를 표시한다:

> **참고**: 활성화 명령은 Claude Code / Codex 두 플랫폼 모두 `/goal`로 동일하다. 조건 본문만 플랫폼별로 차이가 있다 (Claude: 4요소 + 표면화 지침 + `or stop after <N> turns`; Codex: contract 형태 + 체크포인트).

```
아래 한 줄을 그대로 입력/붙여넣어 활성화하세요:

/goal <컴파일된 조건>
```

PLAN.md 분리 시:
```
1. 먼저 PLAN.md를 프로젝트 루트에 저장하세요 (위 내용 복사).
2. 그런 다음 아래 한 줄을 입력/붙여넣어 활성화하세요:

/goal PLAN.md 단계대로 완수. 각 게이트 통과 결과를 대화에 보고할 것. or stop after <N> turns.
```

> **`<N>`을 구체 숫자로 치환하세요** (예: `or stop after 40 turns`). 레시피·요청 복잡도에 맞게 조정한다.
