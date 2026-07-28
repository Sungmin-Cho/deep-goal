# 레시피: ship-and-document

구현 완료 후 (deep-review 있으면) 최종 리뷰를 먼저 통과하고, deep-docs garden으로 문서를 정비한 뒤, deep-wiki로 반영하는 배포·문서화 goal이다. **핵심 원칙: wiki-ingest 등 되돌리기 어려운 영속 작업은 review 승인 이후에만 수행한다.**

---

## 트리거 (감지 조건)

다음 플러그인이 감지될 때 이 레시피를 제안한다:

- **최소 구성**: `deep-docs` + `deep-wiki`
- **권장 구성**: `deep-docs` + `deep-wiki` + `deep-review`(또는 `deep-review-loop`) — review 게이트 포함

`deep-review`가 없으면 review 게이트를 생략한 축소판을 사용자에게 확인 후 제안한다.

---

## 전제 (필요 플러그인)

| 플러그인 | 역할 | 필수 여부 |
|---|---|---|
| `deep-docs` | 프로젝트 문서(CLAUDE.md 등) 정비 (`garden`) | 필수 |
| `deep-wiki` | 위키 업데이트 (`wiki-ingest`) | 필수 |
| `deep-review` / `deep-review-loop` | 최종 코드 리뷰 게이트 (영속 전 검증) | 권장 |

---

## 시퀀스 (영속 게이트 선행 원칙)

```
전제: 구현 완료 상태 가정

[1] (deep-review 있으면) 최종 deep-review(또는 deep-review-loop --max=3) 실행
    → verdict APPROVE까지 대응
    → APPROVE가 대화에 보고된 뒤에만 [2]로 진행

[2] deep-docs garden 실행
    → 문서 정비 완료 보고

[3] deep-wiki wiki-ingest 실행
    → wiki 반영 완료 보고
```

**영속 게이트 선행 이유**: deep-wiki는 커밋을 journal로 감싸므로 **중단된** ingest는 복구되고 wiki는 pre-commit 상태로 남는다. 그러나 **성공적으로 커밋된** ingest는 그대로 durable하며, deep-wiki에는 un-ingest 루트가 없다 — 되돌리려면 wiki 쪽에서 사람이 손으로 고쳐야 한다. 잘못된 구현이 wiki에 반영되지 않도록 **review 승인 이후에만** 영속 작업을 수행한다.

### 부득이 review가 영속 후인 경우

만약 요구사항상 wiki-ingest가 review 이전에 배치될 수밖에 없다면:
- clean worktree 상태 확인 (`git status` 에러 없음)
- 승인된 커밋 SHA를 조건에 명시
- rollback 안내를 조건에 포함 ("wiki-ingest 후 review 미통과 시 `git revert <SHA>`로 롤백")

---

## 종료조건

다음이 **모두** 충족되어야 완료:

1. (deep-review 있으면) 최종 deep-review verdict APPROVE가 대화에 보고됨
2. deep-docs garden 완료가 대화에 보고됨
3. deep-wiki wiki-ingest 완료가 대화에 보고됨

각 결과를 대화에 명시 보고한다. 보고 없이는 Claude 평가자가 종료를 판정하지 못한다.

---

## 컴파일된 `/goal` 예시

### Claude (review → docs → wiki 순서, 표면화 포함)

```
구현이 완료된 상태에서 배포·문서화를 진행한다.
(1) deep-review-loop(--max=3)로 최종 코드 리뷰를 수행하고 verdict APPROVE를 받는다. APPROVE가 대화에 보고된 뒤에만 다음 단계로 진행한다.
(2) deep-docs garden으로 프로젝트 문서(CLAUDE.md, AGENTS.md 등)를 정비한다. 완료 결과를 대화에 보고한다.
(3) deep-wiki wiki-ingest로 wiki를 최신 상태로 반영한다. 완료 결과를 대화에 보고한다.
종료조건: review APPROVE 보고됨 AND docs garden 완료 보고됨 AND wiki-ingest 완료 보고됨.
불변 제약: review 승인 이전에 wiki-ingest 실행 금지.
각 단계 결과를 대화에 명시적으로 보고할 것.
or stop after 30 turns.
```

### Codex (contract 형태)

```
목표: 구현 완료 후 리뷰 → 문서화 → wiki 반영 순으로 배포·문서화를 완수한다.

달성 조건:
- deep-review-loop(--max=3) verdict APPROVE (대화에 보고됨)
- deep-docs garden 완료 (대화에 보고됨)
- deep-wiki wiki-ingest 완료 (대화에 보고됨)

변경 금지: review 승인 이전 wiki-ingest 실행 금지.
검증: review APPROVE → docs garden 완료 보고 → wiki-ingest 완료 보고.

각 단계 완료를 진행 로그에 명시 기록.
pause 지점: review 미통과 시 대응 필요.
```

---

## 주의 (현실적 제약)

### 영속 작업 순서 불변 원칙

커밋이 끝난 `wiki-ingest`는 되돌리는 플러그인 루트가 없고, wiki root가 저장소 밖(예: 동기화되는 Obsidian vault)일 수도 있다. **반드시 review 승인 이후에 배치한다.** 이 순서를 뒤집으면 잘못된 내용이 wiki에 남는다.

### review 게이트 없는 경우

`deep-review`가 없으면 docs garden까지만 goal로 컴파일한다. **wiki-ingest는 영속 작업이므로 승인 게이트 없이 자동 진행할 수 없다.**

처리 방침:
- docs-only goal로 컴파일: `[deep-docs garden 완료]`를 종료조건으로
- wiki-ingest는 컴파일된 goal에 포함하지 않고 **수동 follow-up**으로 안내: "review 완료 후 직접 `/wiki-ingest`를 실행하세요"
- 사용자에게 "review 없이 wiki-ingest를 goal에 포함할 수 없습니다 — 영속 작업은 승인 게이트 필수"를 명시적으로 고지한다

### deep-docs garden의 자동 수정 범위

garden은 자동 수정 가능 항목만 처리한다. audit-only 항목(크기 초과, 규칙 모순 등)은 사람이 별도 검토가 필요하다. goal 종료 후 `/deep-docs audit`으로 추가 검토를 권장한다.

### 평가자 표면화 없으면 종료 판정 불가

Claude 평가자는 도구 없이 대화 출력만 판정한다. review APPROVE, docs garden 완료, wiki-ingest 완료 각각을 대화에 명시 보고해야 평가자가 종료를 판정할 수 있다.
