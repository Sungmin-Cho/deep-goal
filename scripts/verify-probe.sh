#!/usr/bin/env bash
# verify-probe.sh — 검증가능성 게이트 behavioral fixture test (design-R1/R2 주 게이트).
# 정본 로직은 scripts/lib/proof-gate.sh(실제 스크립트) — 여기서 직접 source 한다.
# plan-R2 Fix 4: Markdown 은 실행하지 않는다(source-only, trust boundary). doc↔script
# 동등성은 verify-plugin.sh 의 sync_check(비교, 실행 아님)가 보증한다.
# (plan-R3 Fix 6a: 이 파일 주석은 금지 셸-토큰을 포함하지 않는다 — no-eval 가드 self-pass.)
set -u
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROOF_GATE_LIB="${PROOF_GATE_LIB:-$ROOT/scripts/lib/proof-gate.sh}"
# node 하드 의존 — 부재 시 unconfirmed 강등 금지, verify 전체 하드 실패(design-R7)
command -v node >/dev/null 2>&1 || { echo "verify-probe: node not found (hard dependency)"; exit 2; }
[ -f "$PROOF_GATE_LIB" ] || { echo "verify-probe: proof-gate lib not found: $PROOF_GATE_LIB"; exit 3; }
# shellcheck source=/dev/null
. "$PROOF_GATE_LIB"    # detect_proof_command + classify_proof_line + render_proof_line 정의
command -v detect_proof_command >/dev/null 2>&1 && command -v classify_proof_line >/dev/null 2>&1 \
  || { echo "verify-probe: proof-gate lib missing required functions"; exit 3; }
work="$(mktemp -d "${TMPDIR:-/tmp}/deep-goal-probe.XXXXXX")"; gitwork=""
trap '[ -n "$work" ] && rm -rf "$work"; [ -n "$gitwork" ] && rm -rf "$gitwork"' EXIT

# --- probe unit ---
( cd "$work" && printf '{"name":"x","scripts":{"test":"jest"}}' > package.json
  case "$(detect_proof_command)" in confirmed*npm\ test*) : ;; *) exit 9; esac ) \
  && ok "probe: scripts.test → confirmed npm test" || bad "probe: scripts.test → confirmed"
# plan-R3 Fix 7 — verify-only 저장소(이 repo 포함)가 npm run verify 로 confirmed
( cd "$work" && printf '{"name":"x","scripts":{"verify":"bash x"}}' > package.json
  case "$(detect_proof_command)" in confirmed*npm\ run\ verify*) : ;; *) exit 9; esac ) \
  && ok "probe: scripts.verify only → confirmed npm run verify (Fix 7)" || bad "probe: verify-only → confirmed npm run verify"
( cd "$work" && printf '{"name":"x","scripts":{}}' > package.json
  case "$(detect_proof_command)" in unconfirmed*) : ;; *) exit 9; esac ) \
  && ok "probe: no proof script → unconfirmed" || bad "probe: no proof script → unconfirmed"
( cd "$work" && rm -f package.json
  case "$(detect_proof_command)" in unconfirmed*) : ;; *) exit 9; esac ) \
  && ok "probe: no manifest → unconfirmed" || bad "probe: no manifest → unconfirmed"
# plan-R1 Fix 2 — 손상 manifest fail-loud: npm test 추정(fail-open)이 아니라 parse-error 표면화
( cd "$work" && printf '{invalid json,,' > package.json
  case "$(detect_proof_command)" in *none*parse-error*) : ;; *) exit 9; esac ) \
  && ok "probe: invalid package.json → unconfirmed none parse-error (fail-loud)" \
  || bad "probe: invalid package.json fail-loud (not fail-open npm test)"
# R1 Fix 2 — node 실행 불가(PATH 제거) → parser-unavailable (fail-open npm test 금지)
( cd "$work" && printf '{"name":"x","scripts":{"test":"jest"}}' > package.json
  PATH=/nonexistent
  case "$(detect_proof_command 2>/dev/null)" in *none*parser-unavailable*) : ;; *) exit 9; esac ) \
  && ok "probe: node unavailable → parser-unavailable (R1 Fix 2, no fail-open)" \
  || bad "probe: node-absent fail-loud (R1 Fix 2, not fail-open npm test)"

# --- classify (plan-R1 Fix 1: 클래스는 실측에서만 파생, 주입 불가) ---
case "$(classify_proof_line '수동 확인' confirmed)" in subjective-placeholder) ok "classify: 수동 확인 → subjective (probe confirmed 무시)" ;; *) bad "classify: 수동 확인 bypass to confirmed/objective" ;; esac
case "$(classify_proof_line 'npm test' confirmed)" in confirmed-command) ok "classify: npm test + confirmed → confirmed-command" ;; *) bad "classify: confirmed-command" ;; esac
case "$(classify_proof_line 'npm test' unconfirmed)" in unconfirmed-command) ok "classify: npm test + unconfirmed → unconfirmed-command" ;; *) bad "classify: unconfirmed-command" ;; esac

