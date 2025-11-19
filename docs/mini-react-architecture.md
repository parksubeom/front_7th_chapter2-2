## Mini-React 동작 개요

### 1. 진입점과 초기화
- `packages/react/src/core/setup.ts`의 `setup(rootNode, container)`가 MiniReact 앱의 진입점.
- 수행 순서
  1. `context.root.node`/`container`를 등록하고
  2. `hooks.ts`의 `setRenderTrigger(enqueueRender)`로 훅이 상태 변경 시 렌더를 요청할 수 있게 함
  3. 최초 `enqueueRender()`를 호출해 첫 렌더링 실행

### 2. 렌더 사이클
- `render.ts`
  1. `resetHookContext()`로 훅 커서/방문 정보 초기화
  2. `reconcile(container, prevInstance, nextVNode, path, anchor)` 실행
  3. 결과 인스턴스를 `context.root.instance`에 저장
  4. `cleanupUnusedHooks()`로 사용되지 않은 훅 정리
  5. `enqueueEffects()`로 대기 중인 effect 실행 예약
- `enqueueRender = withEnqueue(render)` : microtask 큐에 render를 넣어 동시 렌더를 방지

### 3. 리컨실리에이션
- `reconciler.ts`
  - `reconcile(parentDom, instance, node, path, anchor)`
    - `TEXT/HOST/COMPONENT` 타입에 따라 `mount*` / `update*` 로 분기
  - 호스트/텍스트는 `dom.ts`의 `setDomProps`, `updateDomProps`, `insertInstance` 등을 통해 실제 DOM을 조작
  - 컴포넌트는 `enterComponent`/`exitComponent`로 컨텍스트 설정 후 `node.type(props)` 실행
  - memoized component 지원: `memoConfig` 비교 후 필요 시 스킵

### 4. DOM 업데이트
- `dom.ts`
  - prop 삭제/추가/수정, 이벤트 바인딩 등 세분화된 단계로 처리
  - `isProperty` 리스트(`checked`,`value`,`selected` 등)는 DOM 프로퍼티로 직접 써야 하는 항목
  - `getDomNodes`, `insertInstance`, `removeInstance`로 children DOM을 수집/조작

### 5. 라이프사이클과 훅
- `context.ts`
  - 현재 컴포넌트 경로, 훅 커서, 훅 상태 맵(`context.hooks.state`)을 추적
- `hooks.ts`
  - `useState(initial)`
    - `context.hooks.currentPath/cursor` 기반으로 상태 훅을 찾아 값 반환
    - `setState` 호출 시 `triggerRender()`로 리렌더 요청
  - `useEffect(effect, deps)`
    - deps 비교 후 실행 대상이면 `context.effects.queue`에 `{path, cursor}` push
    - 이후 `enqueueEffects()` → `flushEffects()`가 호출되면
      1. cleanup이 있으면 먼저 실행
      2. effect 실행 후 리턴값을 cleanup으로 저장
    - 렌더마다 `context.effects.queue`를 비우고 필요 시 `cleanupUnusedHooks`
  - `useRef(initial)`
    - `{ current }` 객체를 유지, 값 변경이 리렌더를 일으키지 않음
  - `setRenderTrigger(fn)`
    - hooks가 사용할 render trigger를 setup 단계에서 주입
  - `cleanupEffects(path)` / `cleanupUnusedHooks()`
    - 방문되지 않은 컴포넌트의 effect cleanup과 state 제거

### 6. 라이프사이클 타이밍
| 단계 | 주요 함수 | 설명 |
| --- | --- | --- |
| 초기화 | `setup` | 컨텍스트/트리거 설정 후 첫 렌더 요청 |
| 렌더 시작 | `render` | 훅 컨텍스트 reset, reconcile 호출 |
| 리컨실리에이션 | `reconcile` | 컴포넌트/DOM를 실제 상태에 맞게 생성·갱신 |
| 마무리 | `cleanupUnusedHooks` | 방문하지 않은 컴포넌트 훅 정리 |
| Effect 실행 | `enqueueEffects` → `flushEffects` | 렌더 완료 후 비동기로 effect/cleanup 실행 |
| 상태 업데이트 | `useState.setState` | 값 변경 → `triggerRender()` → 렌더 큐 등록 |

### 7. Router & App과의 연결
- `packages/app/src/main.jsx`에서 `router.start()` 호출 후 `<App />` 렌더
- `App` → 각 `Page` → MiniReact 컴포넌트를 구성하며, 상태 변경은 훅과 router query 업데이트로 이어짐

---

## 훅 & 라이프사이클 상세 요약

### useState
```ts
const [state, setState] = useState(initial);
```
- `hooks.state[path][cursor]`에 `{ kind: "state", value }` 저장
- `setState`가 불린 순간:
  1. 이전 값과 `Object.is` 비교 후 변경 시에만 진행
  2. 새 값을 저장하고 `triggerRender()` 호출
- 렌더링 중 호출 순서를 `context.hooks.cursor`가 관리

### useEffect
```ts
useEffect(effectFn, deps?);
```
- deps가 없거나 변경되면 `{ path, cursor }`를 effect 큐에 push
- 렌더 종료 후 `enqueueEffects()` → `flushEffects()`
  - 기존 cleanup 실행 → effect 실행 → cleanup 저장
  - 에러는 콘솔에 로그만 남기고 렌더 흐름은 유지

### useRef
```ts
const ref = useRef(initialValue);
```
- `{ current }` 객체를 반환, 값 변경이 리렌더를 일으키지 않음
- DOM reference나 mutable value 저장용

### cleanupUnusedHooks
- 렌더 흐름에서 방문하지 않은 컴포넌트 path에 대해
  - effect cleanup 실행
  - hooks state/cursor 삭제

### render trigger 주입
- 훅 모듈은 의존성 문제를 피하기 위해 직접 `render`를 import하지 않고, setup 단계에서 `setRenderTrigger(enqueueRender)`로 주입받아 사용

---

이 문서는 MiniReact가 상태 변화를 감지하고 DOM을 업데이트하는 전 과정을 개략적으로 정리한 것이며, 각 세부 함수의 구현은 `packages/react/src/core`와 `packages/react/src/hooks` 이하에서 확인할 수 있습니다.

