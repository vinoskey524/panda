// panda-typed-paths.ts
// -----------------------------------------------------------------------------
// Prototype: compile-time path checking for Panda's dot/bracket path syntax.
//
// Goal: `get('user.nmae')` should be a TS compile error, and `get('user.name')`
// should return `string` automatically, inferred from your store's schema.
//
// REQUIRED ARCHITECTURAL CHANGE
// This only works if the schema is known at compile time. Today panda exports
// untyped global singletons (`store`, `get`, `watch`, ...). To type paths, you
// need a factory that captures the schema generic ONCE:
//
//   const { store, get, watch } = createPanda<AppState>();
//
// instead of importing the untyped singletons directly. Everything below
// assumes that shift — see the bottom of the file for the factory.
//
// KNOWN LIMITS (see chat explanation for why):
//  - Array paths type-check as `[${number}]` (any index), not exact bounds.
//  - "..." shortcuts and "%N" interpolation keys are NOT type-checked — they
//    fall back to plain string via the `string & {}` trick below, so you keep
//    autocomplete on real paths without losing the ability to use shortcuts.
//  - Very deep/recursive schemas can hit TS's recursion depth limit
//    ("Type instantiation is excessively deep"); bump `Prev` if you need more
//    than ~8 levels, but each extra level costs compiler/IDE performance.
// -----------------------------------------------------------------------------

/* ---------- Recursion depth cap ---------- */

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7];

/* ---------- 1. Generate every valid path string from an object type ---------- */

type Paths<T, D extends number = 8> = [D] extends [never]
  ? never
  : T extends readonly (infer U)[]
    ? // Array branch: panda addresses elements as "[0]", "[0][1]", etc.
      | `[${number}]`
      | (Paths<U, Prev[D]> extends infer P
          ? P extends string
            ? `[${number}].${P}`
            : never
          : never)
    : T extends object
      ? {
          [K in keyof T & string]:
            | K
            | (Paths<T[K], Prev[D]> extends infer P
                ? P extends string
                  ? `${K}.${P}`
                  : never
                : never);
        }[keyof T & string]
      : never;

/* ---------- 2. Resolve the value type living at a given path ---------- */

type PathValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends `[${number}]`
    ? T extends readonly (infer U)[]
      ? PathValue<U, Rest>
      : never
    : Head extends keyof T
      ? PathValue<T[Head], Rest>
      : never
  : P extends `[${number}]`
    ? T extends readonly (infer U)[]
      ? U
      : never
    : P extends keyof T
      ? T[P]
      : never;

/* ---------- 3. The "keep autocomplete, still allow any string" trick ---------- */
// `string & {}` prevents the union from collapsing to plain `string`, so
// editors still suggest real paths first while shortcuts/interpolated keys
// remain assignable (just untyped).

type LooseOrExact<T> = Paths<T> | (string & {});

/* ---------- 4. Typed factory — this is what actually wires it into panda ---------- */

declare function rawGet(path: string): any; // panda's real getDataFunc, untyped
declare function rawStore(pandata: Record<string, any>, deps?: string | string[]): { ok: boolean; log: string; data: any };

function createPanda<T extends Record<string, any>>() {
  function get<P extends Paths<T>>(path: P): PathValue<T, P>;
  function get(path: string & {}): any; // shortcuts / "*" / interpolated keys
  function get(path: string): any {
    return rawGet(path);
  }

  function store(pandata: Partial<{ [P in LooseOrExact<T>]: any }>, deps?: string | string[]) {
    return rawStore(pandata as Record<string, any>, deps);
  }

  return { get, store };
}

/* ---------- Example, using the README's own `user` shape ---------- */

interface AppState {
  user: {
    name: string;
    job: string;
    stack: string[];
    address: {
      street: string;
      city: string;
      zip: string;
      country: string;
    };
    preferences: {
      newsletter: boolean;
      theme: 'dark' | 'light';
      notifications: {
        email: boolean;
        sms: boolean;
        push: boolean;
      };
    };
  };
}

const { get, store } = createPanda<AppState>();

// ✅ Compiles. `city` is inferred as `string`.
const city = get('user.address.city');

// ✅ Compiles. `theme` is inferred as `'dark' | 'light'`.
const theme = get('user.preferences.theme');

// ✅ Array element access, inferred as `string` (stack: string[]).
const firstStackItem = get('user.stack.[0]');

// ❌ Would be a compile error: "adress" typo isn't in Paths<AppState>.
// const typo = get('user.adress.city');

// ✅ Shortcuts still work (untyped, by design — see limits above).
const pushStatus = get('user...push');

// ✅ store() still accepts either nested objects or flattened path keys.
store({ 'user.preferences.theme': 'dark' });
