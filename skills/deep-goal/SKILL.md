---
name: deep-goal
description: Use when the user wants to turn a long-running task into a native /goal condition — evaluating fit, reshaping, scouting prerequisites, and compiling a ready-to-paste condition. Triggers on `/deep-goal`, "set a goal", "long-running task", "run until done", "goal 조건", "장기 자율 진행", "goal로 만들어줘". Compiles for Claude Code or Codex; suggests deep-suite synergy recipes when sibling plugins are installed.
user-invocable: true
---

# deep-goal — goal 조건 컴파일러

사용자의 장기 작업 요청을 받아 (1) goal 기능에 적합한지 평가하고, (2) 맞는 형태로 다듬고, (3) 필요한 사전 준비물을 발굴해, (4) 네이티브 `/goal`에 그대로 붙여 넣을 수 있는 완성된 조건을 컴파일해 제시하는 **메타-Guide** 플러그인이다.

---

## Invocation

진입 경로를 호스트별로 명확히 구분한다:

| Host entry | Invocation |
|---|---|
| Claude Code user | `/deep-goal <request>` |
| Codex user | `$deep-goal:deep-goal <request>` |
| Claude Code programmatic dispatch | `Skill({ skill: "deep-goal:deep-goal", args })` |

프로그래밍 dispatch는 Claude Code용이며 Codex 사용자 진입이 아니다.

<!-- deep-goal:claude:start -->
### Claude Code 경로

| 맥락 | 진입 방법 |
|---|---|
| **Claude Code 사용자** | `/deep-goal <요청>` |

이 entry가 먼저 로드된 상태에서 description routing이 sibling workflow를 아직 로드하지 않았다면
`Skill({ skill: "deep-goal:deep-goal-workflow" })`로 sibling workflow를 로드한다. 이후 **감지 → 적합성 평가 →
재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시**의 여섯 단계를 순서대로 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고, 다음처럼 Node에 각 인자를
분리해 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 그대로 다음
별도 인자로 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin-root current working
directory나 Git Bash에 의존하지 않는다. runtime 또는 file tool을 사용할 수 없는 degraded mode는
fail-closed로 동작하며 결과를 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:claude:end -->

<!-- deep-goal:codex:start -->
### Codex 경로

| 맥락 | 진입 방법 |
|---|---|
| **Codex 사용자** | `$deep-goal:deep-goal <요청>` |

현재 로드된 entry skill의 파일 경로에서 `../deep-goal-workflow/SKILL.md`를 읽고, 그 파일을 기준으로
`references/` children을 해석한다. 이후 **감지 → 적합성 평가 → 재구성 → 레시피 매칭 → 사전 준비물
탐색 → 컴파일 + 제시**의 여섯 단계를 순서대로 수행한다.

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구하고, 다음처럼 Node에 각 인자를
분리해 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

`scout.git.baselineHead`는 현재 요청의 working memory에만 유지한다. 값이 non-null이면 그대로 다음
별도 인자로 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

값이 null이면 `--baseline`을 생략하고 proof를 unconfirmed로 유지한다. plugin-root current working
directory나 Git Bash에 의존하지 않는다. runtime 또는 file tool을 사용할 수 없는 degraded mode는
fail-closed로 동작하며 결과를 **미검증(unverified)** 으로 표시하고 ready-to-run으로 단정하지 않는다.
<!-- deep-goal:codex:end -->

