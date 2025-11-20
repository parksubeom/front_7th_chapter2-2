import { DependencyList } from "./types";
import { useRef } from "./useRef";
import { shallowEquals } from "../utils";

interface MemoCache<T> {
  deps: DependencyList;
  value: T;
}

/**
 * 계산 비용이 큰 함수의 결과를 메모이제이션합니다.
 * 의존성 배열의 값이 변경될 때만 factory 함수를 다시 실행하여 값을 재계산합니다.
 *
 * @template T - 메모이제이션할 값의 타입
 * @param {() => T} factory - 값을 생성하는 팩토리 함수. 렌더링 중에 실행됩니다.
 * @param {DependencyList} deps - 의존성 배열. 이 배열의 요소가 변경되면 factory가 재실행됩니다.
 * @param {(prev: DependencyList, next: DependencyList) => boolean} [equals=shallowEquals]
 * @returns {T} 메모이제이션된 값 (최신 계산값 또는 캐시된 값)
 *
 * @example
 * const memoizedValue = useMemo(() => computeExpensiveValue(a, b), [a, b]);
 */
export const useMemo = <T>(factory: () => T, deps: DependencyList, equals = shallowEquals): T => {
  // 1. 이전 의존성과 값을 저장할 Ref 생성 (초기값 null)
  const ref = useRef<MemoCache<T> | null>(null);

  const currentCache = ref.current;

  // 2. 재계산 조건 확인
  // - 첫 렌더링이거나
  // - 의존성이 변경되었을 경우
  if (!currentCache || !equals(currentCache.deps, deps)) {
    // 3. 값 재계산 및 캐시 갱신
    // factory 함수를 실행하여 새로운 값을 얻고, 현재 의존성과 함께 저장합니다.
    // useRef의 값을 바꿔도 리렌더링이 발생하지 않으므로 안전합니다.
    const newValue = factory();

    ref.current = {
      deps,
      value: newValue,
    };

    return newValue;
  }

  // 4. 캐시된 값 반환 (재계산 건너뜀)
  return currentCache.value;
};
