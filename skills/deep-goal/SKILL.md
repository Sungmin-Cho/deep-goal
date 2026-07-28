---
name: deep-goal
description: Compiles a long-running request into a ready-to-paste native /goal condition. Triggers on `/deep-goal`, "set a goal", "long-running task", "run until done", "goal 조건", "장기 자율 진행", "goal로 만들어줘".
user-invocable: true
---

# deep-goal — goal 조건 컴파일러

장기 작업 요청을 받아 goal 기능 적합성을 평가하고, 맞는 형태로 다듬고, 사전 준비물을 발굴해, 네이티브 `/goal`에 그대로 붙여 넣을 수 있는 조건을 컴파일해 제시한다.

---

## Invocation

| Host entry | Invocation |
|---|---|
| Claude Code user | `/deep-goal <request>` |
| Codex user | `$deep-goal:deep-goal <request>` |
| Claude Code programmatic dispatch | `Skill({ skill: "deep-goal:deep-goal", args })` |

프로그래밍 dispatch는 Claude Code용이며 Codex 사용자 진입이 아니다. 인수 없이 호출되면 **AskUserQuestion**으로 목표를 묻는다: "무엇을 끝까지 진행하고 싶나요? 목표를 설명해주시면 goal 조건으로 컴파일해 드립니다." 응답을 받아 아래 6단계를 시작한다.

<!-- deep-goal:claude:start -->
### Claude Code 경로

**Claude Code 사용자**는 `/deep-goal <요청>`으로 진입한다. 이 entry가 로드된 상태에서 description routing이 sibling workflow를 아직 로드하지 않았다면 `Skill({ skill: "deep-goal:deep-goal-workflow" })`로 로드한다. 이후 **감지 → 적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의 여섯 단계를 순서대로 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고, Node에 각 인자를 분리해 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 그대로 다음 별도 인자로 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin root를 current working directory로 가정하거나 Git Bash에 의존하지 않는다. runtime 또는 file tool을 사용할 수 없는 degraded mode는 fail-closed로 동작하며 결과를 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:claude:end -->

<!-- deep-goal:codex:start -->
### Codex 경로

**Codex 사용자**는 `$deep-goal:deep-goal <요청>`으로 진입한다. 현재 로드된 entry skill의 절대 경로에서 설치된 plugin root를 구한 뒤 `<absolute-plugin-root>/skills/deep-goal/../deep-goal-workflow/SKILL.md`를 읽고, 이후 **감지 → 적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의 여섯 단계를 순서대로 수행한다.

같은 plugin root로 Node에 각 인자를 분리해 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 그대로 다음 별도 인자로 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin root를 current working directory로 가정하거나 Git Bash에 의존하지 않는다. runtime 또는 file tool을 사용할 수 없는 degraded mode는 fail-closed로 동작하며 결과를 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:codex:end -->

**경로 규칙**: 위 두 branch가 host별 로드의 정본이다. entry만 workflow를 로드하며, 이미 로드된 workflow는 자기 자신을 다시 로드하지 않는다. 플러그인이 열거나 실행하라고 지시하는 모든 경로는 `<absolute-plugin-root>`에 anchor하고 그 root 안에서 해석되어야 한다 — bare 상대 경로는 대상 workspace에서 해석되므로 동명 파일로 shadowing될 수 있다.

---

## 인라인 핵심 (cross-platform self-containment)

타 플랫폼에서 `deep-goal-workflow` 자동 로드가 약해도 동작하도록 아래 규칙을 의도적으로 인라인 보존한다. 다음 네 파일을 mirror하므로 한쪽을 바꾸면 양쪽을 동기화한다:

- `<absolute-plugin-root>/skills/deep-goal-workflow/SKILL.md`
- `<absolute-plugin-root>/skills/deep-goal-workflow/references/fitness-rubric.md` (부재 또는 부실 재구성 트리거)
- `<absolute-plugin-root>/skills/deep-goal-workflow/references/condition-compiler.md` (render decision · self-report caveat)
- `<absolute-plugin-root>/skills/deep-goal-workflow/references/platform-matrix.md`

### 활성화 모델

