## 과제 체크포인트

### 배포 링크

[배포링크](https://parksubeom.github.io/front_7th_chapter2-2/)


### 기본과제

#### Phase 1: VNode와 기초 유틸리티
- [x] `core/elements.ts`: `createElement`, `normalizeNode`, `createChildPath`
- [x] `utils/validators.ts`: `isEmptyValue`
- [x] `utils/equals.ts`: `shallowEquals`, `deepEquals`

#### Phase 2: 컨텍스트와 루트 초기화
- [x] `core/types.ts`: VNode/Instance/Context 타입 선언
- [x] `core/context.ts`: 루트/훅 컨텍스트와 경로 스택 관리
- [x] `core/setup.ts`: 컨테이너 초기화, 컨텍스트 리셋, 루트 렌더 트리거

#### Phase 3: DOM 인터페이스 구축
- [x] `core/dom.ts`: 속성/스타일/이벤트 적용 규칙, DOM 노드 탐색/삽입/제거

#### Phase 4: 렌더 스케줄링
- [x] `utils/enqueue.ts`: `enqueue`, `withEnqueue`로 마이크로태스크 큐 구성
- [x] `core/render.ts`: `render`, `enqueueRender`로 루트 렌더 사이클 구현

#### Phase 5: Reconciliation
- [x] `core/reconciler.ts`: 마운트/업데이트/언마운트, 자식 비교, key/anchor 처리
- [x] `core/dom.ts`: Reconciliation에서 사용할 DOM 재배치 보조 함수 확인

#### Phase 6: 기본 Hook 시스템
- [x] `core/hooks.ts`: 훅 상태 저장, `useState`, `useEffect`, cleanup/queue 관리
- [x] `core/context.ts`: 훅 커서 증가, 방문 경로 기록, 미사용 훅 정리

**기본 과제 완료 기준**: `basic.equals.test.tsx`, `basic.mini-react.test.tsx` 전부 통과

### 심화과제

#### Phase 7: 확장 Hook & HOC
- [x] `hooks/useRef.ts`: ref 객체 유지
- [x] `hooks/useMemo.ts`, `hooks/useCallback.ts`: shallow 비교 기반 메모이제이션
- [x] `hooks/useDeepMemo.ts`, `hooks/useAutoCallback.ts`: deep 비교/자동 콜백 헬퍼
- [x] `hocs/memo.ts`, `hocs/deepMemo.ts`: props 비교 기반 컴포넌트 메모이제이션

## 과제 셀프회고

<!-- 과제에 대한 회고를 작성해주세요 -->

### 트러블슈팅 및 해결

<details>
<summary>Phase 1: VNode와 기초 유틸리티</summary>

1. **배열 렌더링 테스트 실패**  
   - **원인:** JSX에서 `{index}`처럼 숫자를 넣으면 그대로 `number` 타입이 `nodeValue`에 전달됐습니다. 그런데 테스트는 문자열을 기대하고 있는 상태였습니다.  
   - **해결:** `createTextElement`에서 `String(nodeValue)`로 강제 변환하도록 수정했습니다. 덕분에 숫자도 문제없이 화면에 표시됩니다.  

2. **함수형 컴포넌트 테스트 실패**  
   - **원인:** 자식이 없는 컴포넌트(`<TestComponent />`)임에도 `props.children`이 빈 배열로 설정되면서 테스트가 꼬였습니다.  
   - **해결:** `createElement`에 분기 처리를 넣어, **DOM/Fragment 타입이거나 실제 자식이 있을 때만** `props.children`을 세팅하도록 변경했습니다.  

</details>

<details>
<summary>Phase 3: DOM 인터페이스 구축</summary>

1. **style 객체 반영 실패**  
   - **원인:** 임시 mount 함수는 `className`만 적용하고 `style`은 무시했습니다.  
     - 그래서 `div.style.backgroundColor`가 항상 `''`가 되면서 테스트가 실패했습니다.
   - **해결:** `core/dom.ts`에 `setDomProps`와 `updateDomProps`를 구현했습니다.  
     - props 순회를 통해 `style`, 이벤트, boolean 속성, `data-` 속성 등을 올바른 DOM API로 적용하도록 했습니다.  
     - 작은 로직이지만, DOM과 props 사이 연결의 중요성을 몸소 느꼈습니다.

2. **setup.ts에서 mount 연결**  
   - **문제:** dom.ts는 구현했는데, setup.ts에서 연결하지 않아 여전히 스타일이 적용되지 않았습니다.  
   - **해결:** mount 함수에서 className 하드코딩을 제거하고, `setDomProps(dom, node.props)`를 호출하도록 수정했습니다.  
     - 이제 모든 props가 DOM에 정상 반영됩니다.

</details>

<details>
<summary>Phase 3: &lt;select&gt; 기본값이 URL/스토어와 다르게 표시된 이슈</summary>

1. **기본값 불일치 문제 발생**  
   - **원인:**  
     브라우저는 `<option>`에 `selected` attribute가 있으면 값이 `"false"`여도 선택된 것으로 처리했습니다.  
     MiniReact는 이걸 **attribute만 갱신**했기 때문에 UI와 실제 상태가 달랐죠:
     - URL/스토어: `limit=20`, `sort=price_asc`  
     - 화면: 마지막 attribute 값인 `limit=100`, `sort=name_asc`가 선택됨  
     - `<select>`보다 `<option>`을 먼저 삽입하면서 브라우저가 초기 선택을 고정하기도 했습니다.  

   - **해결:**  
     - `selected`를 attribute가 아닌 **DOM 프로퍼티**로 업데이트하도록 변경  
     - `core/dom.ts`의 `isProperty` 목록에 `"selected"` 추가  
     - `(dom as any).selected = value` 형태로 반영  
     - 컴포넌트 로직은 그대로 두어도 UI와 상태가 일치하게 됨  

   - 배운 점:  
     > UI 개발에서 의도와 화면 상태가 어긋나면, 실제 문제는 컴포넌트가 아니라 렌더러일 확률이 높다는 걸 느꼈습니다.  
     > HTML 어트리뷰트로 전달되는 것과 DOM 프로퍼티로 전달되는 것의 차이와 두 가지는 항상 동일하지는 않다는 걸 알게됐습니다.
     > E2E 테스트가 아니었으면 잡아내지 못했을 테스트 사각지대의 에러였습니다. E2E 테스트가 중요하게 느껴진 계기였습니다 (이 문제에 4시간 넘게 사용)


</details>

<details>
<summary>Phase 4: 렌더 스케줄링</summary>

1. **렌더 큐 처리 실패**  
   - **원인:** 마이크로태스크 큐를 사용하지 않아 여러 render 호출이 즉시 실행되며 DOM 순서가 꼬였습니다.  
   - **해결:** `utils/enqueue.ts`의 `enqueue`/`withEnqueue`로 비동기 render 순서를 보장했습니다.  

2. **루트 렌더 사이클 문제**  
   - **원인:** render가 루트 컨텍스트를 확인하지 않고 DOM을 업데이트했습니다.  
   - **해결:** render와 enqueueRender에서 루트 컨텍스트를 체크하고, container 초기화 후 재렌더링하도록 수정했습니다.  
     - 배운 점: 렌더 순서와 컨텍스트 확인은 안정적인 UI의 핵심임을 깨달았습니다.

</details>

<details>
<summary>Phase 5: Reconciliation</summary>

1. **props.children과 배열 자식 정규화 실패**  
   - **원인:** `reconcileChildren`이 anchor를 잘못 계산하여 Fragment 자식이 기존 div 자식 앞에 삽입되었습니다.  
   - **해결:** `startAnchor` 인자를 추가하고 mountHost/mountFragment 로직을 개선하여 DOM 순서를 보장했습니다.  
     - 배운 점: 작은 anchor 계산 하나가 UI 순서 전체를 결정한다는 걸 경험했습니다.

</details>

<details>
<summary>Phase 6-1: Footer 상태 초기화</summary>

1. **Footer 상태 초기화 실패**  
   - **원인:**  
     `[Item, Item, Item, Footer]`에서 중간 Item이 삭제되면서 Footer가 이동했고, 훅 상태가 초기화되었습니다.  

   - **해결:**  
     - 이동 중인 컴포넌트의 기존 훅 상태를 `orphanedHooks`에 보관  
     - 나중에 동일 경로로 컴포넌트가 나타나면 기존 상태를 복원  
     - 새로 생긴 Item은 초기 상태로 시작  

</details>


### 아하! 모먼트 (A-ha! Moment)

<details>
<summary>Phase 1 & 2 — VNode 정규화와 Fragment의 역할</summary>

- **VNode 생성:** JSX를 Reconciler가 이해할 VNode 설계도로 변환하는 과정에서, 텍스트 노드와 children 정규화의 중요성을 몸으로 느꼈습니다.  
- **Fragment의 의미:** Fragment는 DOM을 만들지 않지만, 자식을 묶어 재귀적으로 삽입하는 논리적 컨테이너임을 체감했습니다.  
- 배운 점: 작은 정규화 하나가 렌더 안정성과 코드 일관성에 큰 영향을 준다는 사실을 알게됐고, 리액트 내부적으로 JSX를 읽고 해석하기위해 어떤 작업을 하는건지 조금은 이해했습니다.

</details>

<details>
<summary>Phase 3 — DOM 인터페이스: VNode Props는 '명령'이다</summary>

- props는 단순 데이터가 아니라 **DOM 상태를 조작하는 명령**임을 깨달았습니다.  
- 예시:
  - `onClick={handler}` → 이벤트 등록
  - `style={{ color: 'red' }}` → dom.style 적용
  - `disabled={true}` → DOM 프로퍼티 설정
- updateDomProps는 기존 상태를 취소(remove)하는 로직까지 필요했습니다.  
- 배운 점: 선언적 UI에서 props → DOM 번역 정확도가 전체 UI 안정성을 좌우합니다.

</details>

<details>
<summary>Phase 7-1: useState vs useRef 이해</summary>

- **공통점:** 둘 다 렌더 간 값을 기억합니다.  
- **차이점:**  
  - useState: 값 변경 시 화면 갱신  
  - useRef: 값 변경 시 화면 갱신 없음, DOM reference/함수 기억용  
- 배운 점: 화면에 보여줘야 할 데이터와 내부 상태를 구분하는 사고가 필요함.

</details>

<details>
<summary>Phase 7-2: useCallback과 memo 협력</summary>

- useCallback만으로는 최적화 완전하지 않음  
- memo와 조합 시, 부모가 리렌더되어도 자식 리렌더 방어 가능  
- 배운 점: 최적화는 훅과 Reconciler 협력이 핵심임을 체감했습니다.

</details>

<details>
<summary>Phase 7-3 — 최종 런타임 안정화와 Hook 시스템의 한계</summary>

- **테스트 통과와 런타임 안정성은 별개의 문제**
  
  단위 테스트는 모두 통과했지만, 실제 브라우저 환경(번들러, 모듈 로딩 순서 등)에서는 순환 참조로 인해 앱이 정상적으로 구동되지 않는 문제가 있었습니다.  
  이를 통해 *테스트 케이스만으로는 실제 런타임의 모든 변수를 검증할 수 없다*는 점을 확인했고, 통합 환경에서의 실 검증의 중요성을 다시 확인했습니다.

- **아키텍처 설계와 의존성 관리의 중요성**
  
  `hooks`와 `render` 모듈 간의 강한 결합(Coupling)이 순환 참조를 유발했습니다.  
  이를 의존성 주입(Dependency Injection) 방식으로 구조를 재배치해 해결했고, 그 과정에서 *역할 분리*와 *결합도 최소화*가 얼마나 중요한지 체감했습니다.

</details>


### 기술적 성장

이번 과제는 리액트의 API를 단순히 '사용'하는 것을 넘어, 그 '동작 원리'를 바닥부터 구현하며 리액트가 나에게 왜 유니크한 키를 강요했는지, 조건문 또는 반복문 내에서 훅을 사용하지 말라고했는지, Fragment 태그는 왜 필요했는지 등 가벼운 호기심이 풀렸습니다.

#### 1. HTML Attribute와 DOM Property의 결정적 차이
기존에는 두 용어를 혼용해서 사용했으나, `<select>` 요소의 초기값 버그를 디버깅하며 그 차이를 확실히 체감했습니다.

* **발견:** 브라우저 렌더링 이후 `setAttribute('selected', 'true')`(Attribute)를 호출해도 화면의 선택값은 변하지 않았습니다. Attribute는 초기 상태일 뿐, 현재 상태를 대변하지 않기 때문입니다.
* **성장:** 동적인 UI 업데이트를 위해서는 반드시 DOM Property(`element.selected = true`)를 제어해야 함을 깨달았습니다. 이를 통해 `core/dom.ts`의 `updateDomProps` 로직을 수정하여 UI와 데이터의 동기화를 완벽하게 구현했습니다.

#### 2. useState와 useRef의 본질적 차이와 설계 의도
두 훅 모두 "리렌더링 간에 값을 유지한다"는 공통점이 있지만, 구현체 관점에서 명확한 역할의 차이를 이해했습니다.
QnA 시간에 질문에 대한 답을 들으면서 더욱 명확해졌습니다.

* **useState :** 값을 저장함과 동시에 `enqueueRender`를 호출하여 시스템에 "화면을 갱신하라"는 신호를 보냅니다.
* **useRef :** 값을 저장하지만 스케줄러를 호출하지 않습니다. 리렌더링을 유발하지 않고 데이터만 조용히 관리해야 할 때(DOM 참조, 타이머 ID, 캐싱 등) 사용해야 함을 구현을 통해 이해했습니다.

#### 3. 리액트 최적화의 메커니즘
최적화가 단일 훅만으로 완성되는 것이 아니라, Hook과 Reconciler의 상호작용임을 배웠습니다.

* **useCallback:** 함수의 참조를 고정해 줄 뿐입니다.
* **memo:** 이 고정된 참조를 비교하여 Reconciler 수준에서 렌더링을 건너뛰어야 비로소 최적화가 완성됩니다.

이 구조를 직접 구현하며 "왜 최적화를 위해 두 가지를 함께 써야 하는지"에 대한 명확한 기술적 근거를 갖게 되었습니다.

#### 4. 복잡한 상태 동기화와 아키텍처
구현 과정에서 마주친 난관들을 해결하며 시스템 설계 능력이 향상되었습니다.

* **순환 참조 해결:** 매 렌더링 사이클(render)마다 무조건 이펙트 큐를 확인하던 로직을 제거했습니다.
실제 useEffect가 사용된 경우에만 스케줄링이 발생하도록 하여, 불필요한 함수 호출 비용을 절감하고 책임 소재를 명확히 했습니다.


### 코드 품질 

#### 1. 특히 만족스러운 구현
* **`hooks.ts`의 `useRef` 최적화:** 처음엔 단순히 `useState`를 래핑하는 쉬운 방법을 택했지만 리팩토링을 통해 리렌더링을 유발하지 않는 별도의 훅 타입을 정의하여 성능과 목적에 부합하는 구현을 해낸 점이 만족스럽습니다.

#### 2. 리팩토링이 필요한 부분
* **DOM 조작의 추상화:** `core/dom.ts`가 충분히 역할을 하고 있지만, `setAttribute`와 프로퍼티 설정 로직을 조금 더 명확한 인터페이스로 분리하면 유지보수에 유리할 것 같습니다.

---


### 과제 피드백

#### 과제에서 좋았던 부분
* **점진적인 난이도 설계:** 정적 렌더링(Phase 1)부터 시작해 훅(Phase 6), 최적화(Phase 7)로 이어지는 단계별 구성이 매우 체계적이었습니다. 덕분에 포기하지 않고 몰입할 수 있었습니다.

## 리뷰 받고 싶은 내용
셀렉트박스의 초기값이나 readOnly 속성을 처리하면서 HTML Attribute와 DOM Property의 동작 차이로 인한 버그를 겪었습니다. 현재 core/dom.ts의 updateDomProps와 isProperty 헬퍼 함수를 통해 이를 분기 처리하고 있습니다.
현재 폼 상태 동기화의 정확성을 위해 value, checked 등 핵심 속성만 화이트리스트(isProperty)로 관리하여 Property로 주입하고 있습니다.
혹시 이 방식이 나중에 커스텀 엘리먼트(Web Components)나 비디오/오디오 태그 등을 지원할 때 큰 구조적 변경을 요구할까요? 아니면 그때 리스트를 추가하는 것으로 충분할까요?
