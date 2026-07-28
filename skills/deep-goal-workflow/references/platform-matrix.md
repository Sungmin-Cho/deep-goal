# platform-matrix — Claude vs Codex 분기표

deep-goal의 6단계(컴파일 + 제시)에서 플랫폼별 조건 문구를 결정할 때 사용한다.

---

## Shared runtime invariant

Host presentation differs, but both hosts use the same shared Node `scout` and `evaluate-proof` semantics.
각 host는 현재 로드된 `SKILL.md`의 절대 경로에서 plugin root를 구하고, absolute project root와 proof
text를 별도 argv로 전달한다. `scout.git.baselineHead`는 current request memory에만 보관해 non-null일
때 `evaluate-proof --baseline`으로 그대로 전달한다. null/missing/non-Git baseline은 fail-closed
`미검증(unverified)` 상태이며 ready-to-run으로 단정하지 않는다.

## 플랫폼 비교 표

| 항목 | Claude Code `/goal` | Codex `/goal` |
|---|---|---|
| **종료 판정 주체** | 별도의 작은 빠른 모델(기본 Haiku)이 매 턴 후 조건 충족을 yes/no + 이유로 평가 | Codex 자신이 종료 조건 도달을 확신하면 멈춤 |
| **평가자 도구 사용** | **불가** — 대화에 표면화된 출력만 판단 | 자체 판단 (표면화 제약 없음) |
| **조건 문자 한도** | **4,000자** (현재 버전 기준, 변동 가능) | 명시 한도 없음 (PLAN.md 적극 활용 권장) |
| **상한 표현** | `or stop after N turns` | `pause`/`resume` + 체크포인트 |
| **구현 기반** | session-scoped prompt-based Stop hook의 wrapper | 별도 feature (`features.goals`) |
| **제어 커맨드** | `set` / 상태 / `clear` | `set` / 상태 / `pause` / `resume` / `clear` |
| **활성화 조건** | v2.1.139+, trust 수락, 훅 시스템 | `config.toml`의 `[features] goals = true` |
| **세션 재개** | `--resume`/`--continue`로 복원 (조건 유지, 카운터 리셋) | 명시 없음 |
| **PLAN.md 활용** | 복잡 조건 분리 시 선택적 | **적극 활용 권장** |
| **진행 로그** | 대화 표면화 의존 | 체크포인트·진행 로그 지침 권장 |

---

## 컴파일 규칙 — Claude 분기

Claude 평가자 제약 때문에 다음 규칙을 반드시 적용한다:

1. **"Claude 출력으로 증명 가능"하게 문구화**: 평가자가 도구를 못 쓰므로, 조건은 Claude가 대화에 출력할 수 있는 것으로 명시 (파일 목록, 커맨드 출력, 상태 보고 등)
2. **게이트/단계 결과를 대화에 명시 보고하라는 지침 필수**: 평가자가 판정하려면 해당 정보가 대화에 있어야 함
3. **4,000자 한도 준수**: ~2,800자 또는 순차 게이트 3개 이상이면 PLAN.md 분리
4. **`or stop after N turns` 상한 권장**: 무한 루프 방지
5. **self-report 신뢰 한계 고지**: Haiku 평가자는 대화에 표면화된 self-report만으로 판정하며 **독립 검증하지 않는다**. 고위험 goal은 증명을 외부 확인 가능 anchor(commit SHA, CI run URL, deep-work `session-receipt.json`)에 고정하도록 안내한다.

### Claude 컴파일 예시 (단발)

```
이 저장소의 모든 ESLint 경고를 수정한다.
종료조건: `npm run lint` 경고 0으로 종료.
불변 제약: 기존 테스트 파일 변경 금지.
완료 시 `npm run lint` 출력을 대화에 그대로 보고할 것.
or stop after 20 turns.
```

### Claude 컴파일 예시 (레시피 기반, PLAN.md 분리)

PLAN.md 내용:
```markdown
# Plan — robust-implementation

## Phase 1: Research
- 요구사항 분석, 기존 코드 파악
- 완료 보고: "Research 완료 — 주요 발견: ..."

## Phase 2: Plan (승인 게이트)
- 구현 계획 작성
- 사용자 승인 요청: "Plan을 검토해 주세요. 승인하시겠습니까?"
- 승인이 대화에 보고된 뒤에만 Phase 3 진행

## Phase 3: Implement
- 계획에 따라 구현
- 완료 보고: "Implement 완료"

## Phase 3(Implement) 완료 직후: deep-review-loop(--max=3)
- APPROVE까지 반복
- 결과 보고: "review verdict: APPROVE"

## Phase 4: Test
- 전체 테스트 실행
- 완료 보고: `npm test` 출력 그대로
```

조건:
```
PLAN.md 단계대로 완수. 각 게이트(Plan 승인·review verdict)를 대화에 보고한 뒤에만 다음 단계 진행.
종료조건: 최종 deep-review-loop APPROVE AND `npm test` 전체 통과 AND 각 게이트 통과 보고 완료.
or stop after <N> turns.
(N을 구체 숫자로 치환 — 예: 40)
```

---

## 컴파일 규칙 — Codex 분기

Codex는 자체 판단으로 종료하므로 표면화 제약이 덜하지만, 다음 규칙을 적용한다:

1. **contract 형태 (4항목)**: 달성 / 변경 금지 / 검증 방법 / 종료 — 명확한 구조화
2. **체크포인트·진행 로그 지침**: 각 단계 완료 시 체크포인트 로그 남기기 권장
3. **`pause`/`resume` 활용 안내**: 중간 확인이 필요한 게이트에서 `pause` 사용
4. **PLAN.md 적극 활용**: 복잡한 시퀀스는 PLAN.md로 상세화

### Codex 컴파일 예시 (단발)

```
[달성] 저장소의 모든 ESLint 경고를 수정한다.
[변경 금지] 기존 테스트 파일, public API 시그니처.
[검증] `npm run lint` 경고 0 종료.
[종료] 검증 통과 시 완료. 진행 중 각 단계 체크포인트 로그 남길 것.
```

### Codex 컴파일 예시 (레시피 기반)

```
[달성] deep-work 세션으로 <기능>을 Research→(risk class medium 이상이면 Spec)→Plan→Implement→Test 순으로 완수한다.
[변경 금지] main 브랜치 직접 push 금지, 기존 API 시그니처 유지.
[검증] `npm test` 전체 통과 AND deep-review-loop APPROVE.
[종료] 검증 통과 시 완료.
Plan 단계 완료 시 `pause`로 사용자 승인 요청. Implement 완료 직후 deep-review-loop(--max=3) 실행.
진행 중 각 phase 체크포인트 로그 남길 것. PLAN.md 참조.
```

---

## 플랫폼 자동 감지 → 분기

1. 현재 런타임을 확인한다 (Claude Code / Codex는 자기 자신을 안다)
2. Claude Code이면 Claude 분기 컴파일 규칙 적용
3. Codex이면 Codex 분기 컴파일 규칙 적용
4. 사용자가 "양쪽 다 줘"라고 요청하면 Claude 버전 + Codex 버전 모두 제시