네이티브 `/goal`은 플러그인/스킬이 프로그래밍적으로 **자동 호출 불가**다. deep-goal의 역할은 완성된 조건을 제시하는 데서 끝나고, **활성화 트리거는 사용자가 직접 누른다**. 활성화 마찰은 "한 줄 복사-붙여넣기"로 최소화한다.

### 적합성 3판정

| 판정 | 신호 | 처리 |
|---|---|---|
| ✅ **적합** | 단일 목표 · 검증 가능한 종료조건 · 적정 크기 · 진행 증명 루프 존재 | 4~6단계 직행 |
| 🔧 **재구성** | 종료조건 모호 / 범위 과대 / 증명 방법 부재 또는 부실(주관·비실행·미확인) | 측정 가능화·분해·커맨드 식별 제안 |
| ⛔ **반려** | 검증 불가 주관 목표 / 단발성 / 무관한 잡다 목록 | 이유 + 대안(`/loop`·일반 작업) 제시 |

### 컴파일 4요소

모든 플랫폼의 컴파일된 조건은 **측정 가능한 종료상태**(무엇이 달성되면 완료인가), **증명 방법**(어떤 커맨드나 artifact로 확인하는가), **불변 제약**(진행 중 바뀌면 안 되는 것), **상한**(`or stop after N turns` 같은 구체 한도)을 포함한다.

### 평가자 표면화 규칙 (필수)

Claude의 `/goal` 평가자(Haiku 모델)는 **도구를 호출하지 않으며** 대화에 **표면화된 출력**만으로 종료를 판정한다. 따라서 모든 컴파일된 조건에 다음 지침을 반드시 포함한다:

> "각 단계/게이트 결과를 대화에 명시 보고하라."

이 지침이 없으면 내부적으로 검증을 완료해도 평가자가 종료를 판정하지 못한다.

**신뢰 한계(정직 caveat)**: 이 표면화 출력은 평가자가 **독립 검증**하지 않는 self-report다. 고위험 goal은 검증가능 anchor(commit SHA·CI URL·deep-work `session-receipt.json`)를 우선한다.

**증명 방법 verifiability**: prep-scout가 confirmed한 커맨드/객관 아티팩트만 ready-to-run으로 제시한다. unconfirmed(추정)·주관 placeholder는 "⚠️ 미검증" 표시 + 재구성 유도.

### 플랫폼 분기

| 플랫폼 | 핵심 규칙 |
|---|---|
| **Claude Code** | 평가자가 도구 없이 대화 표면화 출력만 판정 → 각 단계 결과 명시 보고 필수, 4,000자 한도 준수, `or stop after N turns` 상한 권장 |
| **Codex** | contract 형태(달성/변경금지/검증/종료) + 체크포인트·진행 로그, `pause`/`resume` 활용 안내, PLAN.md 적극 활용 |

**PLAN.md 분리 임계치**: 조건이 ~2,800자 초과 예상 또는 순차 게이트 3개 이상이면 시퀀스를 PLAN.md로 분리하고 조건을 압축한다.

---

## 6단계 절차 요약

상세 절차는 `deep-goal-workflow` 스킬이 정본이다.

| 단계 | 작업 |
|---|---|
| ① **감지** | 요청 파싱 / 플랫폼(Claude·Codex) / git 여부 / 설치된 deep-* 플러그인 감지 |
| ② **적합성 평가** | fitness-rubric 적용 → 적합/재구성/반려 판정 |
| ③ **재구성 대화** | 균형 게이트 — 종료조건 보강·범위 분해·증명 커맨드 식별 / 구조적 부적합 시 반려 + 대안 |
| ④ **레시피 매칭** | 감지된 플러그인으로 시너지 레시피 제안, 없으면 단발 goal |
| ⑤ **사전 준비물 탐색** | Glob/Read로 읽을 파일·증명 커맨드·불변 제약 발굴. 파일 탐색 도구가 없으면 사용자에게 컨텍스트를 요청하고 결과를 '미검증(unverified)'으로 표시하며 ready-to-run으로 단정하지 않는다 |
| ⑥ **컴파일 + 제시** | 4요소 + 표면화 지침 + 플랫폼 분기 적용 → 복사용 코드블록 + 활성화 안내 |
