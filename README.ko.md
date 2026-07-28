[English](./README.md) | **한국어**

# deep-goal

![version](https://img.shields.io/github/package-json/v/Sungmin-Cho/claude-deep-goal?label=version)
![license](https://img.shields.io/github/license/Sungmin-Cho/claude-deep-goal)
[![part of deep-suite](https://img.shields.io/badge/part%20of-deep--suite-5b8def)](https://github.com/Sungmin-Cho/claude-deep-suite)

Goal 조건 컴파일러 — 장기 작업 요청을 평가하고, 형태를 다듬고, 사전 준비물을 탐색해, Claude Code와 Codex의 네이티브 `/goal`에 그대로 붙여 넣을 수 있는 완성된 조건을 컴파일해 제시합니다.

[deep-suite](https://github.com/Sungmin-Cho/claude-deep-suite) 에코시스템의 일원으로, 요청을 실행 가능한 `/goal`로 바꿔 주는 "오케스트레이션 진입로"입니다. 릴리스 이력은 [CHANGELOG](CHANGELOG.md)를 참고하세요.

---

## 핵심 제약

> **네이티브 `/goal`은 플러그인이 자동으로 호출할 수 없습니다.**

deep-goal은 요청을 평가하고, 필요하면 재구성하고, 컴파일된 조건을 **제시**합니다. 사용자가 이를 복사해 `/goal <조건>`을 직접 입력해 활성화합니다 — 한 줄 붙여넣기, 별도 절차 없음.

이것은 의도된 설계입니다: 네이티브 `/goal` UI·평가자·세션 재개·자동 클리어가 플랫폼 기본 상태 그대로 보존됩니다.

---

## 설치

### 방법 1 — 로컬 clone (항상 동작, 마켓플레이스 등록 불필요)

```text
# Claude Code
claude plugin add https://github.com/Sungmin-Cho/claude-deep-goal.git

# Codex — Codex 설정에서 로컬 경로를 plugin 디렉토리로 추가
```

clone 즉시 동작합니다. 마켓플레이스 등록 여부와 무관합니다.

### 방법 2 — 마켓플레이스 설치 (deep-suite 등록 완료 후)

> **전제**: deep-goal이 deep-suite 마켓플레이스에 등록되어야 합니다(`.claude-plugin/marketplace.json`에 40자 merge SHA 업데이트). 이 단계는 이 저장소가 `main`에 머지된 이후 수행됩니다.

등록 완료 후:
```text
# 1단계 — deep-suite 마켓플레이스 소스 추가 (미추가 시)
/plugin marketplace add Sungmin-Cho/claude-deep-suite

# 2단계 — 마켓플레이스에서 deep-goal 설치
# Claude Code
/plugin install deep-goal@claude-deep-suite

# Codex — deep-suite push 완료 후 마켓플레이스 미러 이용 가능
$deep-goal:deep-goal
```

---

## 사용법

### Claude Code

```
/deep-goal <장기 작업>
```

인수 없이 실행하면 deep-goal이 "무엇을 끝까지 진행하고 싶나요?"라고 묻습니다.

### Codex

```
$deep-goal:deep-goal <장기 작업>
```

### Claude Code SDK / 프로그래밍 호출

```js
Skill({ skill: "deep-goal:deep-goal", args: "<task>" })
```

이 프로그래밍 호출은 Claude Code/Agent SDK 기능입니다. Codex는 네이티브
`$deep-goal:deep-goal` 진입으로 설치된 스킬을 로드하며 Claude의 `Skill({...})` API를 호출하도록
안내하지 않습니다.

---

## 런타임 호환성

- **런타임 하한**: Node.js 22가 휴대 가능한 사전 준비물 `scout`, 증명 `evaluate-proof`, 릴리스
  검증 경로를 실행합니다.
- **운영체제**: Linux, macOS, 네이티브 Windows 11을 지원하며 Git Bash가 필요하지 않고 POSIX
  유틸리티를 요구하지 않습니다.
- **공유 동작**: Claude Code `/deep-goal`과 Codex `$deep-goal:deep-goal`은 동일한 absolute Node
  helper를 해석하고 project root를 별도 인자로 전달합니다.
- **정직한 degraded mode**: 런타임 부재, project 접근 실패, null/non-Git baseline은 fail-closed
  **미검증(unverified)** 상태를 유지하며 ready-to-run으로 승격하지 않습니다.

---

## 6단계 워크플로우

| 단계 | 동작 |
|---|---|
| **① 감지** | 요청 파싱; 플랫폼(Claude / Codex), git 여부, 설치된 deep-suite 형제 플러그인 감지 |
| **② 적합성 평가** | `fitness-rubric` 적용 → 적합 / 재구성 필요 / 반려 |
| **③ 재구성** | 필요 시: 종료조건 명확화, 범위 분해, 증명 커맨드 식별; 구조적 부적합이면 이유와 대안(`/loop`, 일반 작업)을 제시하며 반려 |
| **④ 레시피 매칭** | 형제 플러그인 감지 시 시너지 레시피 제안; 없으면 단발 goal로 폴백 |
| **⑤ 사전 준비물 탐색** | 코드베이스를 인라인 스캔: 먼저 읽을 파일·증명 커맨드·불변 제약 발굴 |
| **⑥ 컴파일 + 제시** | 플랫폼 맞춤 `/goal <조건>`을 복사용 코드블록 + 근거 + 활성화 안내로 제시 |

---

## 시너지 레시피

| 레시피 | 감지 조건 | 요지 |
|---|---|---|
| **robust-implementation** | deep-work + deep-review 감지 | Research→Plan→Implement→Test 단계 진행(risk class medium 이상이면 Spec 추가), 문서 승인 게이트 + deep-review-loop 수렴(APPROVE + Critical·Warning 0건) + 테스트 통과를 종료조건으로 |
| **autonomous-evolution** | deep-evolve 감지 | 목표 fitness metric 도달 또는 상한까지 자율 실험 루프 |
| **ship-and-document** | deep-docs + deep-wiki 감지 | 구현 완료 → (deep-review 있으면 리뷰 게이트 먼저) → docs 정비 → `/wiki-ingest`; 영속 작업은 리뷰 승인 이후 |

레시피가 매칭되지 않으면 단발 goal을 직접 컴파일합니다.

---

## 컴파일 4요소

deep-goal이 생성하는 모든 조건에는 다음이 포함됩니다:
1. **측정 가능한 종료상태** — 테스트 결과, 빌드 exit code, 파일 개수, 빈 큐 등
2. **증명 방법** — 완료를 증명하는 커맨드 또는 아티팩트
3. **불변 제약** — 진행 중 바뀌면 안 되는 것
4. **상한** — `or stop after N turns`

Claude용 조건에는 항상 "각 단계 결과를 대화에 명시적으로 보고"가 포함됩니다 — Claude 평가자(Haiku)는 도구를 호출하지 못하고 대화에 표면화된 출력만 판단하기 때문입니다.

---

## deep-suite 링크

| 플러그인 | 역할 |
|---|---|
| [deep-goal](https://github.com/Sungmin-Cho/claude-deep-goal) | 이 플러그인 — goal 조건 컴파일러 (메타-Guide) |
| [deep-work](https://github.com/Sungmin-Cho/claude-deep-work) | 단계별 구현 오케스트레이터 |
| [deep-review](https://github.com/Sungmin-Cho/claude-deep-review) | APPROVE 판정 코드 리뷰 루프 |
| [deep-evolve](https://github.com/Sungmin-Cho/claude-deep-evolve) | 자율 fitness metric 실험 루프 |
| [deep-docs](https://github.com/Sungmin-Cho/claude-deep-docs) | 문서 정비 에이전트 |
| [deep-wiki](https://github.com/Sungmin-Cho/claude-deep-wiki) | 지식 베이스 수집·관리 |
| [deep-suite (마켓플레이스)](https://github.com/Sungmin-Cho/claude-deep-suite) | 통합 마켓플레이스 및 Harness 매트릭스 |

---

## 라이선스

MIT — [LICENSE](LICENSE) 참고.
