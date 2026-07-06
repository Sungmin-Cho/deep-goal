#!/usr/bin/env bash
# deep-goal release-lint — hermetic grep-based checks (no install needed).
set -u
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ✓ %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  ✗ %s\n' "$1"; }
have() { [ -f "$1" ]; }
# assert file exists
af()   { if have "$1"; then ok "exists: $1"; else bad "missing: $1"; fi; }
# assert grep pattern present in file
ag()   { if have "$1" && grep -qE "$2" "$1"; then ok "$3"; else bad "$3"; fi; }
# assert pattern ABSENT — per-target loop, skip missing, OUTPUT-based判定.
# (C1 fix: ugrep returns exit 2 for `-q` + multi-arg/dir, which the old exit-code
#  version misread as "no match → clean" → placeholder gate gave false OK. Reproduced.
#  We judge by captured output, never by exit code, and skip nonexistent targets so
#  Task-2-early runs against not-yet-created files don't misfire — W2.)
an() {  # $1=space-separated paths(files/dirs), $2=forbidden ERE, $3=label
  local hit="" t out
  for t in $1; do
    [ -e "$t" ] || continue
    out=$(grep -rlE "$2" "$t" 2>/dev/null || true)
    [ -n "$out" ] && hit="${hit}${out} "
  done
  if [ -n "$hit" ]; then bad "$3 (forbidden found in: $hit)"; else ok "$3"; fi
}

echo "== manifests =="
for f in .claude-plugin/plugin.json .codex-plugin/plugin.json package.json; do
  if have "$f" && node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null; then ok "valid json: $f"; else bad "invalid/missing json: $f"; fi
done
# version triple-sync
V1=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')).version)" 2>/dev/null)
V2=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.codex-plugin/plugin.json','utf8')).version)" 2>/dev/null)
V3=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)" 2>/dev/null)
if [ -n "$V1" ] && [ -n "$V2" ] && [ -n "$V3" ] && [ "$V1" = "$V2" ] && [ "$V1" = "$V3" ]; then ok "version sync ($V1)"; else bad "version mismatch or empty: '$V1'/'$V2'/'$V3'"; fi
CV="$V1"  # canonical version for CHANGELOG check below
ag .codex-plugin/plugin.json '"skills"' "codex manifest declares skills"

echo "== required files =="
for f in \
  skills/deep-goal/SKILL.md \
  skills/deep-goal-workflow/SKILL.md \
  skills/deep-goal-workflow/references/fitness-rubric.md \
  skills/deep-goal-workflow/references/condition-compiler.md \
  skills/deep-goal-workflow/references/platform-matrix.md \
  skills/deep-goal-workflow/references/prep-scout.md \
  skills/deep-goal-workflow/references/recipes/README.md \
  skills/deep-goal-workflow/references/recipes/robust-implementation.md \
  skills/deep-goal-workflow/references/recipes/autonomous-evolution.md \
  skills/deep-goal-workflow/references/recipes/ship-and-document.md \
  CLAUDE.md AGENTS.md README.md README.ko.md CHANGELOG.md CHANGELOG.ko.md; do
  af "$f"
done

echo "== skill frontmatter =="
ag skills/deep-goal/SKILL.md '^name: deep-goal$' "entry skill: name"
ag skills/deep-goal/SKILL.md '^user-invocable: true$' "entry skill: user-invocable true"
ag skills/deep-goal/SKILL.md '^description:' "entry skill: description"
ag skills/deep-goal-workflow/SKILL.md '^name: deep-goal-workflow$' "workflow skill: name"
ag skills/deep-goal-workflow/SKILL.md '^user-invocable: false$' "workflow skill: user-invocable false"

