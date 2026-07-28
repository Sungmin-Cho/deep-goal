# 시너지 레시피 라이브러리 — 인덱스

deep-goal의 4단계(레시피 매칭)에서 사용한다. 감지된 deep-* 플러그인 조합에 따라 적용 가능한 레시피를 제안하고, 없으면 단발 goal로 폴백한다.

---

## 레시피 목록

| 레시피 | 한 줄 설명 |
|---|---|
| [**robust-implementation**](robust-implementation.md) | deep-work 4단계(Research→Plan→Implement→Test) + deep-review-loop APPROVE 게이트를 엮어 검증된 구현을 goal로 자율 진행 |
| [**autonomous-evolution**](autonomous-evolution.md) | deep-evolve의 실험 루프를 fitness metric 목표치까지 반복하는 자율 진화 goal |
| [**ship-and-document**](ship-and-document.md) | (review 게이트 선행 후) deep-docs garden + deep-wiki 반영으로 완성된 배포·문서화를 goal로 자율 진행 |

---

## 플러그인 감지 규칙

워크플로우 1단계에서 감지된 설치 플러그인을 기준으로 다음 매핑 표를 적용한다.

| 감지된 플러그인 조합 | 제안 레시피 |
|---|---|
| `deep-work` + `deep-review`(또는 `deep-review-loop`) | **robust-implementation** |
| `deep-evolve` | **autonomous-evolution** |
| `deep-docs` + `deep-wiki` | **ship-and-document** |
| `deep-docs` + `deep-wiki` + `deep-review`(또는 `deep-review-loop`) | **ship-and-document** (review 게이트 포함) |
| `deep-work` 만 감지 | robust-implementation 제안 (review 게이트 생략) — 사용자에게 확인 |
| 위 어느 조합도 매칭 안 됨 | **단발 goal** 폴백 — 레시피 없이 4요소로만 컴파일 |

### 복수 레시피가 동시에 매칭되는 경우

예: deep-work + deep-review + deep-docs + deep-wiki가 모두 감지되면 robust-implementation과 ship-and-document 양쪽이 매칭된다.

이 경우 사용자에게 다음과 같이 선택을 받는다:

> "두 레시피가 모두 적용 가능합니다. 어떤 것으로 진행할까요?
> (A) robust-implementation — 구현 완성 + 검증 중심
> (B) ship-and-document — 문서화 + 배포 중심
> (C) 두 레시피를 순차로 결합 (구현 → 리뷰 → 문서화 → wiki)"

옵션 C를 선택하면 두 레시피 시퀀스를 결합해 PLAN.md로 분리하고 압축 조건을 컴파일한다.

### 아무 레시피도 매칭되지 않는 경우

단발 goal 폴백:
- 설치된 deep-* 플러그인 없이도 동작한다.
- `<absolute-plugin-root>/skills/deep-goal-workflow/references/condition-compiler.md`의 4요소와 평가자 표면화 규칙만으로 조건을 컴파일한다.
- 결과물: 단일 `/goal <조건>` 코드블록 + 활성화 안내.
