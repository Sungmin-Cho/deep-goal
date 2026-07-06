# condition-compiler — 조건 컴파일 규칙

deep-goal의 6단계(컴파일 + 제시)에서 사용한다. 4요소와 평가자 표면화 규칙을 적용해 플랫폼 맞춤 `/goal` 조건을 생성한다.

<!-- 수치 출처 단서(W4): 4,000자 한도와 `or stop after N turns` 상한은 Claude Code `/goal` 공식 문서 기준(v2.1.139+)이다. 버전에 따라 변동 가능하므로, 조건이 한도에 근접하면 "이 수치는 현재 버전 기준"이라는 단서를 컴파일 출력에 포함할 것. -->

---

## 공통 4요소

모든 플랫폼에서 컴파일된 조건은 다음 4요소를 포함해야 한다:

| # | 요소 | 설명 | 예시 |
|---|---|---|---|
| 1 | **측정 가능한 종료상태** | 무엇이 달성되면 완료인가 — 테스트 결과, 빌드 exit code, 파일 개수, 빈 큐 등 | "모든 TypeScript 에러 0 (`tsc --noEmit` 성공)" |
| 2 | **증명 방법** | 종료상태를 어떻게 확인하는가 — 커맨드 또는 아티팩트 | "`npm test` 전체 통과" / "PLAN.md 최종 체크포인트 완료" |
| 3 | **불변 제약** | goal 진행 중 바뀌면 안 되는 것 | "기존 public API 시그니처 유지" / "main 브랜치에 직접 push 금지" |
| 4 | **상한** | 턴 또는 시간 한도 — `or stop after N turns` | "or stop after 30 turns" |

---

## 평가자 표면화 규칙 (핵심 — 필수 삽입)

Claude의 `/goal` 평가자(Haiku 모델)는 **도구를 호출하지 않으며**, Claude가 대화에 **이미 표면화한 출력**만으로 종료 조건 충족 여부를 yes/no로 판정한다.

**따라서 모든 컴파일된 조건에는 다음 지침이 반드시 포함되어야 한다:**

> "각 단계/게이트 결과를 대화에 명시 보고하라."

이 지침이 없으면 Claude가 내부적으로 검증을 완료해도 평가자가 종료를 판정하지 못한다. deep-goal이 책임지는 비자명한 컴파일 규칙이다.

> **신뢰 한계(정직 caveat)**: 이 표면화 출력은 평가자가 **독립 검증하지 않는** self-report다 — 실행 모델이 커맨드를 돌리지 않고 "통과"를 출력해도 평가자는 수용할 수 있다. 고위험 goal의 증명 방법은 순수 대화 paste보다 검증가능 anchor(commit SHA·CI run URL·deep-work `session-receipt.json`)를 우선한다.

**표면화 지침 문구 예시:**
- "각 단계 결과(phase 전환·승인 게이트·review verdict·테스트 출력)를 대화에 명시적으로 보고할 것."
- "각 게이트 통과 결과를 대화에 보고한 뒤에만 다음 단계로 진행한다."
- "완료 시 `tsc --noEmit` 출력을 대화에 그대로 붙여 보고할 것."

---

## 4,000자 한도와 PLAN.md 분리

Claude `/goal` 조건에는 **4,000자 한도**가 있다(현재 버전 기준 — 버전 변동 가능).

### 분리 임계치 (I5 구체화)

컴파일된 조건이 다음 중 하나에 해당하면 시퀀스를 `PLAN.md`로 분리한다:

- **(a) ~2,800자(4,000자의 70%) 초과 예상**: 조건 문구가 이 임계치를 넘을 것으로 보이면 분리
- **(b) 순차 게이트/단계 3개 이상**: 게이트가 3개 이상 있으면 PLAN.md로 시퀀스를 표현

**분리 후 조건 압축 형태:**
```
PLAN.md 단계대로 완수. 각 게이트 통과 결과를 대화에 보고할 것.
[종료조건: 최종 게이트 PASS AND 테스트 통과] or stop after <N> turns.
(N을 구체 숫자로 치환 — 예: 40)
(이 수치는 현재 버전 기준)
```

한도에 근접한 경우 컴파일 출력 마지막에 다음 단서를 추가한다:
> "※ 4,000자 한도는 Claude Code 현재 버전 기준이며 업데이트 시 변동될 수 있습니다."

---

## 컴파일 예시

### 단발 goal 예시 (Claude)

