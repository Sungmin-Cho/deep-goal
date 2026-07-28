# 변경 이력

이 프로젝트의 모든 주요 변경 사항은 이 파일에 기록됩니다.

형식은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 따르며,
이 프로젝트는 [Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 준수합니다.

---

## [1.2.1] — 2026-07-28

### 변경됨

- `AGENTS.md`가 두 호스트 공용 단일 에이전트 가이드가 되고 `CLAUDE.md`는 이를 import한다. 항상 로드되는 가이드 분량이 절반 수준으로 줄었다.
- 두 스킬의 본문과 description을 축약했다. 트리거 문구는 모두 그대로 보존했다.
- 에이전트 가이드가 안내하는 버전 조회 명령을 `npm pkg get version`으로 바꿨다.

### 제거됨

- manifest와 `npm run verify`가 이미 정의하는 내용을 되풀이하던 검증·디렉터리 트리·릴리스 워크플로우 중복 섹션을 삭제했다.

### 보안

- 스킬이 열거나 실행하라고 지시하는 모든 플러그인 파일 경로를 설치된 plugin root에 anchor했다. 분석 대상 저장소가 동명 파일로 deep-goal 문서나 스크립트를 shadowing할 수 없다. reference-integrity 테스트가 이 규칙을 강제하며 bare 경로가 있으면 빌드가 실패한다.
- 플러그인 안에 존재하지 않는 경로를 가리켜 분석 대상 프로젝트 쪽으로 해석되던 workflow 상호 참조를 수정했다.

---

## [1.2.0] — 2026-07-11

### 추가됨

- 사전 준비물 탐색, 증명 평가, 릴리스 검증에 네이티브 Windows 11 및 Node.js 22 지원을 추가하고 Ubuntu/macOS/Windows CI를 적용했습니다.

### 변경됨

- Claude Code와 Codex 진입이 동일한 shell-free 워크플로우와 fail-closed 증명 계약으로 수렴합니다.

### 제거됨

- 지원되는 검증 및 goal 컴파일 경로에서 Git Bash와 POSIX 유틸리티 요구사항을 제거했습니다.

---

## [1.1.0] — 2026-07-07

### 추가됨

- **검증가능성 게이트(proof-gate 오라클)** — probe + 5-클래스 classify→render 결정 로직의 정본을 담은 release-lint 오라클 `scripts/lib/proof-gate.sh`(런타임 미로드)를 추가. `prep-scout.md` / `condition-compiler.md`에 byte-동등 미러 스니펫을 싣고, `verify-plugin.sh`의 `sync_check`가 doc↔script 동등성을 텍스트 비교로 강제한다(Markdown은 절대 eval하지 않음 — trust boundary).
- **confirmed vs unconfirmed probe** — `prep-scout` 2d가 manifest에서 발견한 커맨드는 `confirmed`, 파일 확장자 추정은 `unconfirmed`로 라벨링해 컴파일로 전파한다. `verify`가 probe 최상위 우선순위(verify-only 저장소는 `npm run verify`로 확정), 손상 `package.json`은 `npm test` 추정 대신 fail-loud(`parse-error`).
- **5-클래스 검증가능성 분류기** — `classify_proof_line`이 텍스트+probe+git/파일 실측에서만 렌더 클래스를 파생한다(호출자 클래스 주입 불가): `confirmed-command` / `objective-artifact`(baseline 후손 commit SHA 또는 선언 `sha256:` digest가 실계산과 일치하는 파일) / `unconfirmed-command` / `unconfirmed-artifact`(일반 URL·bare 선재 파일·digest 불일치·baseline 자신/무관 SHA) / `subjective-placeholder`(절대 ready-to-run 아님).
- **정상 경로 정직-표시** — unconfirmed/주관 증명 방법은 ready-to-run 대신 `⚠️ 미검증` caveat로 렌더링한다.
- **self-report 신뢰 한계 caveat** — 컴파일러와 플랫폼 매트릭스가 Haiku 평가자는 표면화된 self-report를 독립 검증 없이 판정함을 고지하고, 고위험 goal을 검증가능 anchor(commit SHA / CI run URL / deep-work `session-receipt.json`)로 유도한다.
- **session-receipt anchor** — `robust-implementation` 레시피가 `/deep-finish`를 필수 종료 스텝으로 만들고 `session-receipt.json` 앵커 계약(경로·envelope identity·현재-세션 바인딩·stale 거부)을 렌더링한다.
- **`verify-probe.sh` 릴리스 게이트** — `proof-gate.sh`를 직접 source(Markdown eval 없음)하는 behavioral fixture 테스트. `npm run verify`에 3번째 스크립트로 배선하고, 배선 누락·Markdown-eval 재도입을 lint 실패로 만드는 메타-가드로 보호한다.

### 변경됨

- **fitness-rubric 재구성 트리거** — "증명 방법 부재"를 "부재 또는 부실"로 확장해 present-but-unverifiable 증명 방법(주관 placeholder·비실행 산문·unconfirmed 추정)을 재구성 대화로 유도한다.
- **컴파일 절차** — presence-only "4요소 채움?" 검사를 `classify_proof_line` → `render_proof_line`로 승격.
- **fallback SKILL.md** — self-contained 진입 스킬의 인라인 스니펫을 검증가능성 게이트 + caveat와 동기화해 약한 런타임 fallback이 구버전 규칙으로 unverifiable 조건을 출하하지 않게 한다.
- **파일 아티팩트 freshness 바인딩 (리뷰 하드닝)** — 파일 + 일치하는 `sha256:` digest는 그 파일이 baseline 후손 커밋에서 Add/Modify 된 경우(`git log --diff-filter=AM $BASELINE_HEAD..HEAD`)에만 `objective-artifact`; 선재/미추적 파일은 현재 해시가 맞아도 `unconfirmed-artifact`(stale-artifact 가드, commit-SHA baseline 규칙과 대칭).
- **전면 fail-loud probe (리뷰 하드닝)** — `node`의 모든 non-zero 종료를 표면화: `rc=3` → `parse-error`, 그 외(node 부재/크래시) → `parser-unavailable`; 추정 `npm test`로 폴백하지 않는다.
- **복원-안전 self-test (리뷰 하드닝)** — no-eval 가드 self-test가 tracked `verify-probe.sh`를 덮어쓰는 대신 `DEEP_GOAL_PROBE_SCRIPT`로 임시 fixture를 주입해, 중단된 실행이 저장소를 파손하지 않는다.
- **감지 커맨드 결합 (리뷰 하드닝)** — `confirmed-command`는 proof 텍스트가 *감지된* 커맨드와 일치할 때만(probe=confirmed는 필요조건이나 충분조건 아님); `npm publish`·`make deploy` 같은 임의 커맨드-형태는 `unconfirmed-command`로 절대 ready-to-run 렌더하지 않는다.
- **HEAD 도달 commit SHA (리뷰 하드닝)** — commit SHA는 `BASELINE_HEAD..HEAD` 구간(baseline strict 후손 **AND** 현재 HEAD 도달)에 있을 때만 `objective-artifact`; baseline 후손이지만 현재 라인에 없는 side-branch 커밋은 `unconfirmed-artifact`.
- **Codex 레시피 anchor 패리티 (리뷰 하드닝)** — `robust-implementation` Codex 계약이 Claude 예시의 `session-receipt.json` anchor(경로·envelope identity·현재-세션 바인딩·stale 거부·`/deep-finish` 필수)를 미러해, Codex 사용자도 동일한 anchor 규율을 받는다.
- **서브셸 / 커맨드 치환 eval 가드 (리뷰 하드닝)** — release-lint no-eval 가드의 경계 클래스에 `(`·`$(`를 추가해, `(eval …)`·`$(eval …)`가 Markdown-eval 회귀를 trust-boundary 검사에서 우회하지 못한다.

---

## [1.0.1] — 2026-05-27

### 수정됨

- **플러그인 manifest** — `.claude-plugin/plugin.json`의 `repository`가 object(`{ type, url }`) 형태였다. Claude Code 플러그인 스키마는 string URL을 기대하므로 설치 시 `repository: Invalid input: expected string, received object` 에러가 발생했다. string URL로 변경했다. (`.codex-plugin/plugin.json`은 이미 string이었음.)

---

## [1.0.0] — 2026-05-27

최초 릴리스 — Claude Code와 Codex용 goal 조건 컴파일러.

### 추가됨

- **적합성 평가** — 장기 작업 요청이 네이티브 `/goal`에 맞는지 판단하는 3판정 기준(적합 / 재구성 필요 / 반려)과 재구성 전략(종료조건 명확화, 범위 분해, 증명 커맨드 식별).
- **조건 컴파일러** — 4요소(측정 가능한 종료상태·증명 방법·불변 제약·상한)와 평가자 표면화 규칙(Claude Haiku 평가자는 도구를 호출하지 못하므로 모든 조건이 단계 결과를 대화에 보고하도록 지시)을 갖춘 조건을 생성. 4,000자 한도를 적용하고, 조건이 커지거나 순차 게이트가 3개 이상이면 `PLAN.md`로 분리.
- **플랫폼 매트릭스** — Claude vs Codex 분기표 및 각 플랫폼 컴파일 규칙.
- **사전 준비물 탐색** — 인라인 코드베이스 스캔으로 먼저 읽을 파일, 증명 커맨드(`package.json` scripts / Makefile / CI 설정), 불변 제약을 발굴; 파일 도구가 없을 때의 degrade 모드 포함.
- **시너지 레시피 — `robust-implementation`** (deep-work + deep-review): 승인 게이트와 리뷰 루프 APPROVE 판정을 종료조건으로 하는 단계별 Research→Plan→Implement→Test; 승인 지점은 여전히 사용자 입력이 필요함을 명시.
- **시너지 레시피 — `autonomous-evolution`** (deep-evolve): 목표 fitness metric 도달 또는 턴 상한까지 자율 실험 루프.
- **시너지 레시피 — `ship-and-document`** (deep-docs + deep-wiki): 구현 → 선택적 리뷰 게이트 → docs garden → wiki ingest, 영속 작업은 리뷰 승인 이후 배치.
- **레시피 인덱스** — 감지된 형제 플러그인을 레시피 제안에 매핑하고, 매칭이 없으면 단발 goal로 폴백.
- **크로스 플랫폼 진입** — 사용자 호출 `/deep-goal`(Claude Code), `$deep-goal:deep-goal`(Codex), `Skill({...})`(SDK). 진입 스킬은 self-contained로, 형제 스킬 자동 로드 없이 동작.
- **6단계 워크플로우 스킬** — 감지 → 적합성 → 재구성 → 레시피 매칭 → 사전 준비물 탐색 → 컴파일 + 제시.
- **Claude Code 및 Codex 매니페스트**와 `npm run verify`(release lint + negative self-test).
- **이중언어 문서** — README, CHANGELOG, 에이전트 가이드(CLAUDE.md / AGENTS.md).
