## Advanced Hooks & HOC Notes

### useRef
- 구현: `useState`의 이니셜라이저로 `{ current: initialValue }` 객체를 한 번만 만들고 그대로 반환했습니다.
- 이유: 훅이 다시 호출돼도 동일한 ref 객체가 유지되어야 하므로 상태 훅을 이용해 “한 번 생성, 계속 재사용” 패턴을 강제했습니다.

### useMemo / useCallback
- 구현: `useMemo`는 `useRef`에 `{ deps, value }` 캐시를 저장하고, 기본 비교 함수(기본 `shallowEquals`)가 바뀌었다고 판단할 때만 `factory`를 다시 실행합니다. `useCallback`은 `useMemo(() => callback, deps)`로 단순 위임했습니다.
- 이유: 의존성 비교 로직을 하나로 통합해 재사용성을 높였습니다. `useCallback`을 `useMemo`에 위임하면 메모이제이션과 의존성 비교 방식이 항상 일관되게 유지됩니다.

### useDeepMemo
- 구현: `useMemo`에 `deepEquals`를 주입한 thin wrapper입니다.
- 이유: 복잡한 객체/배열 비교가 필요한 경우를 위해 별도 훅을 제공하면서도 기본 구현을 재사용해 코드 중복을 없앴습니다.

### useAutoCallback
- 구현: 최신 함수를 `useRef`에 저장하고, 의존성 없는 `useCallback`으로 안정적인 래퍼를 반환했습니다. 래퍼는 항상 `ref.current`를 호출합니다.
- 이유: 상태나 props를 캡처하지 않고도 최신 구현을 실행하고, 동시에 콜백 참조가 변하지 않도록 하기 위한 전형적인 패턴입니다.

### memo / deepMemo HOC
- 구현: `memo`는 실제로 훅을 사용하지 않고, 컴포넌트 타입에 `__memoConfig` 메타데이터를 붙입니다. `reconciler`가 업데이트 시 이 메타데이터를 읽어 이전 props와 `equals`로 비교한 뒤, 같다면 기존 `Instance`를 그대로 반환해 하위 트리를 건드리지 않습니다. `deepMemo`는 동일한 경로로 `deepEquals`를 주입한 얇은 래퍼입니다.
- 이유: 훅 기반 캐싱은 컴포넌트 중첩 시 경로 충돌 위험이 있어 렌더러 단계에서 직접 최적화하는 편이 안전했습니다. `Instance`가 이미 자식 `VNode`와 DOM 참조를 갖고 있으므로, 비교만 통과하면 전체 렌더 과정을 건너뛸 수 있습니다.

### 테스트 전략
- 심화 훅(`advanced.hooks.test.tsx`)과 HOC(`advanced.hoc.test.tsx`) 스펙을 그대로 만족하는지 `pnpm -F @hanghae-plus/react test ...`로 개별 실행합니다.

