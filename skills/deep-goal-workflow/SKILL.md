---
name: deep-goal-workflow
description: deep-goal 코어 워크플로우 — 감지·적합성평가·재구성·레시피매칭·사전준비물탐색·컴파일제시 6단계. 진입 스킬이 로드한다.
user-invocable: false
---

# deep-goal-workflow — 코어 6단계 워크플로우

장기 작업 요청을 goal 적합성 기준으로 판정하고, 다듬고, 사전 준비물을 발굴해, Claude Code / Codex의 네이티브 `/goal`에 붙여 넣을 조건을 컴파일해 제시한다. 네이티브 `/goal`은 플러그인이 프로그래밍적으로 자동 호출할 수 없다 — 조건 제시까지가 이 워크플로우의 끝이고, 활성화 트리거는 사용자가 직접 누른다.

---

## References 로드 규칙과 공통 runtime

| Reference | 용도 |
|---|---|
| `<absolute-plugin-root>/skills/deep-goal-workflow/references/fitness-rubric.md` | goal 적합성 판정 기준 |
| `<absolute-plugin-root>/skills/deep-goal-workflow/references/condition-compiler.md` | 조건 4요소 + 평가자 표면화 규칙 |
| `<absolute-plugin-root>/skills/deep-goal-workflow/references/platform-matrix.md` | Claude vs Codex 분기표 |
| `<absolute-plugin-root>/skills/deep-goal-workflow/references/prep-scout.md` | 사전 준비물 탐색 절차 |
| `<absolute-plugin-root>/skills/deep-goal-workflow/references/recipes/README.md` | 시너지 레시피 라이브러리 인덱스 |

이 workflow는 entry가 이미 로드한 상태에서 실행되므로 자기 자신을 다시 로드하지 않는다. 위 경로는 모두 `<absolute-plugin-root>`에 anchor되어 있고 그 root 안에서 해석되어야 한다 — bare 상대 경로는 대상 workspace에서 해석되므로 동명 파일로 shadowing될 수 있다.

<!-- deep-goal:claude:start -->
### Claude Code reference 경로

`references/` children은 description routing으로 로드하고, 특정 reference가 필요하면 위 표의 anchor된 경로를 읽는다. 이 branch는 **감지 → 적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의 여섯 단계를 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고 Node에 분리된 인자를 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 변경 없이 다음 호출의 별도 인자로 forward한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin root를 current working directory로 가정하거나 Git Bash에 의존하지 않는다. reference나 runtime을 읽을 수 없는 degraded mode는 fail-closed로 동작하여 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:claude:end -->

<!-- deep-goal:codex:start -->
### Codex reference 경로

필요한 `references/` 파일은 위 표의 anchor된 경로로 읽는다. 이 branch는 **감지 → 적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의 여섯 단계를 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고 Node에 분리된 인자를 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 변경 없이 다음 호출의 별도 인자로 forward한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin root를 current working directory로 가정하거나 Git Bash에 의존하지 않는다. reference나 runtime을 읽을 수 없는 degraded mode는 fail-closed로 동작하여 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:codex:end -->

---

## 6단계 절차

### 1단계: 감지

요청과 실행 환경을 파악한다: 요청의 내용과 의도, 현재 플랫폼(런타임은 자기 자신을 안다 — 사용자가 "반대 플랫폼용도 달라"고 하면 양쪽 제시), git 저장소 여부(prep-scout 분기에 영향), 그리고 설치된 deep-* 플러그인. 플러그인 감지 신호와 레시피 매핑은 아래 §감지 → 레시피 매핑 표가 정본이며, 불확실하면 사용자에게 1회 확인한다.

### 2단계: 적합성 평가

fitness-rubric을 로드해 요청을 판정한다. ✅ **적합** → 4~6단계 직행 / 🔧 **재구성 필요** → 3단계 진입 / ⛔ **반려** → 이유 + 대안 제시 후 종료.

### 3단계: 재구성 대화 (균형 게이트, 필요 시)

- **종료조건 모호** → 측정 가능하게 보강 제안 (어떤 커맨드/아티팩트로 증명하는가)
- **범위 과대** → 한 goal이 감당할 크기로 단계 분해 제안
- **증명 방법 없음** → 검증 커맨드 식별 제안 (테스트/빌드/lint 등)
- **구조적 부적합** (검증 불가 주관 목표 / 단발성 / 무관한 잡다 목록) → **명확히 반려** + 대안(`/loop`, 일반 작업) 제시

### 4단계: 레시피 매칭

recipes 인덱스의 플러그인 감지 규칙으로 적용 가능한 시너지 레시피를 제안한다. 복수 매칭이면 사용자에게 선택받고, 매칭되는 레시피나 감지된 플러그인이 없으면 **단발 goal**로 폴백한다.

### 5단계: 사전 준비물 탐색

prep-scout 절차로 코드베이스를 인라인 스캔해 **먼저 읽을 파일**(goal 진행 전 필요한 컨텍스트), **진행 증명 커맨드**(package.json scripts·Makefile·CI 설정 등에서 식별), **불변 제약**(진행 중 바뀌면 안 되는 것)을 발굴한다.

### 6단계: 컴파일 + 제시

condition-compiler와 platform-matrix로 플랫폼 맞춤 조건을 생성한다.

- **4요소 적용**: 종료상태 / 증명 방법 / 불변 제약 / 상한
- **평가자 표면화 지침 삽입**: 각 단계·게이트 결과를 대화에 명시 보고하라는 지침을 조건에 반드시 포함
- **플랫폼 분기**: Claude 또는 Codex에 맞는 문구로 컴파일
- **복잡 조건 처리**: 컴파일된 조건이 ~2,800자 초과 예상 또는 순차 게이트 3개 이상이면 시퀀스를 `PLAN.md`로 분리하고, 조건은 "PLAN.md 단계대로 완수, 각 게이트 통과까지"로 압축
- **근거 요약** + **복사용 코드블록**으로 제시한 뒤 아래 활성화 안내를 표시

---

## 감지 → 레시피 매핑

현재 세션에서 사용 가능한 스킬/슬래시 커맨드 목록으로 플러그인 존재를 판별한다.

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

활성화 명령은 Claude Code / Codex 모두 `/goal`로 동일하고, 조건 본문만 플랫폼별로 다르다 (Claude: 4요소 + 표면화 지침 + `or stop after <N> turns`; Codex: contract 형태 + 체크포인트).

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
