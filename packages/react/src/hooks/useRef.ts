import { context } from "../core/context";
interface RefHook<T> {
  kind: "ref";
  value: { current: T };
}

/**
 * 리렌더링되어도 변경되지 않는 참조(reference) 객체를 반환합니다.
 * .current 속성을 통해 값에 접근하고 변경할 수 있습니다.
 *
 * @param initialValue - ref 객체의 초기 .current 값
 * @returns `{ current: T }` 형태의 ref 객체
 */
//state 말고 ref 객체를 따로 만들면 더 가벼울려나 ? 일단 통과하고 해보자
export const useRef = <T>(initialValue: T): { current: T } => {
  const path = context.hooks.currentPath;
  const cursor = context.hooks.currentCursor;
  const hooks = context.hooks.currentHooks;

  // 현재 커서 위치의 훅을 가져옵니다. (타입 캐스팅)
  let hook = hooks[cursor] as RefHook<T> | undefined;

  // 1. 초기화: 첫 렌더링 시에만 객체를 생성합니다.
  if (!hook) {
    // { current: value } 객체 자체를 생성하여 저장합니다.
    const value = { current: initialValue };
    hook = { kind: "ref", value };
    hooks.push(hook);
  } else if (hook.kind !== "ref") {
    console.error(
      `훅 타입 불일치가 감지되었습니다. (경로: "${path}", 커서: ${cursor})\n` +
        `예상 타입: "ref", 실제 타입: "${hook.kind}"\n` +
        `이 오류는 주로 조건문, 반복문, 또는 중첩 함수 내부에서 훅을 호출했을 때 발생합니다.`,
    );
    const value = { current: initialValue };
    hook = { kind: "ref", value };
    hooks[cursor] = hook;
  }

  // 2. 커서 이동
  context.hooks.cursor.set(path, cursor + 1);

  // 3. 저장된 객체 자체를 반환합니다.
  // 객체 참조(Reference)가 유지되므로, 컴포넌트가 리렌더링되어도 이 객체는 동일합니다.
  return hook.value;
};