```
이 저장소의 모든 TypeScript 컴파일 에러를 수정한다.
종료조건: `tsc --noEmit`가 에러 0으로 종료.
불변 제약: 기존 public 함수 시그니처 변경 금지, 테스트 파일 삭제 금지.
완료 시 `tsc --noEmit` 출력을 대화에 그대로 붙여 보고할 것.
or stop after 25 turns.
```

### 레시피 기반 조건 예시 (Claude, robust-implementation)

```
deep-work 세션으로 <기능>을 Research→Plan→Implement→Test 순으로 진행한다.
deep-work의 Plan 승인과 각 phase Exit Gate에서는 사용자에게 승인을 요청하고, 승인이 대화에 보고된 뒤에만 다음 단계로 진행한다(승인 전 자율 진행 금지 — 이 게이트는 종료조건의 일부다).
Implement 완료 직후 deep-review-loop(--max=3)를 돌려 verdict가 APPROVE가 될 때까지 대응한다.
종료조건: 모든 phase 완료 AND 모든 승인 게이트(Plan 승인·Exit Gate) 통과가 보고됨 AND 최종 deep-review-loop APPROVE AND 테스트 전체 통과.
각 단계 결과(phase 전환·승인 게이트·review verdict·테스트 출력)를 대화에 명시적으로 보고할 것.
or stop after 40 turns.
```

---

## 증명 방법 verifiability 검사 (classify → render — 필수)

증명 방법은 **먼저 `classify_proof_line`으로 분류**(텍스트+probe+git/파일 실측에서만 클래스 파생)한
뒤 그 출력만 `render_proof_line`에 전달한다(정본은 `scripts/lib/proof-gate.sh`, 아래는 sync-검사되는 미러). 5-클래스:

| 클래스 | 판정 근거(classify) | 렌더링(render) |
|---|---|---|
| `confirmed-command` | 실행형 커맨드 shape **AND** probe=confirmed | 그대로 (ready-to-run) |
| `objective-artifact` | **BASELINE_HEAD의 strict 후손 commit SHA**(goal 중 새 커밋) 또는 **선언 digest가 실제 계산과 일치하는 파일**(plan-R4 Fix 9) | 그대로 (ready-to-run) |
| `unconfirmed-command` | 실행형 커맨드 shape **AND** probe≠confirmed | ⚠️ 미검증 + 실행 전 존재 확인 |
| `unconfirmed-artifact` | **일반 URL** · **bare 선재 파일** · **digest 불일치 파일** · **baseline 자신/조상/무관 브랜치 SHA**(plan-R4 Fix 9 — 실측 없이 ready 금지) | ⚠️ 미검증 + 신선도/현재-작업 바인딩 확인 |
| `subjective-placeholder` | "수동 확인"·"완료되면" 등 실행 불가 산문, 또는 미분류(안전 수렴) | **절대 ready-to-run 금지** + 재구성 유도 |

