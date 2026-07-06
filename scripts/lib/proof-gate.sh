#!/usr/bin/env bash
# proof-gate.sh — deep-goal 검증가능성 게이트 정본 실행 로직(release-lint 오라클, 런타임 미로드).
# prep-scout.md / condition-compiler.md 미러 스니펫과 byte-동등(verify-plugin.sh sync 검사).
# node 는 verify 체인 선행 의존; 파서 부재는 unconfirmed 강등 금지, 호출측 하드 실패.

# <!-- deep-goal:probe:start -->
# detect_proof_command — 출력 "<class>\t<command>[\t<note>]"(class ∈ confirmed|unconfirmed).
detect_proof_command() {
  local cmd rc
  if [ -f package.json ]; then
    # plan-R1 Fix 2 — 파싱 실패를 exit 3 로 구분(fail-loud). 2>/dev/null 로 삼키지 않음.
    # plan-R3 Fix 7 — verify 최상위 우선순위(이 저장소가 verify-only). test 키만 "npm test", 그 외 "npm run <k>".
    cmd=$(node -e 'try{const s=(require("./package.json").scripts)||{};for(const k of ["verify","test","build","lint","typecheck","type-check","check"]){if(s[k]){process.stdout.write(k==="test"?"npm test":"npm run "+k);break}}}catch(e){process.exit(3)}')
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
