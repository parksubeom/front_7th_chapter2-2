## `<select>` 기본값이 URL/스토어와 다르게 표시된 이슈

### 0. TL;DR
- **증상**: 쿼리/스토어에는 `limit=20`, `sort=price_asc`가 들어 있는데, 화면에는 `limit=100`, `sort=name_asc`로 표시됨.
- **원인**: MiniReact가 `<option selected={...}>`를 DOM 프로퍼티가 아닌 attribute로만 업데이트했고, 브라우저는 attribute가 존재한다는 이유로 해당 옵션을 계속 선택 상태로 유지함.
- **해결**: `core/dom.ts`에서 `selected`를 DOM 프로퍼티로 다루도록 수정.

---

### 1. 증상 상세
| 항목 | 내용 |
| --- | --- |
| UI 표시 | 첫 렌더에서 항상 limit=100, sort=name_asc가 선택됨 |
| 실제 상태 | `router.query.limit = "20"`, `router.query.sort = "price_asc"` 등 정상 값 |
| 재현 조건 | 새로고침, 다른 필터 조합 등 모든 경우; SearchBar props 로그에서는 정상값 표시 |
| 영향 범위 | `<SearchBar>` 뿐 아니라 MiniReact 기반 모든 `<select>` 요소에 잠재적 영향 |

---

### 2. 추적 과정
1. **컴포넌트 로그 확인**  
   - HomePage & SearchBar에서 `limit`, `sort`를 출력해 보니 목표 값(예: 20/price_asc)이 그대로 내려오고 있었음.

2. **DOM 스냅샷 확인**  
   - DevTools에서 `<option>` 항목을 보면 `selected="false"`처럼 문자열 attribute가 남아 있었음.
   - HTML 사양상 attribute가 존재하는 한 “선택된” 상태로 인식됨.

3. **렌더러 코드 검토**  
   - `core/dom.ts`에서 `isProperty`에 `selected`가 없어, `setAttribute("selected", false)`처럼 동작하는 것을 확인.
   - React는 `<select value>`를 우선 적용하거나 `option.selected = …`로 동작하지만, MiniReact는 그런 로직이 없음.

4. **재현 테스트**  
   - `<option selected>`를 여러 번 토글해도 브라우저가 선택 상태를 유지하거나 초기화하지 않는 것을 확인.
   - 컴포넌트 로직이 아니라 렌더러가 의심된다는 확신을 얻음.

---

### 3. 원인 요약
| 원인 | 설명 |
| --- | --- |
| Attribute vs Property | DOM에서 `selected`는 프로퍼티로 다뤄야 하는데 attribute만 바꾸고 있었음. |
| 렌더 타이밍 | MiniReact가 `<select>`보다 `<option>`을 먼저 삽입했고, props가 순차 적용돼 브라우저가 초기 선택을 고정함. |
| 테스트 사각지대 | 기존 유닛테스트는 DOM 레벨의 선택 상태를 검증하지 않아 누락됨. |

---

### 4. 수정 내용
| 파일 | 변경점 |
| --- | --- |
| `packages/react/src/core/dom.ts` | `isProperty` 목록에 `"selected"` 추가. 이제 `(dom as any).selected = value` 형태로 프로퍼티를 갱신. |
| (기존) `SearchBar.jsx` 등 | 컴포넌트 로직은 수정 없이 그대로 유지 가능. 필요시 controlled `<select>`로 전환해도 무방. |

수정 후에는 props에서 넘어온 값과 UI가 완전히 일치하고, Playwright/Vitest 테스트도 통과함.

---

### 5. 추가 대비책 제안
1. **리그레션 테스트**
   - `dom.ts` 단위 테스트: `<option selected>` 토글 시 `option.selected`가 true/false로 반영되는지 확인.
   - 단순 컴포넌트 테스트: 상태 변경 → render → DOM 값 비교.

2. **E2E 케이스 확장**
   - Playwright 시나리오에 “URL 파라미터로 접근했을 때 select 값이 동일한지” 검증을 명시적으로 포함.

3. **문서화**
   - 본 문서처럼 렌더러 문제를 추적한 사례를 docs에 기록해 팀 공유.

---

### 6. 마무리
이번 문제는 브라우저의 기본 동작(옵션 기본 선택)과 MiniReact의 DOM 적용 방식 간의 미묘한 차이에서 비롯되었다. UI 코드만 수정하기보다 렌더러 레벨에서 근본 원인을 차단해야 함을 확인했고, `selected`를 DOM 프로퍼티로 다루도록 개선해 문제를 해결했다. 향후 유사 이슈에 대비해 DOM 레벨 테스트, Playwright 시나리오, 문서화를 병행하는 것이 좋다.

