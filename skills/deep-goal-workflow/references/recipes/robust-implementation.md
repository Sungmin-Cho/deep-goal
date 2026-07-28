# 레시피: robust-implementation

deep-work의 게이트 강제 phase 진행과 deep-review-loop의 수렴 게이트를 엮어, 검증된 구현을 goal로 진행한다. **핵심 제약: 이 레시피는 무인 자율이 아니다.** Research·Plan(그리고 진입했다면 Spec) 각각의 문서 승인, phase 경계마다의 Exit Gate, 그리고 review 루프의 일부 확인 질문이 모두 사용자 입력을 기다린다. 이 제약은 주의 문구가 아니라 컴파일된 조건 자체에 반영된다.

---

## 트리거 (감지 조건)

다음 두 플러그인이 모두 감지될 때 이 레시피를 제안한다:

- `deep-work` — Brainstorm → Research → Spec → Plan → Implement → Test → Integrate 일곱 단계 워크플로우. Spec은 risk class medium|high|critical에서만 자동 진입하고 Integrate는 선택이므로, 실제 진입 phase는 세션마다 다르다
- `deep-review` 또는 `deep-review-loop` — 코드 리뷰 자동 수렴 루프

`deep-work`만 감지되고 `deep-review`가 없는 경우: review 게이트를 생략한 축소판을 사용자에게 확인 후 제안한다.

---

## 전제 (필요 플러그인)

| 플러그인 | 역할 |
|---|---|
| `deep-work` | Brainstorm→Research→Spec→Plan→Implement→Test→Integrate 일곱 단계 실행 (Spec은 risk-gated, Integrate는 선택) |
| `deep-review` / `deep-review-loop` | Implement 완료 직후 리뷰 수렴 게이트 |

두 플러그인이 없으면 단발 goal 폴백을 사용한다.

---

## 시퀀스

```
[1] deep-work Research 단계 → ★ research.md 승인 (사용자 입력) ★
    → [Exit Gate: 진행 / 재실행 / 일시정지]
[2] deep-work Spec 단계 — risk class medium|high|critical에서만 자동 진입
    (low는 사용자가 명시적으로 opt-in할 때만; risk class는 task difficulty가
     아니라 risk-profile-cli가 task 내용·difficulty·policy를 합쳐 산출한다)
    → spec-contract 검증 → ★ spec 승인 (사용자 입력) ★
    → [Exit Gate: 진행 / 재실행 / 일시정지]
[3] deep-work Plan 단계 → ★ plan.md 승인 (사용자 입력) ★
    → [Exit Gate: 진행 / 재실행 / 일시정지]
[4] deep-work Implement 단계
    → deep-review-loop(--max=3): APPROVE + Critical·Warning 0건까지 반복
      (privacy·mutation 소유권·pre-staged·DEFER 질문은 사용자에게 그대로 감)
    → [Exit Gate: 진행 / 재실행 / 일시정지]
[5] deep-work Test 단계
    → 테스트 전체 통과 확인
    → [Exit Gate 4지선다: Integrate / Finish / Test 재실행 / 일시정지]
[6] deep-work Integrate 단계 (--skip-integrate로 스킵 가능)
    → 다음 단계 추천 루프 (interactive recommendation loop 자체가 게이트 역할)
```

**게이트 정확도 기술 (deep-work-workflow/SKILL.md 대조):**

- **문서 승인**: deep-work-workflow/SKILL.md는 "Plan 승인이 유일한 필수 인터랙션"이라고 적지만, orchestrator는 Research 완료 후에도(§Review + Approval Workflow → `research_approved`) Spec 완료 후에도 같은 승인 UX를 실행한다. 즉 승인 지점은 Research·Plan에 더해, Spec에 진입한 세션이면 Spec까지다. goal은 턴 간 프롬프트를 없애줄 뿐 이 지점들은 사용자 입력을 요구한다.
- **Exit Gate**: Research·Plan·Implement(그리고 진입 시 Spec) 완료 직후 각각 "진행 / 재실행 / 일시정지" 확인. Test 완료 후에는 4지선다 Exit Gate(Integrate 진행 / Integrate 건너뛰고 Finish / Test 재실행 / 일시정지)가 있다.
- **Integrate**: Exit Gate 확인 방식 대신 **interactive recommendation loop 자체가 게이트 역할**을 한다. `--skip-integrate`로 스킵 가능하며 `/deep-integrate`로 명시적 재진입도 가능.
- **deep-review-loop**: `--max=N`이 Review 호출 횟수를 제한한다(생략 시 구현 스코프 기본 5회). 루프 진입 고지가 **일반 응답 확인만** 미리 승인하며 privacy 경고·mutation 소유권·pre-staged 확인·DEFER 선택은 그대로 살아 있으므로, 완전 무인 루프로 가정하지 않는다. 수렴 종료는 "APPROVE + Critical·Warning 0건 + deferred receipt 항목 전부 검증"이고, 상한 도달은 수렴이 아닌 정지다.

---

## 종료조건

다음이 **모두** 충족되어야 완료:

1. deep-work 게이트 phase(Research / Plan / Implement / Test) 완료. **Spec은 해당 세션이 실제로 진입한 경우에만** 종료조건에 포함한다 — low risk 세션은 Spec에 진입하지 않으므로 무조건 요구하면 영원히 충족되지 않는다. (Integrate는 `--skip-integrate`로 스킵 가능)
2. **진입한 phase의 승인 게이트(Research·Plan 문서 승인, Spec 진입 시 Spec 승인, phase 경계 Exit Gate) 통과가 대화에 보고됨** — 이 게이트는 종료조건의 일부이며, 보고 없이는 평가자가 종료를 판정할 수 없다
3. 최종 deep-review-loop이 수렴 종료 — verdict APPROVE이고 Critical·Warning 0건이며 deferred receipt 항목이 전부 검증됨 (상한 도달로 인한 정지는 충족이 아니다)
4. 테스트 전체 통과
5. **검증가능 anchor 확보**: `/deep-finish`를 종료 스텝으로 실행해 `$WORK_DIR/session-receipt.json`(M3 envelope: producer=deep-work, artifact_kind=session-receipt, schema.name=session-receipt)을 emit한다. 다음 세 가지를 대화에 보고한다 — payload의 **`x-test-verified: true`**, 이 receipt가 **현재 goal 세션**에서 나왔음(payload `session_id`가 현재 세션과 일치하고, receipt를 읽은 경로가 이 세션의 work dir), **이전 세션 산출물이 아님**(stale 거부 — payload `started_at`/`finished_at` 최신성). 순수 self-report paste보다 이 tamper-evident anchor를 우선한다.

> **receipt 존재만으로는 테스트 통과가 증명되지 않는다.** deep-finish는 test가 실패한 세션에서도 receipt를 emit하고, `outcome`을 그대로 둔 채 payload에 `x-test-verified: false`만 기록한다. 따라서 `x-test-verified: true`를 종료조건에 명시하지 않으면 이 anchor는 self-report보다 나을 게 없다.

---

## 컴파일된 `/goal` 예시

### Claude (gate-aware, 평가자 표면화 포함)

```
deep-work 세션으로 <기능>을 Research→(risk class medium 이상이면 Spec)→Plan→Implement→Test 순으로 진행한다.
Research·Plan(그리고 Spec에 진입했다면 Spec) 각 문서 승인과 phase 경계의 Exit Gate에서는 사용자에게 확인을 요청하고, 확인이 대화에 보고된 뒤에만 다음 단계로 진행한다(승인 전 자율 진행 금지 — 이 게이트들은 종료조건의 일부다).
Implement 완료 직후 deep-review-loop(--max=3)를 돌려 APPROVE + Critical·Warning 0건까지 대응한다. 루프가 privacy·mutation 소유권·pre-staged·DEFER 확인을 물으면 사용자에게 그대로 전달한다.
Test 통과 후 `/deep-finish`를 실행해 `session-receipt.json`(producer=deep-work·artifact_kind=session-receipt)을 emit하고, payload의 `x-test-verified` 값과 그 receipt가 현재 세션 산출물임(이전 세션 아님)을 대화에 보고한다.
종료조건: 진입한 모든 phase 완료 AND 그 phase들의 승인 게이트(Research·Plan 문서 승인, Spec에 진입했다면 Spec 승인, Exit Gate) 통과가 보고됨 AND 최종 deep-review-loop이 APPROVE + Critical·Warning 0건으로 수렴(상한 도달 정지는 불인정) AND `/deep-finish` session-receipt.json 확보(현재 세션·stale 아님) AND 그 payload의 `x-test-verified`가 true.
각 단계 결과(phase 전환·승인 게이트·review verdict·테스트 출력)를 대화에 명시적으로 보고할 것.
or stop after 40 turns.
```

### Codex (contract 형태)

```
목표: deep-work로 <기능>을 Research→(risk class medium 이상이면 Spec)→Plan→Implement→Test 순으로 구현한다.

달성 조건:
- deep-work 게이트 phase 완료 (Research / Plan / Implement / Test, 그리고 Spec에 진입했다면 Spec)
- Research / Plan 문서 승인 통과 보고됨 (각각 사용자 승인 필수). Spec에 진입했다면 Spec 승인도 포함
- Implement Exit Gate 통과 보고됨 (사용자 확인 필수)
- Test Exit Gate 통과 보고됨
- deep-review-loop(--max=3)이 APPROVE + Critical·Warning 0건으로 수렴 (상한 도달 정지는 불인정)
- 테스트 전체 통과
- /deep-finish 실행으로 session-receipt.json 확보, payload의 x-test-verified가 true (아래 검증가능 anchor 계약)

변경 금지: <불변 제약>
검증: <테스트 커맨드> 전체 통과
검증가능 anchor: Test 통과 후 `/deep-finish`가 emit하는 `$WORK_DIR/session-receipt.json`(producer=deep-work, artifact_kind=session-receipt, schema.name=session-receipt)을 증명으로 참조. payload의 `x-test-verified`가 true인지, 이 receipt가 현재 goal 세션 산출물인지(payload session_id 일치 + 이 세션의 work dir 경로에서 읽음), 이전 세션 아님(stale 거부 — payload started_at/finished_at 최신성)을 진행 로그에 기록. receipt는 test 실패 세션에서도 emit되므로 x-test-verified 확인이 필수다. 순수 self-report 로그보다 이 tamper-evident anchor를 우선.

각 phase 전환·게이트 결과를 진행 로그에 명시 기록.
pause 지점: Research·Plan(진입 시 Spec) 문서 승인 요청, Exit Gate 확인, review 루프의 privacy·mutation·DEFER 질문.
```