echo "== core content invariants =="
# W1 fix: self-contained entry skill must inline ALL 4 compile elements + platform
# branch + evaluator-surfacing rule. Single keywords let a 3-line stub pass (opus
# reproduced "종료조건\nCodex\nSkill(" passing). Require every element separately.
ag skills/deep-goal/SKILL.md '종료[[:space:]]?(상태|조건)' "entry: end-state element"
ag skills/deep-goal/SKILL.md '증명' "entry: proof-method element"
ag skills/deep-goal/SKILL.md '(불변|제약)' "entry: constraint element"
ag skills/deep-goal/SKILL.md '(상한|stop after|N ?turns|턴)' "entry: bound element"
ag skills/deep-goal/SKILL.md '(표면화|대화에[[:space:]]?(명시|보고))' "entry: evaluator-surfacing rule inlined"
ag skills/deep-goal/SKILL.md '(Codex|codex)' "entry: Codex branch"
ag skills/deep-goal/SKILL.md 'Skill\(' "entry: SDK/programmatic Skill() invoke documented"
ag skills/deep-goal/SKILL.md '\$deep-goal:deep-goal' "entry: Codex user entry (\$form) documented (high2)"
# Task 5 (design-R4): fallback SKILL.md inline mirror of verifiability gate + caveat.
# NOTE: ag uses grep -qE, so the literal '(추정)' parens are escaped to match the literal text.
ag skills/deep-goal/SKILL.md '부재 또는 부실' "entry: rubric present-but-weak trigger inlined (sync)"
ag skills/deep-goal/SKILL.md 'unconfirmed\(추정\)' "entry: unconfirmed(추정) verifiability flag inlined (sync)"
ag skills/deep-goal/SKILL.md '독립 검증' "entry: self-report caveat inlined (sync)"
# codex round3 medium fix: loose '자동 호출' token passed even if the skill claimed auto-invocable
# IS possible (reversed invariant). Require the explicit NEGATIVE form, and FORBID the positive claim.
ag skills/deep-goal/SKILL.md '자동 호출 ?(불가|할 수 없|안 ?됨|못 ?함)' "entry: native /goal NOT auto-invocable (explicit negative)"
an skills/deep-goal '자동 호출 ?(가능|할 수 있|됨|된다)' "entry: must NOT claim /goal is auto-invocable"
# high2: defaultPrompt in .codex-plugin must use the same $form as the entry skill's Codex user entry
ag .codex-plugin/plugin.json '\$deep-goal:deep-goal' "codex manifest defaultPrompt uses \$form (matches entry skill)"
# evaluator surfacing rule must appear in compiler
ag skills/deep-goal-workflow/references/condition-compiler.md '(표면화|surface|대화에 (보고|명시))' "compiler states evaluator-surfacing rule"
ag skills/deep-goal-workflow/references/condition-compiler.md '4,?000' "compiler states 4000-char limit"
# rubric three verdicts
ag skills/deep-goal-workflow/references/fitness-rubric.md '(반려|부적합)' "rubric has reject verdict"
ag skills/deep-goal-workflow/references/fitness-rubric.md '재구성' "rubric has reshape verdict"
ag skills/deep-goal-workflow/references/fitness-rubric.md '부재 또는 부실' "rubric: 재구성 trigger covers present-but-weak (부실)"

echo "== workflow behavior contract (codex medium: prove the workflow exists, not just frontmatter) =="
# All 6 workflow steps must be declared, plus the activation-template + reference-load rule.
ag skills/deep-goal-workflow/SKILL.md '감지' "workflow: step1 detect"
ag skills/deep-goal-workflow/SKILL.md '적합성' "workflow: step2 fitness"
ag skills/deep-goal-workflow/SKILL.md '재구성' "workflow: step3 reshape"
ag skills/deep-goal-workflow/SKILL.md '레시피' "workflow: step4 recipe-match"
ag skills/deep-goal-workflow/SKILL.md '(사전 준비물|prep-scout|준비물)' "workflow: step5 prereq-scout"
ag skills/deep-goal-workflow/SKILL.md '(컴파일|제시)' "workflow: step6 compile+present"
ag skills/deep-goal-workflow/SKILL.md '(붙여넣|복사|활성화 안내)' "workflow: activation template present"
ag skills/deep-goal-workflow/SKILL.md '(references|fitness-rubric|condition-compiler)' "workflow: declares reference-load"
# recipes index lists all three recipes
ag skills/deep-goal-workflow/references/recipes/README.md 'robust-implementation' "recipes index lists robust-implementation"
ag skills/deep-goal-workflow/references/recipes/README.md 'autonomous-evolution' "recipes index lists autonomous-evolution"
ag skills/deep-goal-workflow/references/recipes/README.md 'ship-and-document' "recipes index lists ship-and-document"
# each recipe has trigger + termination + a compiled /goal example (I2: examples were unchecked)
for r in robust-implementation autonomous-evolution ship-and-document; do
  ag "skills/deep-goal-workflow/references/recipes/$r.md" '(트리거|Trigger|감지)' "recipe $r: trigger section"
  ag "skills/deep-goal-workflow/references/recipes/$r.md" '(종료조건|종료 조건|Termination)' "recipe $r: termination section"
  ag "skills/deep-goal-workflow/references/recipes/$r.md" '/goal' "recipe $r: compiled /goal example"
