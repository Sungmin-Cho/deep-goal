#!/usr/bin/env bash
# deep-goal verify negative self-test — proves verify-plugin.sh actually catches violations.
# Three self-tests; any failure → non-zero exit. Output: "self-test: ALL-PASS" or "self-test: HAS-FAIL".
set -u
fail=0

# Single trap to clean up all fixtures on exit (including Ctrl-C / abnormal termination).
trap 'rm -f skills/.selftest-placeholder.md skills/deep-goal/.selftest-autoclaim.md /tmp/deep-goal-stub.md skills/deep-goal/.SKILL.md.selftest-bak' EXIT

# (1) placeholder gate catches forbidden tokens in skills/ (an() C1 regression guard)
# mkdir -p ensures skills/ exists even before Task 3 creates content there (harmless).
mkdir -p skills
printf 'TODO fill in\n' > skills/.selftest-placeholder.md
if bash scripts/verify-plugin.sh 2>&1 | grep -q "forbidden found"; then
  echo "PASS: placeholder gate catches"
else
  echo "FAIL: placeholder gate blind"
  fail=$((fail+1))
fi
rm -f skills/.selftest-placeholder.md

# (2) self-containment multi-element check — verify-plugin.sh catches keyword-only stubs (W1 regression guard)
# Place a keyword-only stub at skills/deep-goal/ temporarily (real SKILL.md backed up),
# run verify-plugin.sh, and confirm it reports FAIL for the self-containment checks.
stub_dir="skills/deep-goal"
real_skill="${stub_dir}/SKILL.md"
backup_skill="${stub_dir}/.SKILL.md.selftest-bak"
mkdir -p "$stub_dir"
# Backup real SKILL.md if present; write keyword-only stub (missing 증명/불변/표면화 elements).
[ -f "$real_skill" ] && mv "$real_skill" "$backup_skill"
printf '종료조건 Codex Skill(\nentry: proof-method\n' > "$real_skill"
# Run verify-plugin.sh; it should FAIL (non-zero or report "Failed: N" > 0).
vout=$(bash scripts/verify-plugin.sh 2>&1)
vstatus=$?
# Restore real SKILL.md before evaluating (so trap cleanup is idempotent).
rm -f "$real_skill"
[ -f "$backup_skill" ] && mv "$backup_skill" "$real_skill"
# Expect either non-zero exit OR output containing "Failed: [^0]" — stub must be caught.
if echo "$vout" | grep -qE 'Failed: [1-9]|✗'; then
  echo "PASS: stub fails multi-element check (verify-plugin.sh caught it)"
else
  echo "FAIL: stub passed verify-plugin.sh — self-containment check not enforced"
  fail=$((fail+1))
fi

# (3) reversed activation invariant rejected (codex round3 medium regression guard):
# "자동 호출 가능" claim must be caught by the an() forbidden-pattern check.
mkdir -p skills/deep-goal
printf '네이티브 /goal은 자동 호출 가능하다\n' > skills/deep-goal/.selftest-autoclaim.md
if bash scripts/verify-plugin.sh 2>&1 | grep -qE "forbidden found in:.*selftest-autoclaim"; then
  echo "PASS: reversed activation invariant rejected"
else
  echo "FAIL: reversed invariant passes"
  fail=$((fail+1))
fi
rm -f skills/deep-goal/.selftest-autoclaim.md

# (4) verify-probe not blind: 실 lib source(detect+classify 정상) + render 만 override 로 파손 →
#     오직 e2e render 케이스만 FAIL. 그 특정 라벨을 grep(plan-R4 Fix 10 — probe 실패 오검 차단).
REAL_LIB="$PWD/scripts/lib/proof-gate.sh"   # verify-selftest 는 repo 루트에서 실행(기존 관례)
fx="$(mktemp -d "${TMPDIR:-/tmp}/deep-goal-selftest.XXXXXX")"
cat > "$fx/proof-gate.sh" <<SH
. "$REAL_LIB"                               # detect+classify+render 정상 로드
render_proof_line(){ printf '%s\n' "\$2"; }    # override: render 만 파손(전 클래스 bare)
SH
out4="$(PROOF_GATE_LIB="$fx/proof-gate.sh" bash scripts/verify-probe.sh 2>&1)"
if printf '%s' "$out4" | grep -q '✗ e2e: 수동 확인 ready-to-run leak'; then
  echo "PASS: verify-probe catches broken render (e2e-specific label)"