# --- 아티팩트 freshness/현재-작업 바인딩 (plan-R2 Fix5 URL + plan-R3 Fix8 + plan-R4 Fix9 digest/baseline) ---
# git fixture: baseline(c1) → 후손(c2). classify 에 BASELINE=c1 을 3번째 인자로 전달.
gitwork="$(mktemp -d "${TMPDIR:-/tmp}/deep-goal-git.XXXXXX")"
( cd "$gitwork" && git init -q && git config user.email t@t && git config user.name t
  git commit -q --allow-empty -m c1; base="$(git rev-parse HEAD)"
  git commit -q --allow-empty -m c2; desc="$(git rev-parse HEAD)"
  # 무관 브랜치는 orphan 으로 구성(진짜 baseline 후손 아님 — plan 원본 '-b base' 는 후손이라 objective 로 오판).
  git checkout -q --orphan unrel && git commit -q --allow-empty -m u1; unrel="$(git rev-parse HEAD)"
  # (Fix 9b positive) baseline 의 strict 후손 SHA → objective
  case "$(classify_proof_line "$desc" '' "$base")" in objective-artifact) : ;; *) exit 9; esac
  # (Fix 9b negative) baseline 자신 → unconfirmed(새 작업 아님)
  case "$(classify_proof_line "$base" '' "$base")" in unconfirmed-artifact) : ;; *) exit 9; esac
  # (Fix 9b negative) 무관 브랜치(baseline 후손 아님) → unconfirmed
  case "$(classify_proof_line "$unrel" '' "$base")" in unconfirmed-artifact) : ;; *) exit 9; esac
) && ok "classify: SHA objective iff baseline strict descendant (Fix 9b)" || bad "classify: baseline-descendant binding (Fix 9b)"
rm -rf "$gitwork"; gitwork=""
# (R1 Fix 1 + Fix 9a) 파일+digest freshness 바인딩: baseline 후손 Add 파일만 objective.
gitwork="$(mktemp -d "${TMPDIR:-/tmp}/deep-goal-fgit.XXXXXX")"
( cd "$gitwork" && git init -q && git config user.email t@t && git config user.name t
  printf 'old-preexisting' > pre.txt; git add pre.txt; git commit -q -m c1; base="$(git rev-parse HEAD)"
  printf 'new-artifact' > out.txt; git add out.txt; git commit -q -m c2
  ho="$(_sha256 out.txt)"; hp="$(_sha256 pre.txt)"
  # positive: baseline 후손 커밋에서 Add + 실해시 일치 → objective
  case "$(classify_proof_line "out.txt sha256:$ho" '' "$base")" in objective-artifact) : ;; *) exit 9; esac
  # negative(R1 Fix 1): baseline 자신에 있던 선재 파일 + 실해시 → unconfirmed(stale, ready-to-run 금지)
  case "$(classify_proof_line "pre.txt sha256:$hp" '' "$base")" in unconfirmed-artifact) : ;; *) exit 9; esac
) && ok "classify: file+digest objective iff baseline-descendant Add (R1 Fix 1)" || bad "classify: file freshness binding (R1 Fix 1)"
rm -rf "$gitwork"; gitwork=""
# (Fix 9a negative) 파일 + 불일치/가짜 digest → unconfirmed (R3 구멍: 빈파일+가짜해시 통과 차단)
( cd "$work" && printf 'content-x' > out.txt
  zero64="0000000000000000000000000000000000000000000000000000000000000000"
  case "$(classify_proof_line "out.txt sha256:$zero64 일치" '')" in unconfirmed-artifact) : ;; *) exit 9; esac ) \
  && ok "classify: file + mismatched digest → unconfirmed-artifact (Fix 9a)" || bad "classify: digest-mismatch caught (Fix 9a)"
# (Fix 8 negative) bare 선재 파일(해시 없음) → unconfirmed-artifact
( cd "$work" && : > out.txt
  case "$(classify_proof_line 'out.txt' '')" in unconfirmed-artifact) : ;; *) exit 9; esac ) \
  && ok "classify: bare existing file → unconfirmed-artifact (Fix 8)" || bad "classify: bare file leaked to objective (Fix 8)"
# (Fix 5 negative) 일반 URL → unconfirmed-artifact
case "$(classify_proof_line 'https://ci.example/run/1' '')" in unconfirmed-artifact) ok "classify: arbitrary URL → unconfirmed-artifact (Fix 5)" ;; *) bad "classify: URL leaked to objective (Fix 5)" ;; esac

# --- classify→render e2e (파이프 — 우회가 닫혔는지 직접 증명) ---
case "$(render_proof_line "$(classify_proof_line '수동 확인' confirmed)" '수동 확인')" in *미검증*) ok "e2e: 수동 확인 → 미검증 (never ready-to-run)" ;; *) bad "e2e: 수동 확인 ready-to-run leak" ;; esac
case "$(render_proof_line "$(classify_proof_line 'https://ci.example/run/1' '')" 'https://ci.example/run/1')" in *미검증*신선도*) ok "e2e: URL → 미검증 + 신선도 caveat" ;; *미검증*) ok "e2e: URL → 미검증" ;; *) bad "e2e: URL ready-to-run leak" ;; esac
case "$(render_proof_line "$(classify_proof_line 'npm test' unconfirmed)" 'npm test')" in ⚠️*미검증*) ok "e2e: unconfirmed npm test → 미검증" ;; *) bad "e2e: unconfirmed → 미검증" ;; esac
case "$(render_proof_line "$(classify_proof_line 'npm test' confirmed)" 'npm test')" in *미검증*) bad "e2e: confirmed must NOT be flagged" ;; *) ok "e2e: confirmed npm test → ready-to-run 그대로" ;; esac

echo ""; echo "probe/classify/render: Passed=$PASS Failed=$FAIL"; [ "$FAIL" -eq 0 ]