done
# robust-implementation must disclose deep-work approval-gate caveat (spec §11)
ag skills/deep-goal-workflow/references/recipes/robust-implementation.md '(Exit Gate|승인 게이트|승인)' "robust recipe discloses deep-work approval gate"
# self-report trust caveat (#1-재규정) + session-receipt anchor contract
ag skills/deep-goal-workflow/references/condition-compiler.md '독립 검증' "compiler: self-report caveat present"
ag skills/deep-goal-workflow/references/platform-matrix.md '독립 검증' "platform-matrix: self-report caveat present"
ag skills/deep-goal-workflow/references/recipes/robust-implementation.md 'session-receipt\.json' "robust recipe: receipt anchor path"
ag skills/deep-goal-workflow/references/recipes/robust-implementation.md '/deep-finish' "robust recipe: /deep-finish required step"
ag skills/deep-goal-workflow/references/recipes/robust-implementation.md '(stale|이전 세션)' "robust recipe: stale-receipt rejection clause"

echo "== doc↔script mirror sync (plan-R2 Fix 4 — no markdown eval) =="
# proof-gate.sh(정본 실행 로직) ↔ 문서 미러 스니펫의 마커 구간 텍스트 동등성 비교(추출·비교, 실행 아님).
# 한쪽만 바뀌면 drift → RED. Markdown 은 어디서도 eval 하지 않는다.
sync_check() {  # $1=marker-id, $2=doc, $3=label — 마커 구간 추출 후 텍스트 동등 비교(실행 아님)
  local a b
  a="$(awk "/deep-goal:$1:start/{f=1;next} /deep-goal:$1:end/{f=0} f" scripts/lib/proof-gate.sh 2>/dev/null)"
  b="$(awk "/deep-goal:$1:start/{f=1;next} /deep-goal:$1:end/{f=0} f" "$2" 2>/dev/null)"
  if [ -n "$a" ] && [ "$a" = "$b" ]; then ok "$3"; else bad "$3 (proof-gate.sh ↔ $2 drift)"; fi
}
sync_check probe skills/deep-goal-workflow/references/prep-scout.md "probe mirror ↔ proof-gate.sh in sync"
ag skills/deep-goal-workflow/references/prep-scout.md 'deep-goal:probe:start' "prep-scout: probe mirror present"
ag skills/deep-goal-workflow/references/prep-scout.md '(confirmed|unconfirmed)' "prep-scout: confirmed/unconfirmed labels present"
sync_check render-decision skills/deep-goal-workflow/references/condition-compiler.md "render-decision mirror ↔ proof-gate.sh in sync"
ag skills/deep-goal-workflow/references/condition-compiler.md 'classify_proof_line' "compiler: classifier (not just formatter) present"
ag skills/deep-goal-workflow/references/condition-compiler.md 'subjective-placeholder' "compiler: verifiability class table present"
ag skills/deep-goal-workflow/references/condition-compiler.md 'unconfirmed-artifact' "compiler: URL → unconfirmed-artifact (Fix 5) present"

echo "== changelog version entry (I4) =="
if [ -n "${CV:-}" ]; then
  ag CHANGELOG.md "\[${CV//./\\.}\]" "CHANGELOG.md has [$CV] entry"
  ag CHANGELOG.ko.md "\[${CV//./\\.}\]" "CHANGELOG.ko.md has [$CV] entry"
else
  bad "CHANGELOG version check skipped — version unresolved"
fi

echo "== non-goals enforced =="
# v1 must NOT ship hooks/ or agents/ dirs
if [ -d hooks ]; then bad "hooks/ dir present (v1 non-goal)"; else ok "no hooks/ dir"; fi
if [ -d agents ]; then bad "agents/ dir present (v1 non-goal)"; else ok "no agents/ dir"; fi

echo "== placeholders =="
an "skills CLAUDE.md AGENTS.md README.md README.ko.md" '(TBD|FIXME|TODO|작성 예정|fill in)' "no placeholder tokens in shipped content"

echo "== release gate wiring (meta-guard) =="
af scripts/lib/proof-gate.sh
af scripts/verify-probe.sh
ag package.json 'verify-probe\.sh' "package.json verify wires verify-probe.sh (release gate)"
ag scripts/verify-probe.sh 'proof-gate\.sh' "verify-probe sources proof-gate.sh (no markdown eval — Fix 4)"
# plan-R3 Fix 6b — no-eval 가드는 주석을 무시하고 실행 라인의 셸-토큰만 검사(설명 주석 false-fail 방지).
no_eval_guard() {  # $1=file, $2=label. 주석 라인 제거 후 eval 셸-토큰만 금지.
  if grep -v '^[[:space:]]*#' "$1" 2>/dev/null | grep -qE '(^|[;&|[:space:]])eval[[:space:]]'; then
    bad "$2 (real eval invocation)"; else ok "$2"; fi
}
no_eval_guard scripts/verify-probe.sh "verify-probe.sh has no eval invocation (trust boundary — Fix 4/6)"

echo ""
echo "Passed: $PASS, Failed: $FAIL"
[ "$FAIL" -eq 0 ]
