/**
 * 두 값의 얕은 동등성을 비교합니다.
 * 객체와 배열은 1단계 깊이까지만 비교합니다.
 */
export const shallowEquals = (a: unknown, b: unknown): boolean => {
  // 1. 참조가 같으면(NaN, +0, -0 포함) 즉시 true
  if (Object.is(a, b)) {
    return true;
  }

  // 2. 둘 중 하나라도 객체가 아니거나 null이면, 참조가 달랐으므로 false
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  // 3. 배열 비교
  if (Array.isArray(a) && Array.isArray(b)) {
    // 길이가 다르면 false
    if (a.length !== b.length) {
      return false;
    }
    // 각 요소를 Object.is로 1단계 비교
    for (let i = 0; i < a.length; i++) {
      if (!Object.is(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // 4. 배열 vs 객체 비교 방지
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // 5. 객체 비교
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  // 키의 개수가 다르면 false
  if (keysA.length !== keysB.length) {
    return false;
  }

  // 각 키의 값을 Object.is로 1단계 비교
  for (const key of keysA) {
    // b에 해당 키가 없거나 값이 다르면 false
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !Object.is(a[key as keyof typeof a], b[key as keyof typeof b])
    ) {
      return false;
    }
  }

  return true;
};

/**
 * 두 값의 깊은 동등성을 비교합니다.
 * 객체와 배열의 모든 중첩된 속성을 재귀적으로 비교합니다.
 */
export const deepEquals = (a: unknown, b: unknown): boolean => {
  // 1. 참조가 같으면 true
  if (Object.is(a, b)) {
    return true;
  }

  // 2. 둘 중 하나라도 객체가 아니거나 null이면 false
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }

  // 3. 배열 비교 (재귀)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    // 각 요소를 재귀적으로 deepEquals 호출
    for (let i = 0; i < a.length; i++) {
      if (!deepEquals(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // 4. 배열 vs 객체 비교 방지
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // 5. 객체 비교 (재귀)
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    // b에 해당 키가 없거나, 값이 재귀적으로 다르면 false
    if (
      !Object.prototype.hasOwnProperty.call(b, key) ||
      !deepEquals(a[key as keyof typeof a], b[key as keyof typeof b])
    ) {
      return false;
    }
  }

  return true;
};
