# prep-scout — 사전 준비물 탐색 절차

deep-goal의 5단계(사전 준비물 탐색)에서 사용한다. Claude Code와 Codex 모두 같은 Node runtime을
호출하며, 호스트별 차이는 결과를 읽고 제시하는 방식뿐이다.

---

## 탐색 목표

goal 진행 전에 다음 정보를 발굴한다:

1. **먼저 읽을 파일** — 프로젝트 가이드, 설계 문서, 의존성 및 CI 파일
2. **진행 증명 커맨드** — 실제 manifest에서 확인된 test/build/lint 커맨드
3. **불변 제약** — 작업 중 바뀌면 안 되는 저장소 규칙
4. **baseline** — 현재 요청의 proof freshness를 묶는 git HEAD

## Portable runtime contract

현재 로드된 `SKILL.md`의 절대 경로에서 설치된 plugin root를 구한다. project root도 절대 경로로
정규화한 뒤, Node에 shell string이 아닌 분리된 argv로 전달한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" scout --cwd "<absolute-project-root>"`

plugin-root를 current working directory로 가정하거나 Git Bash에 의존하지 않는다. 경로에 공백이 있어도
각 argument를 따로 전달한다.

### scout JSON schema

성공 시 stdout은 다음 shape의 JSON object 한 개와 마지막 newline만 포함한다:

```json
{
  "projectRoot": "<absolute-project-root>",
  "git": {
    "isRepository": true,
    "baselineHead": "<40-hex-commit-or-null>",
    "branch": "<branch-or-null>"
  },
  "proof": {
    "status": "confirmed | unconfirmed",
    "command": "<command-or-null>",
    "note": "<note-or-null>"
  },
  "files": {
    "guides": ["<relative-path>"],
    "dependencies": ["<relative-path>"],
    "ci": ["<relative-path>"]
  },
  "makeTargets": ["<target>"]
}
```

exit 2는 argument contract 오류, exit 1은 project path/permission 등 operational 오류다. 두 경우
stdout을 proof로 소비하지 않는다.

## 탐색 절차

### Step 1: runtime 실행과 결과 검증

위 absolute `scout` argv를 실행하고 JSON을 parse한다. `projectRoot`가 요청한 absolute project root와
같은지 확인한다. parse 실패, non-zero exit, 다른 root, missing field는 모두 fail-closed로 처리한다.

### Step 2: proof command 해석

runtime은 `package.json` scripts를 `verify`, `test`, `build`, `lint`, `typecheck`, `type-check`, `check`
순서로 읽는다. 발견된 script만 `confirmed`다. 손상 JSON은 `parse-error:package.json` note와 함께
`unconfirmed`; 확장자 기반 `pytest`, `go test ./...`, `cargo test` 추정도 `unconfirmed`다.

Makefile과 CI 파일은 텍스트로만 발견한다. scout 단계에서 Makefile target이나 repo-controlled script를
실행하지 않는다.

### Step 3: 파일과 불변 제약 정리

`files.guides`, `files.dependencies`, `files.ci`, `makeTargets`를 사용해 먼저 읽을 파일과 검증 후보를
요약한다. `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md` 등에서 확인된 금지 규칙을 불변 제약으로
표면화한다. 명시 규칙이 없으면 public API 유지, 테스트 삭제 금지, secret 하드코딩 금지 같은 후보를
제안하되 저장소에서 확인한 사실처럼 단정하지 않는다.

### Step 4: baseline request-memory handoff

`scout.git.baselineHead`는 현재 요청의 working memory에만 보관하고 문자열을 변경하거나 현재 HEAD로
다시 계산하지 않는다. later compiler에 proof text와 함께 그대로 forward한다:

`node "<absolute-plugin-root>/scripts/deep-goal-runtime.js" evaluate-proof --cwd "<absolute-project-root>" --text "<proof-text>" --baseline "<scout.git.baselineHead>"`

`baselineHead`가 null이거나 missing이거나 project가 non-Git이면 `--baseline`을 생략한다. 이 경우 SHA와
file freshness proof는 unconfirmed이며 ready-to-run으로 승격하지 않는다.

## 결과 정리

```text
[먼저 읽을 파일]
- <scout.files의 검증된 상대 경로>

[진행 증명]
- <proof.command> (<proof.status>)
- note: <proof.note가 있을 때만>

[불변 제약]
- <저장소 문서에서 확인한 제약 또는 명시적으로 추정 표시한 후보>

[baseline]
- <scout.git.baselineHead 또는 null>
```

## no-file-tools / runtime degraded mode

runtime이나 file tool을 사용할 수 없으면 사용자에게 검증 커맨드, 제약, 핵심 파일을 요청한다. 사용자
응답 없이 추정한 모든 값은 **미검증(unverified)** 으로 표시한다. 이 경로는 fail-closed이며
ready-to-run으로 표시하지 않는다. null/missing/non-Git baseline도 같은 규칙을 따른다.

최소 출력에는 목표, 사용자 제공 proof 또는 수동 확인, 알려진 제약, 구체적인 turn 상한을 포함하고
`⚠️ 미검증 — prep-scout runtime을 실행하지 못함`을 명시한다.
