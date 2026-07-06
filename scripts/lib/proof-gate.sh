#!/usr/bin/env bash
# proof-gate.sh — deep-goal 검증가능성 게이트 정본 실행 로직(release-lint 오라클, 런타임 미로드).
# prep-scout.md / condition-compiler.md 미러 스니펫과 byte-동등(verify-plugin.sh sync 검사).
# node 는 verify 체인 선행 의존; 파서 부재는 unconfirmed 강등 금지, 호출측 하드 실패.

# <!-- deep-goal:probe:start -->
# detect_proof_command — 출력 "<class>\t<command>[\t<note>]"(class ∈ confirmed|unconfirmed).
detect_proof_command() {
  local cmd rc pj
  if [ -f package.json ]; then
    # plan-R1 Fix 2 — 파싱 실패를 exit 3 로 구분(fail-loud). 2>/dev/null 로 삼키지 않음.
    # plan-R3 Fix 7 — verify 최상위 우선순위(이 저장소가 verify-only). test 키만 "npm test", 그 외 "npm run <k>".
    # node 26 호환: cwd 의 손상 package.json 은 node 시작 시 package-scope 해석을 crash 시키므로,
    # 중립 cwd(/) 에서 fs.readFileSync 로 절대경로를 읽어 JSON.parse 한다(require("./..") 회피).
    pj="$PWD/package.json"
    cmd=$(cd / && node -e 'try{const fs=require("fs");const s=(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).scripts)||{};for(const k of ["verify","test","build","lint","typecheck","type-check","check"]){if(s[k]){process.stdout.write(k==="test"?"npm test":"npm run "+k);break}}}catch(e){process.exit(3)}' "$pj")
    rc=$?
    [ "$rc" -eq 3 ] && { printf 'unconfirmed\tnone\tparse-error:package.json 손상 — 수동 확인 필요\n'; return 0; }
    [ -n "$cmd" ] && { printf 'confirmed\t%s\n' "$cmd"; return 0; }
    printf 'unconfirmed\tnpm test\n'; return 0     # package.json 있으나 script 부재 → 추정
  fi
  [ -f pyproject.toml ] || [ -f pytest.ini ] || [ -f setup.cfg ] && { printf 'unconfirmed\tpytest\n'; return 0; }
  [ -f go.mod ]    && { printf 'unconfirmed\tgo test ./...\n'; return 0; }
  [ -f Cargo.toml ] && { printf 'unconfirmed\tcargo test\n'; return 0; }
  printf 'unconfirmed\tnone\n'; return 0
}
# <!-- deep-goal:probe:end -->

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
  # (2b) 파일 + 선언 digest 실제 계산·대조(plan-R4 Fix 9a) + baseline freshness 바인딩(R1 Fix 1).
  if [ -e "$tok" ]; then
    decl="$(printf '%s' "$text" | grep -oE 'sha256:[0-9a-fA-F]{64}' | head -1)"
    if [ -n "$decl" ]; then
      want="$(printf '%s' "${decl#sha256:}" | tr 'A-F' 'a-f')"
      got="$(_sha256 "$tok")"
      if [ -n "$got" ] && [ "$got" = "$want" ]; then
        # digest 일치 — stale 방지(R1 Fix 1): baseline 후손 커밋에서 Add/Modify 된 파일만 objective.
        # 선재/미추적 파일은 현재 해시가 맞아도 현재-작업 산출물 증명이 아님(SHA baseline 가드와 대칭).
        [ -z "$base" ] && base="$(git rev-parse HEAD 2>/dev/null)"
        if [ -n "$base" ] && [ -n "$(git log --diff-filter=AM "$base"..HEAD -- "$tok" 2>/dev/null)" ]; then
          printf 'objective-artifact\n'; return 0
        fi
        printf 'unconfirmed-artifact\n'; return 0   # 선재/미추적 파일+현재 해시만 → stale 가능
      fi
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