```bash
# <!-- deep-goal:render-decision:start -->
# _sha256: 파일 → 소문자 hex digest(계산 불가 시 빈 출력). 크로스플랫폼(shasum/sha256sum).
_sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" 2>/dev/null | awk '{print $1}'; fi
}
# classify_proof_line: 증명 방법 텍스트 + probe 클래스 → 렌더 클래스(결정론, 클래스 주입 불가).
#   $1=proof-method 텍스트, $2=probe 클래스(confirmed|unconfirmed|""), $3=BASELINE_HEAD(goal 시작 커밋;
#   비면 현재 HEAD). objective SHA 는 baseline 의 strict 후손만 인정(plan-R4 Fix 9b).
classify_proof_line() {
  local text="$1" probe="${2:-}" base="${3:-}" tok decl want got full bfull
  # (1) 주관 placeholder(실행 불가 산문) 최우선 — confirmed/objective 경로로 새지 못하게
  case "$text" in
    *수동*|*확인한다*|*구현\ 완료*|*완료되면*|*적절히*|*알아서*|*대충*)
      printf 'subjective-placeholder\n'; return 0 ;;
  esac
  tok="${text%% *}"
  # (2a) commit SHA — baseline 의 strict 후손만 objective(plan-R4 Fix 9b: 현재-task 연결 증명).
  if printf '%s' "$tok" | grep -qE '^[0-9a-f]{7,40}$' && git rev-parse --verify -q "${tok}^{commit}" >/dev/null 2>&1; then
    [ -z "$base" ] && base="$(git rev-parse HEAD 2>/dev/null)"
    full="$(git rev-parse --verify -q "${tok}^{commit}" 2>/dev/null)"
    bfull="$(git rev-parse --verify -q "${base}^{commit}" 2>/dev/null)"
    if [ -n "$bfull" ] && [ "$full" != "$bfull" ] && git merge-base --is-ancestor "$bfull" "$full" 2>/dev/null; then
      printf 'objective-artifact\n'; return 0     # baseline 의 strict 후손 = goal 중 생성된 새 커밋
    fi
    printf 'unconfirmed-artifact\n'; return 0      # baseline 자신/조상/무관 브랜치 → stale
  fi
  # (2b) 파일 + 선언 digest 실제 계산·대조(plan-R4 Fix 9a). sha256:<64hex> 만 인정.
  if [ -e "$tok" ]; then
    decl="$(printf '%s' "$text" | grep -oE 'sha256:[0-9a-fA-F]{64}' | head -1)"
    if [ -n "$decl" ]; then
      want="$(printf '%s' "${decl#sha256:}" | tr 'A-F' 'a-f')"
      got="$(_sha256 "$tok")"
      [ -n "$got" ] && [ "$got" = "$want" ] && { printf 'objective-artifact\n'; return 0; }  # digest 일치
      printf 'unconfirmed-artifact\n'; return 0    # digest 불일치/계산 불가
    fi
    printf 'unconfirmed-artifact\n'; return 0       # bare 선재 파일(해시 없음) → 검증 필요
  fi
  # (3) 일반 URL — 컴파일 시점 검증 불가 → unconfirmed-artifact
  case "$text" in
    http://*|https://*) printf 'unconfirmed-artifact\n'; return 0 ;;
  esac
  # (4) 실행형 커맨드 shape → probe 확인 여부로 분기
  case "$text" in
    npm\ *|npx\ *|yarn\ *|pnpm\ *|pytest*|python\ -m\ *|go\ test*|go\ build*|cargo\ *|make\ *|tsc\ *|*--noEmit*)
      [ "$probe" = "confirmed" ] && { printf 'confirmed-command\n'; return 0; }
      printf 'unconfirmed-command\n'; return 0 ;;
  esac
  # (5) 그 외 산문 → 안전 수렴(절대 ready-to-run 아님)
  printf 'subjective-placeholder\n'; return 0
}
# render_proof_line: classify 출력 클래스 → /goal 조건 라인. classify 출력만 소비.
render_proof_line() {
  case "$1" in
    confirmed-command|objective-artifact)
      printf '%s\n' "$2" ;;                                                       # ready-to-run 그대로
    unconfirmed-command)
      printf '⚠️ 미검증 — `%s` 가 실제 존재하는지 실행 전 확인 필요\n' "$2" ;;        # ready-to-run 단정 금지
    unconfirmed-artifact)
      printf '⚠️ 미검증 — %s 의 유효성·신선도(선재/baseline stale 여부)를 실행 전 확인 필요; 콘텐츠 검증 커맨드·해시 또는 baseline 이후 새 커밋으로 앵커 권장\n' "$2" ;;  # URL·선재파일·stale SHA
    subjective-placeholder)
      printf '⚠️ 미검증(주관) — 실행 가능한 검증 커맨드로 재구성 필요 (현재: %s)\n' "$2" ;;  # 절대 ready-to-run 아님
    *)
      printf '⚠️ 미검증 — 분류 불가, 실행 전 확인 필요 (%s)\n' "$2" ;;              # 안전 수렴
  esac
}
# 파이프라인: render_proof_line "$(classify_proof_line "$text" "$probe")" "$text"
# <!-- deep-goal:render-decision:end -->
```

## 컴파일 절차 요약

1. 4요소가 모두 채워졌는지 확인 + 증명 방법을 `classify_proof_line`으로 분류(텍스트+probe+git/파일 실측) → `render_proof_line` 렌더 — confirmed-command/objective-artifact만 ready-to-run, unconfirmed-*/placeholder는 미검증 표시(클래스는 산문이 지정하지 않는다; URL은 신선도 미검증)
2. 평가자 표면화 지침을 조건 끝 또는 적절한 위치에 삽입
3. 문자 수 추산 → 2,800자 초과 예상 또는 순차 게이트 3개 이상이면 PLAN.md 분리
4. 플랫폼 분기 적용 (`references/platform-matrix.md` 참조)
5. 복사용 코드블록으로 제시 + 활성화 안내 + (한도 근접 시) 수치 버전 단서
