# condition-compiler — 조건 컴파일 규칙

deep-goal의 6단계(컴파일 + 제시)에서 사용한다. Claude Code와 Codex 모두 같은 Node proof evaluator를
사용하고, 결과의 presentation만 플랫폼에 맞게 바꾼다.

---

## 공통 4요소

| # | 요소 | 설명 |
|---|---|---|
| 1 | **측정 가능한 종료상태** | 무엇이 달성되면 완료인가 |
| 2 | **증명 방법** | 종료상태를 어떤 커맨드나 artifact로 확인하는가 |
| 3 | **불변 제약** | 진행 중 바뀌면 안 되는 계약 |
| 4 | **상한** | 구체적인 turn/time 한도 |

## 평가자 표면화 규칙

Claude `/goal` 평가자는 도구를 호출하지 않고 대화에 표면화된 출력만 판정한다. 따라서 모든 Claude
조건에는 "각 단계/게이트 결과를 대화에 명시 보고하라"는 지침을 넣는다. 이 출력은 평가자가
**독립 검증**하지 않는 self-report이므로, 고위험 proof는 commit SHA, CI URL, deep-work
`session-receipt.json` 같은 외부 확인 anchor에 고정한다.

Codex는 자체 판정하지만 같은 4요소와 proof class를 사용하고 단계별 checkpoint를 남긴다.

## 4,000자 한도와 PLAN.md 분리

Claude 조건은 현재 버전 기준 **4,000자** 한도다. 약 2,800자를 넘거나 순차 gate가 3개 이상이면
시퀀스를 `PLAN.md`로 분리한다. Claude에는 `or stop after <구체 숫자> turns`, Codex에는 checkpoint와
필요한 `pause`/`resume` 지침을 제시한다.

## Portable evaluate-proof contract

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구한다. prep-scout가 current request
working memory에 보관한 baseline과 proof text를 shell string이 아닌 분리된 argv로 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

`scout.git.baselineHead`가 null 또는 missing이거나 project가 non-Git이면 `--baseline`을 생략한다.
그 경우 commit/file freshness는 unconfirmed로 유지한다. plugin-root current working directory나 Git
Bash에 의존하지 않는다.

성공 시 stdout은 JSON object 한 개와 마지막 newline만 포함한다:

```json
{
  "proofClass": "confirmed-command | objective-artifact | unconfirmed-command | unconfirmed-artifact | subjective-placeholder",
  "rendered": "<safe rendered proof line>"
}
```

exit 2는 argument contract 오류, exit 1은 cwd/permission 등 operational 오류다. parse 실패, non-zero
exit, unknown `proofClass`는 fail-closed로 처리해 **미검증(unverified)** 으로 표시하고 ready-to-run으로
단정하지 않는다.

## Five-class decision table

| class | 판정 근거 | presentation |
|---|---|---|
| `confirmed-command` | scout가 실제 manifest에서 확인한 command와 proof text가 일치 | ready-to-run |
| `objective-artifact` (commit) | commit이 baseline의 strict descendant이고 현재 `HEAD`까지 도달 | ready-to-run |
| `objective-artifact` (file) | declared digest equals the committed `HEAD` blob, path Added/Modified in `baseline..HEAD`, and no post-commit dirty mutation | ready-to-run |
| `unconfirmed-command` | command shape지만 scout가 확인하지 못했거나 detected command와 불일치 | `⚠️ 미검증` + 실행 전 존재 확인 |
| `unconfirmed-artifact` | URL, bare/stale file, digest mismatch, baseline 자신/조상/side branch, null/missing/non-Git baseline | `⚠️ 미검증` + freshness 확인 |
| `subjective-placeholder` | 수동 확인, 완료되면, 적절히 같은 실행 불가 산문 | `⚠️ 미검증(주관)` + 재구성 |

runtime의 `classifyProofLine` Node classifier는 산문이 class를 주입하지 못하게 하고,
위 다섯 class 외 결과를 fail-closed로 `미검증` 처리한다. `confirmed-command`와
`objective-artifact`만 ready-to-run으로 제시할 수 있다.

## Manual file-tool fallback

runtime을 사용할 수 있어도 project file tool이 제한되면 사용자가 제공한 command/artifact를 그대로
실행 가능한 사실로 간주하지 않는다. inferred command/artifact는 모두 **미검증(unverified)** 으로
표시한다. null/missing/non-Git baseline에서 file 또는 SHA proof를 objective로 승격하지 않는다.

runtime 자체를 사용할 수 없으면 proof text, scout status, baseline을 임의로 재구성하지 않는다.
사용자에게 확인 자료를 요청하고 fail-closed placeholder를 렌더한다. ready-to-run 표시는 금지한다.

## 플랫폼별 렌더링

### Claude Code

```text
<측정 가능한 종료상태>를 달성한다.
증명: <Node evaluator의 rendered 값>.
불변 제약: <확인된 제약>.
각 단계/게이트 결과를 대화에 명시 보고할 것.
or stop after 30 turns.
```

### Codex

```text
[달성] <측정 가능한 종료상태>
[변경 금지] <확인된 제약>
[검증] <Node evaluator의 rendered 값>
[종료] 검증 통과 시 완료하고 각 단계 checkpoint를 기록한다.
```

## 컴파일 절차 요약

1. 공통 4요소를 채운다.
2. absolute `evaluate-proof` argv로 proof를 분류하고 JSON shape를 검증한다.
3. `confirmed-command`/`objective-artifact`만 ready-to-run으로 유지하고 나머지는 미검증으로 렌더한다.
4. Claude에는 evaluator 표면화 규칙, Codex에는 checkpoint 규칙을 적용한다.
5. 2,800자 또는 gate 3개 임계치를 넘으면 `PLAN.md`로 분리한다.
6. 근거 요약, 복사용 조건, 사용자가 직접 실행할 `/goal` 활성화 안내를 제시한다.