else
  echo "FAIL: verify-probe blind to broken render OR wrong failure locus"; fail=$((fail+1))
fi
rm -rf "$fx"

# (5) no-eval 가드는 설명 주석에 false-fail 안 하고 실제 eval 은 잡는다(plan-R3 Fix 6c).
#     R1 Fix 3: tracked verify-probe.sh 를 덮지 않고 임시 fixture 를 DEEP_GOAL_PROBE_SCRIPT 로 주입(복원-안전).
fx5="$(mktemp -d "${TMPDIR:-/tmp}/deep-goal-noeval.XXXXXX")"
# 5a: 금지 토큰(eval)을 주석에만 언급 → no-eval 가드 라인은 PASS(✗ 없음)
printf '#!/usr/bin/env bash\n# note: this script must never eval markdown sources\n. scripts/lib/proof-gate.sh\n' > "$fx5/probe.sh"
if DEEP_GOAL_PROBE_SCRIPT="$fx5/probe.sh" bash scripts/verify-plugin.sh 2>&1 | grep -qE '✗.*no eval invocation'; then
  echo "FAIL: no-eval guard false-fails on comment mention"; fail=$((fail+1))
else echo "PASS: no-eval guard ignores comment mention (5a)"; fi
# 5b: 실제 eval 호출 → no-eval 가드 라인 FAIL(✗)
printf '#!/usr/bin/env bash\neval "$UNSAFE"\n. scripts/lib/proof-gate.sh\n' > "$fx5/probe.sh"
if DEEP_GOAL_PROBE_SCRIPT="$fx5/probe.sh" bash scripts/verify-plugin.sh 2>&1 | grep -qE '✗.*no eval invocation'; then
  echo "PASS: no-eval guard catches real eval (5b)"
else echo "FAIL: no-eval guard blind to real eval"; fail=$((fail+1)); fi
# 5c: 서브셸 (eval …) 우회 → 가드가 잡아야 함(R3 Fix 7)
printf '#!/usr/bin/env bash\n(eval "$UNSAFE")\n. scripts/lib/proof-gate.sh\n' > "$fx5/probe.sh"
if DEEP_GOAL_PROBE_SCRIPT="$fx5/probe.sh" bash scripts/verify-plugin.sh 2>&1 | grep -qE '✗.*no eval invocation'; then
  echo "PASS: no-eval guard catches subshell eval (5c)"
else echo "FAIL: no-eval guard blind to subshell eval"; fail=$((fail+1)); fi
# 5d: 커맨드 치환 $(eval …) 우회 → 가드가 잡아야 함(R3 Fix 7)
printf '#!/usr/bin/env bash\nx=$(eval "$UNSAFE")\n. scripts/lib/proof-gate.sh\n' > "$fx5/probe.sh"
if DEEP_GOAL_PROBE_SCRIPT="$fx5/probe.sh" bash scripts/verify-plugin.sh 2>&1 | grep -qE '✗.*no eval invocation'; then
  echo "PASS: no-eval guard catches command-subst eval (5d)"
else echo "FAIL: no-eval guard blind to command-subst eval"; fail=$((fail+1)); fi
rm -rf "$fx5"

# Trap will clean residual fixtures; report result.
if [ "$fail" -eq 0 ]; then
  echo "self-test: ALL-PASS"
  exit 0
else
  echo "self-test: HAS-FAIL ($fail failure(s))"
  exit 1
fi
