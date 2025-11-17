/**
 * VNode가 렌더링되지 않아야 하는 값인지 확인합니다.
 * (예: null, undefined, boolean)
 */
export const isEmptyValue = (value: unknown): boolean => {
  // 1. value == null 은 null과 undefined를 모두 체크합니다.
  // 2. typeof value === 'boolean' 은 true와 false를 모두 체크합니다.
  return value === undefined || value === null || typeof value === "boolean";
};