---

## 주의 (현실적 제약)

### 완전 무인 자율 불가

goal은 *턴 간 프롬프트*를 없애줄 뿐, 사용자 입력을 기다리는 지점 자체를 없애지 않는다. 이 레시피에는 그런 지점이 최소 세 종류 있다 — **Research·Plan 문서 승인(Spec에 진입했다면 Spec 승인도)**, **phase 경계마다의 Exit Gate**, **deep-review-loop이 privacy·mutation 소유권·pre-staged·DEFER를 물을 때**. 이 점을 사용자에게 사전 고지한다.

`deep-work-workflow/SKILL.md`는 "Plan 승인이 유일한 필수 인터랙션"이라고 적지만 그 문장은 orchestrator보다 오래됐다. orchestrator는 Research와 Spec 완료 후에도 같은 문서 승인 UX를 실행한다. 승인 지점을 Plan 하나로 가정한 조건은 나머지 두 곳에서 멈춘 채 상한만 소진한다.

### Exit Gate 정확한 위치

- Research 완료 직후 → 문서 승인 → Exit Gate (진행 / 재실행 / 일시정지)
- Spec 완료 직후(진입한 세션에 한해) → spec-contract 검증 + 승인 → Exit Gate (진행 / 재실행 / 일시정지)
- Plan 완료 직후 → 문서 승인 → Exit Gate (진행 / 재실행 / 일시정지)
- Implement 완료 직후 → Exit Gate (진행 / 재실행 / 일시정지)
- Test 완료 직후 → Exit Gate 4지선다 (Integrate 진행 / Integrate 건너뛰고 Finish / Test 재실행 / 일시정지)
- Integrate: Exit Gate 형식이 아닌 **interactive recommendation loop 자체가 게이트 역할** (deep-work-workflow/SKILL.md 명세)

### deep-review-loop 상한

`--max=N`은 Review 호출 횟수를 센다(Respond 작업은 세지 않는다). 생략하면 구현 스코프는 5회가 기본값이다. `--max=3`은 예시값이니 리뷰 난이도에 맞게 조정하고, goal 상한 턴 수와 충돌하지 않게 여유를 둔다.

**상한 도달은 수렴이 아니다.** 루프의 정지 조건은 일곱 가지이고 그중 수렴은 하나뿐 — 구현 스코프에서는 "APPROVE + Critical·Warning 0건 + deferred receipt 항목 전부 검증", 문서 스코프에서는 `READY_FOR_IMPLEMENTATION`이다. 상한 도달·비교 라운드 정체·운영 실패·사용자 DEFER·신뢰 리뷰어 0명은 모두 미수렴 정지다. 종료조건을 "루프가 끝나면"으로 쓰면 이 다섯 가지를 성공으로 받아들이게 된다.

### 평가자 표면화 없으면 종료 판정 불가

Claude 평가자(Haiku)는 도구를 호출하지 않고 대화에 표면화된 출력만으로 판정한다. "각 단계 결과를 대화에 명시 보고"가 없으면 내부적으로 완료해도 평가자가 종료를 판정하지 못한다. 이 지침이 조건에 반드시 포함된 이유다.

### 검증가능 anchor 우선 (self-report 신뢰 한계)

Haiku 평가자는 self-report를 독립 검증하지 않는다. `/deep-finish`가 emit하는 `session-receipt.json`(tamper-evident M3 envelope)을 증명 방법으로 컴파일한다:

- **경로**: `$WORK_DIR/session-receipt.json`
- **identity**: producer=deep-work, artifact_kind=`session-receipt`, schema.name=`session-receipt`
- **테스트 검증 신호**: payload의 `x-test-verified`. deep-finish는 emit 시점에 세션 state의 `test_passed` 마커를 읽어 이 필드를 찍고, **값이 false여도 receipt를 emit하며 `outcome`을 고쳐 쓰지 않는다**. 따라서 receipt의 존재가 아니라 `x-test-verified: true`가 anchor다.
- **현재-세션 바인딩**: payload의 `session_id`가 현재 goal 세션과 일치할 것. work dir는 payload 필드가 아니라 receipt를 읽은 **경로**이므로, 둘을 따로 확인한다
- **stale 거부**: 이전 세션 receipt 불인정 — receipt payload의 `started_at`/`finished_at` 최신성으로 확인한다. `test_completed_at`은 세션 state 필드이고 receipt payload에는 없다.

세션 내부 state 필드(`test_passed`)를 직접 읽어 anchor로 쓰지 않는다(가변 state는 anti-tamper 부적격). receipt에 봉인된 `x-test-verified`가 그 마커의 검증 가능한 형태다.
