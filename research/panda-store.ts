import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

/** A path can be supplied as a dot/bracket string or as explicit segments. */
export type Path = string | readonly (string | number)[];

export type Equality<T> = (a: T, b: T) => boolean;

export type StateUpdater<State> =
  | State
  | ((previous: State) => State);

export interface PandaStore<State> {
  /** Returns the current immutable state reference. */
  getState(): State;

  /**
   * Computes the next state first and commits it only after the updater
   * returns successfully. The previous state is never mutated by the store.
   */
  setState(updater: StateUpdater<State>): void;

  /** React/external-store subscription. Returns an idempotent cleanup function. */
  subscribe(listener: () => void): () => void;

  /** Number of successful state commits. Useful for diagnostics. */
  getVersion(): number;
}

export interface UsePandaOptions<T> {
  equality?: Equality<T>;
}

const objectIs: Equality<unknown> = Object.is;

/**
 * Creates an isolated Panda store instance.
 *
 * State updates are atomic: the updater is evaluated against the current
 * snapshot, and no listener is notified if evaluation throws or returns the
 * same state reference. The store does not mutate or freeze user objects;
 * callers must return new objects when changing nested data.
 */
export function createPandaStore<State>(initialState: State): PandaStore<State> {
  let state = initialState;
  let version = 0;
  const listeners = new Set<() => void>();

  const getState = (): State => state;

  const setState = (updater: StateUpdater<State>): void => {
    // Calculate outside the commit section. If this throws, the old state and
    // all subscriptions remain untouched.
    const previous = state;
    const next = typeof updater === 'function'
      ? (updater as (previous: State) => State)(previous)
      : updater;

    if (Object.is(previous, next)) return;

    // Single commit point.
    state = next;
    version += 1;

    // Take a snapshot so a listener unsubscribing during notification does not
    // affect this commit's iteration.
    for (const listener of [...listeners]) listener();
  };

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  };

  return {
    getState,
    setState,
    subscribe,
    getVersion: () => version,
  };
}

/**
 * Parses paths such as "todos[0].title" and "todos.[0].title".
 * Explicit segment arrays are preferred when object keys may contain dots.
 */
export function toPath(path: Path): readonly (string | number)[] {
  if (typeof path !== 'string') return path;

  const segments: (string | number)[] = [];
  const tokenPattern = /([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(path)) !== null) {
    segments.push(match[2] === undefined ? match[1] : Number(match[2]));
  }

  if (segments.length === 0) {
    throw new Error(`Invalid Panda path: "${path}"`);
  }
  return segments;
}

export function getAtPath<State, Value = unknown>(
  state: State,
  path: Path,
): Value | undefined {
  let current: unknown = state;
  for (const segment of toPath(path)) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current as Value | undefined;
}

function isContainer(value: unknown): value is Record<string | number, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Immutable path update. It does not mutate the input state. */
export function setAtPath<State>(
  state: State,
  path: Path,
  value: unknown,
): State {
  const segments = toPath(path);
  if (segments.length === 0) return value as State;

  const write = (current: unknown, index: number): unknown => {
    const segment = segments[index];
    const last = index === segments.length - 1;
    const source = isContainer(current) ? current : {};
    const clone: any = Array.isArray(source)
      ? [...(source as unknown[])]
      : { ...(source as Record<string | number, unknown>) };

    clone[segment] = last
      ? value
      : write(source[segment], index + 1);
    return clone;
  };

  return write(state, 0) as State;
}

/** Immutable path deletion. Array deletion preserves indexes by writing a hole. */
export function deleteAtPath<State>(state: State, path: Path): State {
  const segments = toPath(path);
  if (segments.length === 0) return state;

  const remove = (current: unknown, index: number): unknown => {
    if (!isContainer(current)) return current;

    const segment = segments[index];
    const clone: any = Array.isArray(current)
      ? [...(current as unknown[])]
      : { ...(current as Record<string | number, unknown>) };

    if (index === segments.length - 1) {
      if (Array.isArray(clone)) delete clone[segment as number];
      else delete clone[segment];
      return clone;
    }

    clone[segment] = remove(current[segment], index + 1);
    return clone;
  };

  return remove(state, 0) as State;
}

/**
 * React hook for a selector. The selector is evaluated from a stable store
 * snapshot, and equality prevents rerenders when the selected value is equal.
 */
export function usePanda<State, Selected>(
  store: PandaStore<State>,
  selector: (state: State) => Selected,
  options: UsePandaOptions<Selected> = {},
): Selected {
  const equality = options.equality ?? (objectIs as Equality<Selected>);

  // The cache belongs to this hook subscription. It ensures getSnapshot returns
  // a stable selected value between store commits, as required by React.
  const selectedSnapshot = useMemo(() => {
    let observedState = store.getState();
    let observedValue = selector(observedState);

    return () => {
      const nextState = store.getState();
      if (nextState !== observedState) {
        const nextValue = selector(nextState);
        if (!equality(observedValue, nextValue)) observedValue = nextValue;
        observedState = nextState;
      }
      return observedValue;
    };
  }, [store, selector, equality]);

  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );

  return useSyncExternalStore(
    subscribe,
    selectedSnapshot,
    selectedSnapshot,
  );
}

/** Convenience hook for a path selector. */
export function usePandaPath<State, Selected = unknown>(
  store: PandaStore<State>,
  path: Path,
  options: UsePandaOptions<Selected | undefined> = {},
): Selected | undefined {
  const selector = useMemo(
    () => (state: State) => getAtPath<State, Selected>(state, path),
    [path],
  );
  return usePanda(store, selector, options);
}

/** Convenience setter matching React's Dispatch<SetStateAction<T>> shape. */
export function usePandaSetter<State>(
  store: PandaStore<State>,
): Dispatch<SetStateAction<State>> {
  return useCallback(
    (next: SetStateAction<State>) => store.setState(next),
    [store],
  );
}

/* Example usage:

 type AppState = {
   user: { name: string; online: boolean };
   todos: Array<{ id: string; done: boolean }>;
 };

 export const appStore = createPandaStore<AppState>({
   user: { name: '', online: false },
   todos: [],
 });

 function UserName() {
   const name = usePandaPath(appStore, ['user', 'name']);
   return <span>{name}</span>;
 }

 appStore.setState(previous => ({
   ...previous,
   user: { ...previous.user, online: true },
 }));

 // Or update one path immutably:
 appStore.setState(previous => setAtPath(previous, ['user', 'name'], 'Ada'));
*/