무인수 호출 시 대화 진입: "무엇을 끝까지 진행하고 싶나요?" (→ [6단계 절차 요약](#6단계-절차-요약) 실행)

---

## Prerequisites

이 스킬은 sibling `deep-goal-workflow` 스킬과 함께 동작한다. entry만 workflow를 로드하며, 이미
로드된 workflow가 자기 자신을 다시 로드하지 않는다. 호스트별 로드 규칙은 위 paired section이
정본이다.

**Cross-platform self-containment**: 타 플랫폼에서 `deep-goal-workflow` 자동 로드가 약해도 동작하도록, 아래 핵심 규칙을 **의도적으로 인라인 보존**한다. 이는 `deep-goal-workflow`와의 의도적 duplication이며, 변경 시 양쪽을 동기화해야 한다.

<!-- SYNC: mirrors deep-goal-workflow + ../deep-goal-workflow/references/condition-compiler.md(render decision·self-report caveat) + ../deep-goal-workflow/references/platform-matrix.md + ../deep-goal-workflow/references/fitness-rubric.md(부재 또는 부실) — 변경 시 동기화 -->

---

## 활성화 모델 (인라인 핵심)

네이티브 `/goal`은 플러그인/스킬이 프로그래밍적으로 **자동 호출 불가**다(docs/superpowers/specs/2026-05-27-deep-goal-design.md §3 검증 완료).

deep-goal의 역할은 완성된 `/goal` 조건을 제시하는 데서 끝나고, **활성화 트리거는 사용자가 직접 누른다**. 활성화 마찰은 "한 줄 복사-붙여넣기"로 최소화한다.

---

## 적합성 3판정 (인라인 핵심)

요청을 받으면 다음 기준으로 분류한다:

| 판정 | 신호 | 처리 |
|---|---|---|
| ✅ **적합** | 단일 목표 · 검증 가능한 종료조건 · 적정 크기 · 진행 증명 루프 존재 | 4~6단계 직행 |
| 🔧 **재구성** | 종료조건 모호 / 범위 과대 / 증명 방법 부재 또는 부실(주관·비실행·미확인) | 측정 가능화·분해·커맨드 식별 제안 |
| ⛔ **반려** | 검증 불가 주관 목표 / 단발성 / 무관한 잡다 목록 | 이유 + 대안(`/loop`·일반 작업) 제시 |

상세 기준은 `../deep-goal-workflow/references/fitness-rubric.md` 참조.

---

## 컴파일 4요소 + 평가자 표면화 규칙 (인라인 핵심)

### 공통 4요소

모든 플랫폼에서 컴파일된 조건은 다음 4요소를 포함해야 한다:

1. **측정 가능한 종료상태** — 무엇이 달성되면 완료인가 (테스트 통과, 빌드 exit code 등)
2. **증명 방법** — 종료상태를 어떻게 확인하는가 (커맨드 또는 아티팩트)
3. **불변 제약** — goal 진행 중 바뀌면 안 되는 것 (API 시그니처 유지, 브랜치 보호 등)
4. **상한** — 턴 또는 시간 한도 (`or stop after N turns`)

### 평가자 표면화 규칙 (필수)

Claude의 `/goal` 평가자(Haiku 모델)는 **도구를 호출하지 않으며**, 대화에 **표면화된 출력**만으로 종료 조건 충족 여부를 판정한다.

**따라서 모든 컴파일된 조건에는 다음 지침을 반드시 포함한다:**

> "각 단계/게이트 결과를 대화에 명시 보고하라."

이 지침이 없으면 Claude가 내부적으로 검증을 완료해도 평가자가 종료를 판정하지 못한다. 대화에 명시 보고된 결과가 있어야 종료 판정이 가능하다.

**신뢰 한계(정직 caveat)**: 이 표면화 출력은 평가자가 독립 검증하지 않는 self-report다. 고위험 goal은 검증가능 anchor(commit SHA·CI URL·deep-work `session-receipt.json`)를 우선한다.

**증명 방법 verifiability**: prep-scout가 confirmed한 커맨드/객관 아티팩트만 ready-to-run으로 제시하고, unconfirmed(추정)·주관 placeholder는 "⚠️ 미검증" 표시 + 재구성 유도(`../deep-goal-workflow/references/condition-compiler.md` render decision과 동기).

---

## 플랫폼 분기 요약 (인라인 핵심)

| 플랫폼 | 핵심 규칙 |
|---|---|
| **Claude Code** | 평가자가 도구 없이 대화 표면화 출력만 판정 → 각 단계 결과 명시 보고 필수, 4,000자 한도 준수, `or stop after N turns` 상한 권장 |
| **Codex** | contract 형태(달성/변경금지/검증/종료) + 체크포인트·진행 로그, `pause`/`resume` 활용 안내, PLAN.md 적극 활용 |

**PLAN.md 분리 임계치**: 조건이 ~2,800자 초과 예상 또는 순차 게이트 3개 이상이면 시퀀스를 PLAN.md로 분리하고 조건을 압축한다.

상세 분기표는 `../deep-goal-workflow/references/platform-matrix.md` 참조.

---

## 6단계 절차 요약

상세 절차는 `deep-goal-workflow` 스킬 참조. 아래는 인라인 요약:

| 단계 | 작업 |
|---|---|
| ① **감지** | 요청 파싱 / 플랫폼(Claude·Codex) / git 여부 / 설치된 deep-* 플러그인 감지 |
| ② **적합성 평가** | fitness-rubric 적용 → 적합/재구성/반려 판정 |
| ③ **재구성 대화** | 균형 게이트 — 종료조건 보강·범위 분해·증명 커맨드 식별 / 구조적 부적합 시 반려 + 대안 |
| ④ **레시피 매칭** | 감지된 플러그인으로 시너지 레시피 제안, 없으면 단발 goal |
| ⑤ **사전 준비물 탐색** | Glob/Read로 읽을 파일·증명 커맨드·불변 제약 발굴. 파일 탐색 도구 없으면 사용자에게 컨텍스트 요청 + 결과를 '미검증(unverified)' 표시 + ready-to-run 단정 금지 |
| ⑥ **컴파일 + 제시** | 4요소 + 표면화 지침 + 플랫폼 분기 적용 → 복사용 코드블록 + 활성화 안내 |

---

## 무인수 대화 진입

`/deep-goal` 또는 `$deep-goal:deep-goal`을 인수 없이 호출하면 **AskUserQuestion**을 사용하여 목표를 질문한다:

> **"무엇을 끝까지 진행하고 싶나요? 목표를 설명해주시면 goal 조건으로 컴파일해 드립니다."**

사용자의 응답을 받아 6단계 절차를 시작한다.
