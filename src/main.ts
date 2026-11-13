/*
*
* Panda
*
* Advanced JSON-based state manager for React and React Native (Bare and Expo).
*
* @vinoskey524 • Hamet Kévin E. ODOUTAN • vinoskey524@gmail.com (Author)
*
*/

import { useRef, useMemo, useCallback, useSyncExternalStore } from 'react';

/* ---------------------------------------------- Types ---------------------------------------------- */

type MAIN_TYPE = {
    init: (state: PANDA_STORE_STATE) => PANDA_TYPE
};

type PANDA_TYPE = {
    /** 
    * Store pandata 
    */
    store: (...x: STORE_ARG_TYPE) => FUNCTION_DEFAULT_RETURN_TYPE,

    /**
    * Get pandata
    */
    get: (path: '*' | GET_ARG_PATH_TYPE) => any,

    /**
    * Watch pandata
    */
    watch: (x: WATCH_ARG_TYPE) => WATCH_RETURN_TYPE,

    /** 
    * Unwatch pandata
    */
    unwatch: (x: string | string[]) => void,

    /** 
    * Serialize the store for the browser (SSR) 
    */
    dehydrate: (onSkip?: (paths: string[]) => void) => string,

    /** 
    * Load a dehydrated snapshot into the store (SSR, browser side) 
    */
    hydrate: (snapshot: string | JSON_DEFAULT_TYPE) => FUNCTION_DEFAULT_RETURN_TYPE,

    /**
    * Preserve pandata's references
    */
    preserve: (pandata: any) => any,

    /**
    * GenID
    */
    genID: () => string,

    /**
    * Inspect shortcuts
    */
    inspectShortcuts: () => JSON_DEFAULT_TYPE,
};

type STORE_ARG_TYPE = [pandata: JSON_DEFAULT_TYPE, deps?: string | string[]];

type GET_ARG_PATH_TYPE = string | string[] | JSON_STRING_TYPE;

type WATCH_ARG_TYPE = string | JSON_STRING_TYPE;
type WATCH_RETURN_TYPE = {
    on: (callbacks: WATCH_ON_ARG_TYPE, watcherId: [string]) => FUNCTION_DEFAULT_RETURN_TYPE
};
type WATCH_ON_ARG_TYPE = {
    set?: ((key: string | null, data: DEFAULT_TYPES_TYPE) => void) | Function,
    update?: ((key: string | null, data: DEFAULT_TYPES_TYPE) => void) | Function,
    delete?: ((key: string | null, data: DEFAULT_TYPES_TYPE) => void) | Function
};

type WATCHER_ENTRY_TYPE = {
    get: { [watcherId: string]: { key: null, callback: Function } },
    watch: {
        set: { [watcherId: string]: { key: string | null, callback: Function } },
        update: { [watcherId: string]: { key: string | null, callback: Function } },
        delete: { [watcherId: string]: { key: string | null, callback: Function } }
    }
};

/** Watched path -> its watchers */
type WATCHER_DATA_TYPE = Map<string, WATCHER_ENTRY_TYPE>;

/** "$pre_..." id -> the preserved object/function */
type PRESERVE_DATA_TYPE = Map<string, object | Function>;

/** Flat key (e.g. "user.tags.[0]") -> its value */
type FLAT_STORE_TYPE = Map<string, any>;

/** Shortcut (e.g. "a...b") -> the path it resolves to (undefined if it can't be resolved) */
type SHORTCUTS_DATA_TYPE = Map<string, string | undefined>;

/** The nested store: every object is a "Map" (key -> child), every array is an array, anything else is a leaf */
type STORE_TREE_TYPE = Map<string, any>;

/** - */
type READ_CACHE_TYPE = Map<string, { data: any }>;

type WATCHER_SOURCE_TYPE = 'get' | 'watch';
type WATCHER_CALLBACK_TYPE = 'set' | 'update' | 'delete';
type CREATE_WATCHER_ARG_TYPE<T extends WATCHER_SOURCE_TYPE> =
    T extends 'get' ?
    { source: T, path: string, watcherId: string, callback: Function } :
    { source: T, path: string, type: WATCHER_CALLBACK_TYPE, key: string | null, watcherId: string, callback: Function };

type TRIGGER_UPDATE_ARG_TYPE = { path: string | string[], type: 'set' | 'update' | 'delete' };

type FUNCTION_TYPE = 'sync' | 'async';

type GET_REAL_TYPE_RETURN_TYPE = { type: VALID_TYPES_TYPE, valid: boolean };

type DEFAULT_TYPES_TYPE = 'bigint' | 'number' | 'string' | 'boolean' | 'function' | 'symbol' | 'object' | 'null' | 'undefined';

type VALID_TYPES_TYPE = 'bigint' | 'number' | 'string' | 'boolean' | 'function' | 'symbol' | 'array' | 'json' | 'null' | 'undefined';

type JSON_DEFAULT_TYPE = { [key: string]: any };
type JSON_STRING_TYPE = { [key: string]: string };

type FUNCTION_DEFAULT_RETURN_TYPE = { ok: boolean, log: string, data: any };

/** A path token: an object key (string) or an array index (number) */
type PATH_TOKEN = string | number;

/** What a write keeps track of while it edits the stores */
type EDIT_CTX = {
    touchKey: (key: string) => void, /* Called right before a flat key is modified, so that it can be undone */
    containers: Map<string, PATH_TOKEN[]> /* Containers to tidy up once the whole write is applied */
};

/*
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
*/

/* ---------------------------------------------- Typed API ---------------------------------------------- */

/*
* Everything in this section is TYPE-ONLY: it is erased at compile time and adds zero runtime code.
* It powers "createPanda<Schema>()", which gives you a fully path-checked version of the Panda API.
*/

declare const refBrand: unique symbol;
declare const preservedBrand: unique symbol;

/**
* Mark a schema field as "stored by reference" (see "preserve").
* Panda never looks inside a preserved value, so no sub-paths are generated for it.
* @example type Schema = { cart: Ref<{ items: string[] }> }
*/
export type Ref<V> = { readonly [refBrand]: V };

/** Token returned by "preserve()". Only meaningful for the type-checker. */
export type Preserved<V> = string & { readonly [preservedBrand]: V };

/** Recursion budget for path generation (TypeScript gives up around 50 nested instantiations) */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type IsAny<T> = 0 extends 1 & T ? true : false;

/** Values panda never walks into */
type Leaf = string | number | boolean | bigint | symbol | null | undefined | Function | Ref<any>;

/** Any path that uses the "..." shortcut syntax */
type Shortcut = `${string}...${string}`;

/* ---------- Paths ---------- */

/** Append a segment to a path, following panda's syntax: "a.b", "a.[0]", "a.[0][1]", "a.[0].b" */
type Seg<P extends string, S extends string> =
    P extends '' ? S :
    S extends `[${string}` ? (P extends `${string}]` ? `${P}${S}` : `${P}.${S}`) :
    `${P}.${S}`;

/** One { path, value } pair per reachable path of the schema */
type Ent<V, C extends string, D extends number> = { p: C, v: V } | WalkEntries<V, C, Prev[D]>;
type WalkEntries<T, P extends string, D extends number> =
    [D] extends [never] ? never :
    T extends Leaf ? never :
    T extends readonly (infer U)[] ? Ent<U, Seg<P, `[${number}]`>, D> :
    T extends object ? { [K in keyof T & string]-?: Ent<T[K], Seg<P, K>, D> }[keyof T & string] :
    never;
type Entries<T> = WalkEntries<T, '', 12>;

/** Every valid path of a schema. Falls back to "string" when no schema is given. */
export type PandaPaths<T> = IsAny<T> extends true ? string : Entries<T>['p'];

/** Raw (still "Ref"-wrapped) type found at a concrete path */
type RawAt<T, P extends string> =
    IsAny<T> extends true ? any :
    Entries<T> extends infer E ?
    E extends { p: infer EP, v: infer EV } ? (P extends EP ? EV : never) : never :
    never;

/* ---------- Shortcuts ("...") ---------- */

type IsUnion<T, U = T> = [T] extends [never] ? false : T extends any ? ([U] extends [T] ? false : true) : never;
type Unique<T> = [T] extends [never] ? never : [IsUnion<T>] extends [false] ? T : never;

/** "A...B" => the single schema path that starts with A and then reaches B (never if none, or if ambiguous) */
type ResolveOnce<A extends string, B extends string, AP extends string> =
    Unique<Extract<AP, `${A}.${B}` | `${A}.${string}.${B}`>>;

/** Supports chained shortcuts: "a...b...c" */
type ResolveShortcut<S extends string, AP extends string> =
    S extends `${infer A}...${infer R}` ?
    (R extends `${infer B}...${infer More}` ?
        ResolveShortcut<`${ResolveOnce<A, B, AP>}...${More}`, AP> :
        ResolveOnce<A, R, AP>) :
    S;

type ResolvedPath<T, P extends string> = P extends Shortcut ? ResolveShortcut<P, PandaPaths<T>> : P;

/* ---------- Reading ---------- */

/** Unwrap "Ref<V>" => V (what you get back when you read) */
type Unref<V> =
    V extends Ref<infer R> ? R :
    V extends Function ? V :
    V extends readonly (infer U)[] ? Unref<U>[] :
    V extends object ? { [K in keyof V]: Unref<V[K]> } :
    V;

type DeepPartial<V> =
    V extends Function ? V :
    V extends readonly (infer U)[] ? DeepPartial<U>[] :
    V extends object ? { [K in keyof V]?: DeepPartial<V[K]> } :
    V;

/** What get('*') returns. The store is filled progressively, so everything is optional. */
type PandaState<T> = DeepPartial<Unref<T>>;

type PathArg<T> = PandaPaths<T> | Shortcut;
type GetArg<T> = '*' | PathArg<T> | readonly PathArg<T>[] | { readonly [key: string]: PathArg<T> };
type DeleteArg<T> = PathArg<T> | readonly PathArg<T>[];
type WatchArg<T> = PathArg<T> | { readonly [key: string]: PathArg<T> };

type GetValue<T, P extends string> =
    IsAny<T> extends true ? any :
    P extends '*' ? PandaState<T> :
    Unref<RawAt<T, ResolvedPath<T, P>>>;

type GetResult<T, A> =
    A extends string ? GetValue<T, A> :
    A extends readonly unknown[] ? { -readonly [I in keyof A]: GetValue<T, A[I] & string> } :
    { -readonly [K in keyof A]: GetValue<T, A[K] & string> };

type ShortcutError<P extends string> = {
    readonly __pandaError: `The shortcut "${P}" matches no path, or several paths. Be more specific.`
};

type CheckPath<T, P> =
    IsAny<T> extends true ? unknown :
    P extends Shortcut ? ([ResolveShortcut<P, PandaPaths<T>>] extends [never] ? ShortcutError<P> : unknown) :
    unknown;

/** Validates every shortcut found in a get / usePanda / watch argument */
type CheckArg<T, A> =
    A extends string ? CheckPath<T, A> :
    A extends readonly unknown[] ? { [I in keyof A]: CheckPath<T, A[I]> } :
    { [K in keyof A]: CheckPath<T, A[K]> };

/* ---------- Writing ---------- */

/**
* What can be written at a place of the schema.
* - "Ref" fields and functions must go through "preserve()" (a bare function is an updater, not a value).
* - Leaves also accept a synchronous updater: (current) => next
* - Any field can be deleted with "undefined" (see "WriteTree").
*/
type WriteValue<V, Updatable extends boolean = true> =
    [V] extends [Ref<infer R>] ? Preserved<R> :
    [V] extends [Function] ? Preserved<V> :
    [V] extends [Date | Map<any, any> | Set<any>] ? never : /* Not supported: flattened to nothing */
    [V] extends [readonly (infer U)[]] ? readonly WriteValue<U, false>[] :
    [V] extends [object] ? WriteTree<V> :
    Updatable extends true ? V | ((current: V) => V) : V;

/** Regular (nested) writing: every field is optional, "undefined" deletes */
type WriteTree<T> = { [K in keyof T]?: WriteValue<T[K]> | undefined };

/** Path-based writing: { 'user.address.city': 'Paris' } */
type PathWrites<T> = { [E in Entries<T> as E['p']]?: WriteValue<E['v']> | undefined };

/** Argument of store(): nested, path-based, or both mixed. Shortcut keys are accepted but not value-checked. */
type PandaStoreInput<T> =
    IsAny<T> extends true ? JSON_DEFAULT_TYPE :
    WriteTree<T> & PathWrites<T> & { [key: Shortcut]: any };

/** Value accepted by an interpolated "%N" key for the path at dependency index N. */
type StorePathValue<T, P extends string> =
    IsAny<T> extends true ? any :
    IsAny<RawAt<T, ResolvedPath<T, P>>> extends true ? any :
    WriteValue<RawAt<T, ResolvedPath<T, P>>>;

/** Give exact interpolation keys ("%0", "%1", ...) the value type of their matching dependency. */
type TupleInterpolationInput<T, D extends readonly unknown[]> = {
    [K in keyof D as K extends `${infer I extends number}` ? `%${I}` : never]?:
    StorePathValue<T, D[K] & string>
};

type InterpolatedStoreInput<T, D> = (
    D extends readonly unknown[]
    ? TupleInterpolationInput<T, D>
    : { '%0'?: StorePathValue<T, D & string> }
) & JSON_DEFAULT_TYPE;

/** Valid paths for store() interpolation dependencies, preserving tuple indexes for "%N" type checking. */
type StoreDeps<T> = PathArg<T> | readonly PathArg<T>[];

interface StoreFn<T> {
    /** Fully checked version without interpolation. */
    (pandata: PandaStoreInput<T>): FUNCTION_DEFAULT_RETURN_TYPE;

    /**
    * Interpolated keys: dependency paths are schema-checked and exact "%N" updater
    * values use the corresponding dependency's value type.
    */
    <const D extends StoreDeps<T>>(
        pandata: InterpolatedStoreInput<T, D>,
        deps: D & CheckArg<T, D>
    ): FUNCTION_DEFAULT_RETURN_TYPE;
}

/* ---------- Watching ---------- */

type WatchKind = 'set' | 'update' | 'delete';

/** Arguments received by a watcher callback. "delete" callbacks always receive "undefined" (see runWatcherFunctionFunc). */
type WatchCallbackArgs<T, A, K extends WatchKind> =
    IsAny<T> extends true ? [key: string | null, data: any] :
    A extends string ? [key: null, data: K extends 'delete' ? undefined : GetValue<T, A>] :
    { [Key in keyof A & string]: [key: Key, data: K extends 'delete' ? undefined : GetValue<T, A[Key] & string>] }[keyof A & string];

/**
* Callbacks must return nothing ("void | undefined" instead of "void"):
* panda silently ignores async callbacks, so returning a Promise becomes a compile error.
* Unknown keys (anything but set / update / delete) are rejected for the same reason.
*/
type WatchCallbacks<T, A> = {
    set?: (...args: WatchCallbackArgs<T, A, 'set'>) => void | undefined,
    update?: (...args: WatchCallbackArgs<T, A, 'update'>) => void | undefined,
    delete?: (...args: WatchCallbackArgs<T, A, 'delete'>) => void | undefined
};

interface WatchHandle<T, A> {
    on: (callbacks: WatchCallbacks<T, A>, watcherId: [string]) => FUNCTION_DEFAULT_RETURN_TYPE;
}

/* ---------- The typed API ---------- */

export interface PandaTyped<T> {
    /** Store pandata */
    store: StoreFn<T>;

    /** Get pandata: '*' | path | [paths] | { key: path } */
    get: <const A extends GetArg<T>>(path: A & CheckArg<T, A>) => GetResult<T, A>;

    /** Same as "get", but re-renders the component every time the data changes */
    usePanda: <const A extends GetArg<T>>(path: A & CheckArg<T, A>) => GetResult<T, A>;

    /** Watch pandata */
    watch: <const A extends WatchArg<T>>(path: A & CheckArg<T, A>) => WatchHandle<T, A>;

    /** Unwatch pandata */
    unwatch: (watcherId: string | string[]) => void;

    /** Serialize the whole store into a <script>-safe string (SSR). Preserved values are dropped. */
    dehydrate: (onSkip?: (paths: string[]) => void) => string;

    /** Load a dehydrated snapshot (string or parsed object) into the store. Use it in the browser before hydrating React. */
    hydrate: (snapshot: string | object) => { ok: boolean, log: string, data?: any };

    /** Preserve pandata's references */
    preserve: <V extends object | Function>(pandata: V) => Preserved<V>;

    /** Generate an ID */
    genID: () => string;

    /** Inspect shortcuts */
    inspectShortcuts: () => { [shortcut: string]: PandaPaths<T> | undefined };
}

/*
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
*/

/* ---------------------------------------------- Constants ---------------------------------------------- */

let _dev_ = false;

const _default_valid_types_: VALID_TYPES_TYPE[] = ['bigint', 'string', 'number', 'boolean', 'function', 'symbol', 'array', 'json', 'null', 'undefined'];

/** Max number of memoized reads per instance (dynamic paths could otherwise grow it forever) */
const _read_cache_max_ = 1000;

/*
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
*/

/* ---------------------------------------------- DATA Logistic ---------------------------------------------- */

type PANDA_STORE_STATE = {
    storeDATA: { current: STORE_TREE_TYPE };
    storeTopLevelDATA: { current: FLAT_STORE_TYPE };
    watcherDATA: { current: WATCHER_DATA_TYPE };
    preserveDATA: { current: PRESERVE_DATA_TYPE };
    shortcutsDATA: { current: SHORTCUTS_DATA_TYPE };
    storeVersion: { current: number };
    storeListeners: { current: Set<() => void> };
    readCache: { current: READ_CACHE_TYPE }; /* Memoized reads, by resolved path */
};

const createPandaStoreState = (): PANDA_STORE_STATE => ({
    storeDATA: { current: new Map() },
    storeTopLevelDATA: { current: new Map() },
    watcherDATA: { current: new Map() },
    preserveDATA: { current: new Map() },
    shortcutsDATA: { current: new Map() },
    storeVersion: { current: 0 },
    storeListeners: { current: new Set() },
    readCache: { current: new Map() }
});

/** Browser instances retain the historical shared store; server instances are isolated per createPanda() call. */
const sharedPandaStoreState = createPandaStoreState();
let activePandaStoreState = sharedPandaStoreState;

/** Run synchronous store operations against the owning Panda instance. */
const withPandaStoreState = <T>(state: PANDA_STORE_STATE, operation: () => T): T => {
    const previousState = activePandaStoreState;
    activePandaStoreState = state;
    try { return operation() }
    finally { activePandaStoreState = previousState }
};

/** State references resolve against the currently executing Panda instance. */
const storeDATA = {
    get current() { return activePandaStoreState.storeDATA.current; },
    set current(value: STORE_TREE_TYPE) { activePandaStoreState.storeDATA.current = value; }
};
const storeTopLevelDATA = {
    get current() { return activePandaStoreState.storeTopLevelDATA.current; },
    set current(value: FLAT_STORE_TYPE) { activePandaStoreState.storeTopLevelDATA.current = value; }
};
const watcherDATA = {
    get current() { return activePandaStoreState.watcherDATA.current; },
    set current(value: WATCHER_DATA_TYPE) { activePandaStoreState.watcherDATA.current = value; }
};
const preserveDATA = {
    get current() { return activePandaStoreState.preserveDATA.current; },
    set current(value: PRESERVE_DATA_TYPE) { activePandaStoreState.preserveDATA.current = value; }
};
const shortcutsDATA = {
    get current() { return activePandaStoreState.shortcutsDATA.current; },
    set current(value: SHORTCUTS_DATA_TYPE) { activePandaStoreState.shortcutsDATA.current = value; }
};
const storeVersion = {
    get current() { return activePandaStoreState.storeVersion.current; },
    set current(value: number) { activePandaStoreState.storeVersion.current = value; }
};
const storeListeners = {
    get current() { return activePandaStoreState.storeListeners.current; },
    set current(value: Set<() => void>) { activePandaStoreState.storeListeners.current = value; }
};
const readCache = {
    get current() { return activePandaStoreState.readCache.current; },
    set current(value: Map<string, { data: any }>) { activePandaStoreState.readCache.current = value; }
};

/*
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
*/

/* ---------------------------------------------- Functions ---------------------------------------------- */

/** Log */
const logFunc = (...log: any[]): void => { if (_dev_) console.log(...log) };

/** Generate ID */
const generateIdFunc = (): string => {
    const val = '0aW9zXe8CrVt1By5NuA46iZ3oEpRmTlYkUjIhOgPfMdQsSqDwFxGcHvJbKnL';
    let id = '';
    for (var i = 0; i < val.length; i++)
        id += val.charAt(Math.floor(Math.random() * val.length));
    return id;
};

/** Delay function execution */
const delayFunc = (x?: number): Promise<void> => { return new Promise(resolve => setTimeout(resolve, x ?? 1)) };

/** Check if a property exists */
const hasPropertyFunc = (x: JSON_DEFAULT_TYPE, y: string): boolean => {
    const obj = (typeof x === 'object' && x !== null) ? x : {};
    return Object.prototype.hasOwnProperty.call(obj, y);
};

/** Detect function type "sync/async" */
const getFunctionTypeFunc = (func: Function): FUNCTION_TYPE => {
    const isSync = func.constructor.name === 'Function';
    return isSync ? 'sync' : 'async';
};

/** Get path type */
const getPathTypeFunc = (path: string): 'array' | 'json' => (path[0] === '[') && (path[path.length - 1] === ']') ? 'array' : 'json';

/** Get real type */
const getRealTypeFunc = (data: any, validTypes?: VALID_TYPES_TYPE[]): GET_REAL_TYPE_RETURN_TYPE => {
    const valids = validTypes ?? _default_valid_types_;

    let typ = typeof data;
    if (typ === 'object') typ = ((data === null) ? 'null' : Array.isArray(data) ? 'array' : 'json') as any;

    const type: VALID_TYPES_TYPE = typ as VALID_TYPES_TYPE;
    const valid = valids.includes(type);

    return { type, valid };
};

/** 
* True if "key" is "path" itself, or lives under it (on a path boundary). 
* "user" matches "user.name" but not "username", "list.[1" matches "list.[1]" and "list.[1_0]" but not "list.[10]". 
*/
const isPathOrChildFunc = (key: string, path: string): boolean => {
    if (!key.startsWith(path)) return false;
    if (key.length === path.length) return true;
    const next = key[path.length];
    if (next === '.') return true;
    const insideBracket = path.lastIndexOf('[') > path.lastIndexOf(']'); /* The last bracket of "path" has been removed */
    return insideBracket && (next === ']' || next === '_');
};

/** Find "seg" in "key", starting at "from", only where it ends on a path boundary (-1 if not found) */
const findSegmentFunc = (key: string, seg: string, from: number): number => {
    let i = key.indexOf(seg, Math.max(from, 0));
    while (i !== -1) {
        if (isPathOrChildFunc(key.slice(i), seg)) return i;
        i = key.indexOf(seg, i + 1);
    }
    return -1;
};

/** Empty arrays / JSON objects have no leaf, so they are stored as-is */
const isEmptyContainerFunc = (v: any): boolean =>
    (Array.isArray(v) && v.length === 0) || (getRealTypeFunc(v).type === 'json' && hasNoKeysFunc(v));

/** Strict equality, except that two empty containers of the same kind are equal */
const sameValueFunc = (a: any, b: any): boolean =>
    a === b || (isEmptyContainerFunc(a) && isEmptyContainerFunc(b) && Array.isArray(a) === Array.isArray(b));

/** Only plain JSON objects are supported (not Date, Map, Set, class instances...) */
const assertPlainObjectFunc = (v: any): void => {
    if (typeof v !== 'object' || v === null || Array.isArray(v))
        return;
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null)
        throw new Error(`Invalid type ("${proto?.constructor?.name ?? 'object'}") found!`);
};

/** Get a value from a JSON object/array, following panda's path syntax: "a.b", "a.[0]", "a.[0_1]", "a.[0].b" */
const getFromPathFunc = (source: any, path: string): any => {
    if (path.length === 0) return source;
    let cursor: any = source;
    const segments = path.split('.');
    for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        if (seg[0] === '[') {
            const idxTab = seg.replaceAll('[', '').replaceAll(']', '').split('_');
            for (let i = 0; i < idxTab.length; i++) {
                if (!Array.isArray(cursor)) return undefined;
                cursor = cursor[Number(idxTab[i])];
            }
        } else {
            if (!hasPropertyFunc(cursor, seg)) return undefined;
            cursor = cursor[seg];
        }
    }
    return cursor;
};

/** Memoize a successful read */
const cacheReadFunc = (path: string, data: any): void => {
    if (readCache.current.size >= _read_cache_max_)
        readCache.current.clear();
    readCache.current.set(path, { data });
};

/** 
* Forget every memoized read that a write could have changed: the ones at, above or below a changed path. 
* Reads of untouched paths stay in the cache, so they keep the very same reference. 
*/
const invalidateReadCacheFunc = (changedKeys: string[]): void => {
    const cache = readCache.current;
    if (cache.size === 0 || changedKeys.length === 0)
        return;
    cache.delete('*'); /* The whole-store read depends on everything */
    const stripped = changedKeys.map((k) => formatPathFunc({ path: k, removeLastBracket: true }));
    const cached = Array.from(cache.keys());
    for (let c = 0; c < cached.length; c++)
        for (let i = 0; i < changedKeys.length; i++)
            if (
                isPathOrChildFunc(changedKeys[i], cached[c]) || /* a changed key lives under the cached path */
                isPathOrChildFunc(cached[c], changedKeys[i]) || /* the cached path lives under a changed key */
                isPathOrChildFunc(cached[c], stripped[i])       /* same, for "list.[0]" vs "list.[0_1" */
            ) { cache.delete(cached[c]); break; }
};

/** True if both are the same value, or arrays/plain objects whose items are all strictly equal */
const shallowSameFunc = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++)
        if (!hasPropertyFunc(b, ka[i]) || a[ka[i]] !== b[ka[i]]) return false;
    return true;
};

/** "a.[0_1].b" -> ["a", 0, 1, "b"] (object keys stay strings, array indexes become numbers) */
const tokenizePathFunc = (path: string): PATH_TOKEN[] => {
    const tokens: PATH_TOKEN[] = [];
    const segments = path.split('.');
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.charCodeAt(0) === 91) { /* "[" */
            const idx = seg.replaceAll('[', '').replaceAll(']', '').split('_');
            for (let j = 0; j < idx.length; j++)
                tokens.push(Number(idx[j]));
        } else tokens.push(seg);
    }
    return tokens;
};

/** ["a", 0, 1, "b"] -> "a.[0_1].b" (the flat key format), optionally only the first "end" tokens */
const joinPathFunc = (tokens: PATH_TOKEN[], end: number = tokens.length): string => {
    let out = '';
    let prevIsIndex = false;
    for (let i = 0; i < end; i++) {
        const t = tokens[i];
        if (typeof t === 'number') {
            if (prevIsIndex) out = out.slice(0, -1) + '_' + t + ']';
            else out += (out.length > 0 ? '.' : '') + '[' + t + ']';
            prevIsIndex = true;
        } else {
            out += (out.length > 0 ? '.' : '') + t;
            prevIsIndex = false;
        }
    }
    return out;
};

/** True if the plain object has no key (stops at the first one, so a wide object costs nothing) */
const hasNoKeysFunc = (o: any): boolean => { for (const _ in o) return false; return true; };

/** Objects ("Map") and arrays (the nested store only holds those, and plain values) */
const isContainerFunc = (v: any): boolean => v !== null && typeof v === 'object';

/** True if a node of the nested store has no child (an empty "Map" or an empty array) */
const isEmptyNodeFunc = (node: any): boolean => node instanceof Map ? node.size === 0 : Array.isArray(node) && node.length === 0;

/** True if "node" has a child at "tok" (an index for arrays, a key for objects) */
const hasChildFunc = (node: any, tok: PATH_TOKEN): boolean => {
    if (Array.isArray(node)) return typeof tok === 'number' && tok >= 0 && tok < node.length;
    if (node instanceof Map) return typeof tok === 'string' && node.has(tok);
    return false;
};

/** The child of "node" at "tok" (check "hasChildFunc" first) */
const childOfFunc = (node: any, tok: PATH_TOKEN): any => node instanceof Map ? node.get(tok as string) : node[tok];

/** Walk the nested store; undefined if the path isn't there */
const getNodeFunc = (root: any, tokens: PATH_TOKEN[], end: number = tokens.length): any => {
    let node = root;
    for (let i = 0; i < end; i++) {
        if (!hasChildFunc(node, tokens[i]))
            return undefined;
        node = childOfFunc(node, tokens[i]);
    }
    return node;
};

/** 
* True if something lives at the first "end" tokens: a container, or a leaf that really has a flat key 
* (an array hole is a "null" in the nested store but has no key, so it doesn't count). 
*/
const existsAtFunc = (tokens: PATH_TOKEN[], end: number): boolean => {
    const node = getNodeFunc(storeDATA.current, tokens, end);
    if (node === undefined)
        return false;
    return isContainerFunc(node) || storeTopLevelDATA.current.has(joinPathFunc(tokens, end));
};

/** Every flat key (leaf or empty container) that lives under "node" */
const collectLeafKeysFunc = (node: any, tokens: PATH_TOKEN[], out: string[]): void => {
    if (isContainerFunc(node)) {
        const keys: PATH_TOKEN[] = Array.isArray(node) ? node.map((_: any, i: number) => i) : Array.from((node as STORE_TREE_TYPE).keys());
        /* Empty container: it is a key itself */
        if (keys.length === 0) {
            if (tokens.length > 0) out.push(joinPathFunc(tokens));
            return;
        }
        /* - */
        for (let i = 0; i < keys.length; i++) {
            tokens.push(keys[i]);
            collectLeafKeysFunc(childOfFunc(node, keys[i]), tokens, out);
            tokens.pop();
        }
        return;
    }
    const key = joinPathFunc(tokens);
    if (storeTopLevelDATA.current.has(key)) out.push(key); /* Skips array holes */
};

/** A value to put in the nested store: empty containers are copied, never shared with the flat store */
const copyLeafFunc = (v: any): any => isEmptyContainerFunc(v) ? (Array.isArray(v) ? [] : new Map()) : v;

/** - */
const touchContainerFunc = (ctx: EDIT_CTX, tokens: PATH_TOKEN[]): void => {
    const k = joinPathFunc(tokens);
    if (!ctx.containers.has(k))
        ctx.containers.set(k, tokens.slice());
};

/** - */
const putChildFunc = (node: any, tok: PATH_TOKEN, value: any, ctx: EDIT_CTX, nodeTokens: PATH_TOKEN[]): void => {
    if (typeof tok === 'number' && node.length < tok) {
        touchContainerFunc(ctx, nodeTokens); /* The gap is filled with "null" (see "normalizeTreeFunc") */
        while (node.length < tok) node.push(null);
    }
    if (node instanceof Map) node.set(tok as string, value);
    else node[tok] = value;
};

/** - */
const assertKindFunc = (node: any, tokens: PATH_TOKEN[], i: number): void => {
    if ((typeof tokens[i] === 'number') !== Array.isArray(node))
        throw new Error(`can't write "${joinPathFunc(tokens, i + 1)}": its parent is ${Array.isArray(node) ? 'an array' : 'an object'}`);
};

/** 
* Write one leaf into the nested store, creating the containers on the way. 
* It checks everything first and only then attaches the new branch, so a conflict leaves the store untouched. 
*/
const setInTreeFunc = (root: any, tokens: PATH_TOKEN[], value: any, ctx: EDIT_CTX): void => {
    let node = root;
    let i = 0;
    for (; i < tokens.length - 1; i++) {
        assertKindFunc(node, tokens, i);
        if (!hasChildFunc(node, tokens[i]))
            break;
        const child = childOfFunc(node, tokens[i]);
        if (child === null) { /* A hole (or a "null" leaf): it gets replaced, and loses its key if it had one */
            const key = joinPathFunc(tokens, i + 1);
            if (storeTopLevelDATA.current.has(key)) {
                ctx.touchKey(key);
                storeTopLevelDATA.current.delete(key);
            }
            break;
        }
        if (!isContainerFunc(child) || Array.isArray(child) !== (typeof tokens[i + 1] === 'number'))
            throw new Error(`"${joinPathFunc(tokens, i + 1)}" holds a value that can't contain "${joinPathFunc(tokens, i + 2)}"`);
        node = child;
    }
    assertKindFunc(node, tokens, i);

    /* Build the missing branch apart, then attach it */
    let branch: any = value;
    for (let j = tokens.length - 1; j > i; j--) {
        const container: any = typeof tokens[j] === 'number' ? [] : new Map();
        putChildFunc(container, tokens[j], branch, ctx, tokens.slice(0, j));
        branch = container;
    }
    putChildFunc(node, tokens[i], branch, ctx, tokens.slice(0, i));
};

/** Delete one leaf from the nested store (its flat key must already be gone). Emptied containers are tidied up later. */
const deleteFromTreeFunc = (root: any, tokens: PATH_TOKEN[], ctx: EDIT_CTX): void => {
    let node = root;
    for (let i = 0; i < tokens.length - 1; i++) {
        if (!hasChildFunc(node, tokens[i])) return;
        node = childOfFunc(node, tokens[i]);
        if (!isContainerFunc(node)) return;
    }
    const last = tokens[tokens.length - 1];
    if (!hasChildFunc(node, last)) return;
    if (Array.isArray(node)) node[last as number] = null; /* A hole, for now */
    else (node as STORE_TREE_TYPE).delete(last as string);
    touchContainerFunc(ctx, tokens.slice(0, tokens.length - 1));
};

/** 
* Tidy up the containers a write touched, deepest first: 
* - trailing array holes are dropped, the other holes become real "null" items (an array can't have a gap), 
* - a container left empty by a deletion disappears (an empty one that was written on purpose has its own key, it stays). 
* This is the result a full rebuild of the store used to give, without rebuilding it. 
*/
const normalizeTreeFunc = (ctx: EDIT_CTX): void => {
    const flat = storeTopLevelDATA.current;
    const tree = storeDATA.current;
    const buckets: PATH_TOKEN[][][] = [];
    const queued = new Set<string>();
    const queue = (tokens: PATH_TOKEN[]): void => {
        const k = joinPathFunc(tokens);
        if (queued.has(k)) return;
        queued.add(k);
        if (!buckets[tokens.length]) buckets[tokens.length] = [];
        buckets[tokens.length].push(tokens);
    };
    ctx.containers.forEach((tokens) => queue(tokens));

    for (let depth = buckets.length - 1; depth >= 0; depth--) {
        const list = buckets[depth];
        if (!list) continue;
        for (let n = 0; n < list.length; n++) {
            const tokens = list[n];
            const node = getNodeFunc(tree, tokens);
            if (!isContainerFunc(node)) continue; /* Already gone */

            if (Array.isArray(node)) {
                while (node.length > 0 && node[node.length - 1] === null && !flat.has(joinPathFunc([...tokens, node.length - 1]))) node.pop();
                for (let i = 0; i < node.length; i++) {
                    if (node[i] !== null) continue;
                    const key = joinPathFunc([...tokens, i]);
                    if (flat.has(key)) continue;
                    ctx.touchKey(key);
                    flat.set(key, null);
                }
            }

            const empty = isEmptyNodeFunc(node);
            if (!empty || tokens.length === 0 || flat.has(joinPathFunc(tokens))) continue;

            /* Left empty by a deletion: remove it from its parent (which then needs tidying too) */
            const parentTokens = tokens.slice(0, tokens.length - 1);
            const parent = getNodeFunc(tree, parentTokens);
            const tok = tokens[tokens.length - 1];
            if (Array.isArray(parent)) parent[tok as number] = null;
            else (parent as STORE_TREE_TYPE).delete(tok as string);
            queue(parentTokens);
        }
    }
};

/** Deep copy of a part of the nested store as plain JSON, giving back what "preserve" holds instead of its "$pre_" references */
const cloneTreeFunc = (node: any): any => {
    if (Array.isArray(node)) {
        const out: any[] = new Array(node.length);
        for (let i = 0; i < node.length; i++) out[i] = cloneTreeFunc(node[i]);
        return out;
    }
    if (node instanceof Map) { /* The nested store holds "Map"s, what is handed out are plain objects */
        const out: JSON_DEFAULT_TYPE = {};
        node.forEach((child, k) => { out[k] = cloneTreeFunc(child); });
        return out;
    }
    if (typeof node === 'string' && isPreservedFunc(node)) return preserveDATA.current.get(node);
    return node;
};

/** Clone object */
const cloneObjectFunc = (object: STORE_TREE_TYPE | any[]): any => cloneTreeFunc(object);

/** Add shortcut */
const addShortcutFunc = (path: string, value: any): void => {
    const tab: string[] = [];
    const split = path.split('.');
    for (let i = 0; i < split.length; i++) {
        const path = split[i];
        const isArr = getPathTypeFunc(path) === 'array';
        if (isArr) {
            const v = path.replaceAll('_', '][');
            tab.push(v);
            continue;
        }
        tab.push(path);
    }
    const key = tab.join('.');
    shortcutsDATA.current.set(key, value);
};

/** Extract main form a path */
const extractMainKeyFunc = (path: string): string => {
    const fpath = formatPathFunc({ path });
    const split = fpath.split('.').reverse();
    let mkey = '';
    for (let i = 0; i < split.length; i++) {
        if (mkey.length > 0)
            break;
        const paf = split[i];
        if (getPathTypeFunc(paf) === 'array')
            continue;
        mkey = paf;
    }
    return mkey;
};

/** Resolve path */
const resolvePathFunc = (x: { path: string }): string => {
    const path = x.path;

    /* - */
    if (!path.includes('...'))
        return path;

    /* - */
    const split = path.split('...');
    let duo = [split.shift(), null];
    do {
        /* - */
        duo[1] = split.shift();

        /* Filter */
        const p0 = formatPathFunc({ path: duo[0] + '.', removeLastBracket: true });
        const p1 = formatPathFunc({ path: '.' + duo[1], removeLastBracket: true });
        const p1Raw = formatPathFunc({ path: '.' + duo[1] });
        /* End position of the target segment inside a full path (-1 if it isn't there) */
        const endOf = (fp: string): number => {
            const i = findSegmentFunc(fp, p1, p0.length - 1);
            return i === -1 ? -1 : i + (fp.startsWith(p1Raw, i) ? p1Raw.length : p1.length);
        };
        const tab = Array.from(storeTopLevelDATA.current.keys());
        let filter = tab.filter((e) => e.startsWith(p0) && endOf(e) !== -1);
        let flen = filter.length;

        /* If no path found */
        if (flen === 0) {
            addShortcutFunc(path, undefined);
            throw new Error(`Impossible to resolve path "${path}"`);
        }

        /* 
        * If more than one path found, 
        * then check if the pandata is a JSON object 
        * and try to correct the filter's result and length.
        */
        const ltab: boolean[] = [];
        const lpaf: JSON_STRING_TYPE = {};
        if (flen > 1) {
            /* Process each path */
            for (let i = 0; i < flen; i++) {
                const pf = filter[i];
                const end = endOf(pf);

                /* Check if the last/target key appears once, in the middle of the full path */
                const inMiddle = findSegmentFunc(pf, p1, end) === -1 && end < pf.length;
                ltab.push(inMiddle);

                /* Save the path up to the target key */
                lpaf[pf.slice(0, end)] = pf.slice(0, end);
            }

            /* Update result and length if all paths result in the same JSON object */
            const appearsOnceInMiddle = !ltab.includes(false);
            const samePrefixPath = Object.keys(lpaf).length === 1;
            const allPathsResultInTheSameJSONObject = appearsOnceInMiddle && samePrefixPath;
            if (allPathsResultInTheSameJSONObject) {
                const fpath = filter[0];
                filter = [fpath.slice(0, endOf(fpath))];
                flen = filter.length;
            }
        }

        /* If more than one path found */
        if (flen > 1) {
            const format = formatPathFunc({ path: filter[0] });
            const tab = format.split('.');

            /* - */
            const targ = tab.reverse()[0];
            const isArray = getPathTypeFunc(targ) === 'array';
            if (!isArray) {
                addShortcutFunc(path, undefined);
                throw new Error(`Many paths found for "${path}"`);

            } else {
                const mkey = extractMainKeyFunc(path);
                let many = false;

                /* - */
                let idx = -1;
                for (let i = 0; i < flen; i++) {
                    const paf = filter[i];
                    const pos = paf.indexOf(mkey);

                    /* Set index the first time */
                    if (idx === -1) {
                        idx = pos;
                        continue;
                    }

                    /* - */
                    if (pos !== idx) {
                        many = true;
                        break;
                    }
                }

                /* - */
                if (many) {
                    addShortcutFunc(path, undefined);
                    throw new Error(`Many paths found for "${path}"`);
                }
            }

            /* - */
            tab.reverse();
            let arr: string[] = [];
            for (let m = 0; m < tab.length; m++) {
                const paf = tab[m];
                arr.push(paf)
                if (paf === duo[1])
                    break;
            }

            /* - */
            duo[0] = arr.join('.');
        }
        /* If only one path found */
        else {
            const fpath = filter[0];
            duo[0] = fpath.slice(0, endOf(fpath));
        }

    } while (split.length !== 0);

    /* - */
    addShortcutFunc(path, duo[0]);

    /* Return full path */
    return duo[0];
};

/** Extract pandata from path */
const extractPandataFromPathFunc = (x: { path: '*' | string }): FUNCTION_DEFAULT_RETURN_TYPE => {
    let res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        let path = x.path;
        if (path === '*') {
            const hit = readCache.current.get('*');
            if (hit) {
                res.data = hit.data;
                return res;
            }
            res.data = cloneObjectFunc(storeDATA.current);
            cacheReadFunc('*', res.data);

        } else {
            /* Format path */
            path = formatPathFunc({ path, removeLastBracket: true });
            path = resolvePathFunc({ path });

            /* Nothing changed under this path since the last read: hand back the same value (stable reference) */
            const hit = readCache.current.get(path);
            if (hit) {
                res.data = hit.data;
                return res;
            }

            /* Look the path up in the nested store */
            const tokens = tokenizePathFunc(path);
            const exists = existsAtFunc(tokens, tokens.length);

            /* Process preserved path: a preserved value may sit above this path */
            if (!exists) {
                const flat = storeTopLevelDATA.current;
                for (let i = 1; i < tokens.length; i++) {
                    const ckey = joinPathFunc(tokens, i);
                    if (!flat.has(ckey))
                        continue;
                    const val = flat.get(ckey);
                    if (typeof val === 'string' && isPreservedFunc(val)) {
                        const preData = preserveDATA.current.get(val);
                        const rpath = joinPathFunc(tokens.slice(i));
                        const jget = getFromPathFunc(preData, rpath);
                        if (jget === undefined)
                            throw new Error(`No data found at "${rpath}" (${val})!`);
                        res.data = jget;
                        return res;
                    }
                    break;
                }
                throw new Error(`No data found at "${path}"!`);
            }

            /* When path exists and data isn't preserved */
            const pandata = cloneTreeFunc(getNodeFunc(storeDATA.current, tokens));
            res.data = pandata;

            /* Cache read */
            if (pandata !== undefined) cacheReadFunc(path, pandata);
        }

    } catch (e: any) {
        res.ok = false;
        res.log = e.message;
        logFunc(`Err :: extractPandataFromPathFunc() => ${e.message}`);
    }
    return res;
};

/** Format path */
const formatPathFunc = (x: { path: string, removeLastBracket?: true }): string => {
    let path = x.path.replaceAll('][', '_').replaceAll('].[', '_');
    if (x.removeLastBracket) {
        const pathSplit = path.split('');
        if (pathSplit[pathSplit.length - 1] === ']')
            pathSplit.pop();
        path = pathSplit.join('');
    }
    return path;
};

/** Is preserved */
const isPreservedFunc = (value: string) => typeof value === 'string' && value.includes('$pre_') && value.indexOf('$pre_') === 0;

/** 
* Make a write follow the "replace" semantics that a flat map can't express by itself: 
* - an array is replaced as a whole (no stale tail), 
* - writing a leaf (or deleting a path) clears everything that lived under it, 
* - writing under a leaf/empty container clears that leaf/container, 
* - an array and an object can't live at the same place: writing one clears the other, 
* - an empty "{}" never wipes an existing object. 
* Every stale path is turned into an "undefined" write, so the regular diff/watcher flow handles it. 
* It only walks the part of the nested store the write lands in (never the whole store). 
*/
const reconcilePandataFunc = (x: { pandata: JSON_DEFAULT_TYPE, arrays: string[], replace?: string[] }): void => {
    const pandata = x.pandata;
    const flat = storeTopLevelDATA.current;
    const tree = storeDATA.current;
    const stale: string[] = [];
    const replaceKeys = new Set(x.replace ?? []);

    /* Arrays (and values replaced by an update function) are replaced as a whole */
    const roots = [...x.arrays, ...(x.replace ?? [])];
    const rootSet = new Set<string>();
    for (let a = 0; a < roots.length; a++) {
        const tokens = tokenizePathFunc(resolvePathFunc({ path: roots[a] }));
        rootSet.add(joinPathFunc(tokens));
        const node = getNodeFunc(tree, tokens);
        if (node !== undefined) collectLeafKeysFunc(node, tokens.slice(), stale);
    }
    const underRoot = (tokens: PATH_TOKEN[]): boolean => { /* Inside something that is replaced as a whole */
        for (let end = 1; end < tokens.length; end++) if (rootSet.has(joinPathFunc(tokens, end))) return true;
        return false;
    };

    /* - */
    const keys = Object.keys(pandata);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = pandata[k];
        if (typeof v === 'function') continue; /* Update functions are already resolved at this point */
        const tokens = tokenizePathFunc(k);
        const node = getNodeFunc(tree, tokens);

        /* "{}" over an existing object: nothing to write */
        if (
            v !== undefined && !Array.isArray(v) && isEmptyContainerFunc(v) && !replaceKeys.has(k) &&
            !underRoot(tokens) && node instanceof Map && node.size > 0
        ) {
            delete pandata[k];
            continue;
        }

        /* Whatever lived under this path is gone */
        if (isContainerFunc(node)) collectLeafKeysFunc(node, tokens.slice(), stale);
        if (v === undefined) continue;

        /* A leaf (or empty container) above this path is gone, and an array can't live next to an object */
        let cur: any = tree;
        for (let n = 0; n < tokens.length; n++) {
            const tok = tokens[n];
            if (Array.isArray(cur) !== (typeof tok === 'number')) { /* Wrong kind of container for this key/index */
                collectLeafKeysFunc(cur, tokens.slice(0, n), stale);
                break;
            }
            if (!hasChildFunc(cur, tok)) break; /* Nothing below: no conflict */
            if (n === tokens.length - 1) break;
            const child = childOfFunc(cur, tok);
            if (!isContainerFunc(child)) { /* A leaf above this path */
                const key = joinPathFunc(tokens, n + 1);
                if (flat.has(key)) stale.push(key);
                break;
            }
            const ckey = joinPathFunc(tokens, n + 1);
            if (flat.has(ckey)) { /* A container that has its own key is an empty one: it is above this path */
                stale.push(ckey);
                break;
            }
            cur = child;
        }
    }

    /* - */
    for (let d = 0; d < stale.length; d++)
        if (!hasPropertyFunc(pandata, stale[d])) pandata[stale[d]] = undefined;
};

/** Update store */
const updateStoreDataFunc = (x: { pandata: JSON_DEFAULT_TYPE, arrays?: string[] }): FUNCTION_DEFAULT_RETURN_TYPE => {
    let res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    let rollback: (() => void) | undefined; /* Puts the store back as it was if the update fails halfway */
    try {
        const pandata: JSON_DEFAULT_TYPE = {};

        /* Resolve paths */
        for (let k in x.pandata) {
            const rpaf = resolvePathFunc({ path: k });
            pandata[rpaf] = x.pandata[k];
        }

        /* Both stores are edited in place, and only where the write lands */
        const flat = storeTopLevelDATA.current;
        const tree = storeDATA.current;

        /* Run "update" functions: they all see the store as it was before this write */
        const arrays: string[] = [...(x.arrays ?? [])];
        const replace: string[] = []; /* Paths whose whole value is replaced by an object/array an update function returned */
        const preKeys = Object.keys(pandata);
        for (let p = 0; p < preKeys.length; p++) {
            const path = preKeys[p];
            const val = pandata[path];
            if (typeof val !== 'function') continue;

            /* Check if the update function is sync */
            const isSync = getFunctionTypeFunc(val) === 'sync';
            if (!isSync)
                throw new Error(`You try to update the value at "${path}" with an async function!`);

            /* Set update result to "newVal" */
            let current = flat.get(path);
            if (current && isPreservedFunc(current))
                current = preserveDATA.current.get(current);
            const func = val as Function;
            const result = func(current);
            if (result && typeof result.then === 'function')
                throw new Error(`You try to update the value at "${path}" with an async function!`);

            /* An object/array replaces the whole value at this path, anything else is a plain leaf */
            if (result !== null && typeof result === 'object') {
                delete pandata[path];
                const flattened = topLevelJsonFunc({ data: { [path]: result }, arrays });
                if (!flattened.ok)
                    throw new Error(flattened.log);
                Object.assign(pandata, flattened.data);
                replace.push(path);
            } else pandata[path] = result;
        }

        /* Turn "replace" semantics (arrays, subtree deletion...) into explicit deletions */
        reconcilePandataFunc({ pandata, arrays, replace });

        /* Find what really changes (a no-op delete, or the same value, changes nothing) */
        const candidates: string[] = []; /* The changes that were asked for and look different from what is stored */
        const toDelete: string[] = [];
        const toSet: string[] = [];
        const pKeys = Object.keys(pandata);
        for (let i = 0; i < pKeys.length; i++) {
            const k = pKeys[i];
            const nv = pandata[k];
            const has = flat.has(k);
            if (nv === undefined) {
                if (has) {
                    candidates.push(k);
                    toDelete.push(k);
                }
                continue;
            }
            if (has && sameValueFunc(nv, flat.get(k))) continue;
            candidates.push(k);
            toSet.push(k);
        }

        /* - */
        const newPandata: JSON_STRING_TYPE = {};
        const updatedPandata: JSON_STRING_TYPE = {};
        const deletedPandata: JSON_STRING_TYPE = {};

        /* 
        * What each change affects: its own path and all of its ancestors, as they are before anything is touched. 
        * (Only the paths of the changes are looked at, never the whole store.) 
        */
        type AFFECTED = { path: string, tokens: PATH_TOKEN[], existed: boolean, watched: boolean, wasLeaf: boolean };
        const affectedByKey = new Map<string, AFFECTED[]>();
        for (let c = 0; c < candidates.length; c++) {
            const tokens = tokenizePathFunc(candidates[c]);
            const list: AFFECTED[] = [];
            for (let end = 1; end <= tokens.length; end++) {
                const path = formatPathFunc({ path: joinPathFunc(tokens, end), removeLastBracket: true });
                list.push({
                    path, tokens: tokens.slice(0, end),
                    existed: existsAtFunc(tokens, end),
                    watched: watcherDATA.current.has(path),
                    wasLeaf: flat.has(path)
                });
            }
            affectedByKey.set(candidates[c], list);
        }

        /* Update both stores. Deletions go first, so that a leaf can turn into a container (and the reverse) */
        const undo: { key: string, had: boolean, old: any }[] = [];
        const ctx: EDIT_CTX = {
            touchKey: (key) => undo.push({ key, had: flat.has(key), old: flat.get(key) }),
            containers: new Map()
        };

        /* Delete "undefined" values, Set others */
        const put = (key: string, value: any, c: EDIT_CTX): void => {
            const tokens = tokenizePathFunc(key);
            if (value === undefined) {
                if (flat.has(key)) c.touchKey(key);
                flat.delete(key);
                deleteFromTreeFunc(tree, tokens, c);
            } else {
                c.touchKey(key);
                flat.set(key, value);
                setInTreeFunc(tree, tokens, copyLeafFunc(value), c);
            }
        };

        /* Undo changes if something went wrong */
        rollback = () => {
            const back: EDIT_CTX = { touchKey: () => { }, containers: new Map() };
            for (let u = undo.length - 1; u >= 0; u--) {
                try { put(undo[u].key, undo[u].had ? undo[u].old : undefined, back) }
                catch (e: any) { logFunc('Err :: rollback =>', e.message) }
            }
            try { normalizeTreeFunc(back) }
            catch (e: any) { logFunc('Err :: rollback =>', e.message) }
        };

        /* - */
        for (let i = 0; i < toDelete.length; i++)
            put(toDelete[i], undefined, ctx);
        normalizeTreeFunc(ctx); /* Remove what the deletions left empty, so that the new values find a clean place */
        ctx.containers.clear();
        for (let i = 0; i < toSet.length; i++)
            put(toSet[i], pandata[toSet[i]], ctx);
        normalizeTreeFunc(ctx);

        /* What really changed: every touched key, compared with how it was (a deleted array item that stays a "null" is unchanged) */
        const original = new Map<string, { had: boolean, old: any }>();
        for (let u = 0; u < undo.length; u++)
            if (!original.has(undo[u].key)) original.set(undo[u].key, undo[u]);
        const changedKeys: string[] = []; /* Also used to invalidate memoized reads */
        original.forEach((orig, key) => {
            const has = flat.has(key);
            if (orig.had !== has || (has && !sameValueFunc(flat.get(key), orig.old)))
                changedKeys.push(key);
        });

        /* True as soon as at least one path really changes */
        const mutated = changedKeys.length > 0;

        /* Tell the hooks that the store has changed */
        if (mutated) {
            storeVersion.current++;
            invalidateReadCacheFunc(changedKeys);
        }

        /* 
        * Paths that didn't exist are "set". Watched paths that did exist are "updated" if they are still there, "deleted" if not 
        * (a value that became a container counts as gone). 
        */
        const seen: JSON_DEFAULT_TYPE = {};
        for (let c = 0; c < changedKeys.length; c++) {
            const list = affectedByKey.get(changedKeys[c]);
            if (!list) continue; /* Not a change that was asked for (e.g. a gap filled with "null") */
            for (let i = 0; i < list.length; i++) {
                const a = list[i];
                if (hasPropertyFunc(seen, a.path)) continue;
                seen[a.path] = true;
                if (!a.existed) { newPandata[a.path] = a.path; continue; }
                if (!a.watched) continue;
                const stillThere = a.wasLeaf
                    ? flat.has(a.path)
                    : existsAtFunc(a.tokens, a.tokens.length);
                if (stillThere) updatedPandata[a.path] = a.path;
                else deletedPandata[a.path] = a.path;
            }
        }

        /* Trigger updates within the same instance context; this work is deferred beyond the store() call. */
        const state = activePandaStoreState;
        delayFunc().then(() => withPandaStoreState(state, () => {
            /* Updated paths */
            const updatedPaths = Object.keys(updatedPandata);
            triggerUpdateFunc({ path: updatedPaths, type: 'update' });

            /* New paths */
            const newPaths = Object.keys(newPandata);
            triggerUpdateFunc({ path: newPaths, type: 'set' });

            /* Deleted paths */
            const deletedPaths = Object.keys(deletedPandata);
            triggerUpdateFunc({ path: deletedPaths, type: 'delete' });

            /* Global listeners */
            if (mutated)
                storeListeners.current.forEach((listener) => {
                    try { listener() }
                    catch (e: any) { logFunc('Err :: listener =>', e) }
                });
        }));

    } catch (e: any) {
        rollback?.();
        res.ok = false;
        res.log = e.message;
    }
    return res;
};

/** Create watcher */
const createWatcherFunc = <T extends WATCHER_SOURCE_TYPE>(x: CREATE_WATCHER_ARG_TYPE<T>): void => {
    try {
        const source = x.source;
        const path = x.path;
        const watcherId = x.watcherId;
        const callback = x.callback;

        /* Ignore async functions */
        const isAsync = getFunctionTypeFunc(callback) === 'async';
        if (isAsync) return;

        /* Init watcher's path */
        if (!watcherDATA.current.has(path))
            watcherDATA.current.set(path, { get: {}, watch: { set: {}, update: {}, delete: {} } });
        const entry = watcherDATA.current.get(path)!;

        /* Set callback */
        if (source === 'get')
            entry.get[watcherId] = { key: null, callback };
        else
            entry.watch[x.type][watcherId] = { key: x.key, callback };

    } catch (e: any) { logFunc('Err :: createWatcherFunc() =>', e.message) }
};

/** Remove watcher */
const removeWatcherFunc = (x: { watcherId: string | string[] }) => {
    const wid = Array.isArray(x.watcherId) ? x.watcherId : [x.watcherId];
    for (let i = 0; i < wid.length; i++) {
        const id = wid[i];
        watcherDATA.current.forEach((wdata, k) => { /* Deleting the current entry while walking a Map is safe */
            delete wdata.get[id];
            delete wdata.watch.set[id];
            delete wdata.watch.update[id];
            delete wdata.watch.delete[id];

            /* Forget the path once nobody watches it anymore, otherwise "watcherDATA" only grows (and slows every update down) */
            const empty = Object.keys(wdata.get).length === 0 &&
                Object.keys(wdata.watch.set).length === 0 &&
                Object.keys(wdata.watch.update).length === 0 &&
                Object.keys(wdata.watch.delete).length === 0;
            if (empty) watcherDATA.current.delete(k);
        });
    }
};

/** Run watcher function */
const runWatcherFunctionFunc = (x: { path: string, key: string | null, isDeletion: boolean, callback: Function }) => {
    try {
        const key = x.key;
        const pandata = x.isDeletion ? undefined : extractPandataFromPathFunc({ path: x.path });
        const result = x.callback(key, pandata?.ok ? pandata.data : undefined); /* "null" stays "null" */
        if (result && typeof result.then === 'function')
            logFunc('Warn :: async watcher callbacks are not supported, the returned promise is ignored.');

    } catch (e: any) { logFunc('Err :: watcher callback =>', e) }
};

/** Trigger update */
const triggerUpdateFunc = (x: TRIGGER_UPDATE_ARG_TYPE): void => {
    try {
        const path = Array.isArray(x.path) ? x.path : [x.path];
        const typ = x.type;
        const state = activePandaStoreState;

        for (let i = 0; i < path.length; i++) {
            const targ = formatPathFunc({ path: path[i], removeLastBracket: true }); /* Current path */
            const entry = watcherDATA.current.get(targ);
            if (!entry) continue;

            /* - */
            const getwatchers = entry.get;
            const getFuncs = Object.values(getwatchers);
            for (let k = 0; k < getFuncs.length; k++)
                delayFunc().then(() => withPandaStoreState(state, () => {
                    try { getFuncs[k].callback() }
                    catch (e: any) { logFunc('Err :: hook callback =>', e) }
                }));

            /* - */
            const watchWatchers = entry.watch[typ];
            const watchFuncs = Object.values(watchWatchers);
            for (let k = 0; k < watchFuncs.length; k++)
                delayFunc().then(() => withPandaStoreState(state, () => {
                    runWatcherFunctionFunc({
                        path: targ,
                        key: watchFuncs[k].key,
                        isDeletion: typ === 'delete',
                        callback: watchFuncs[k].callback
                    })
                }));
        }

    } catch (e: any) { logFunc('Err :: triggerUpdateFunc() =>', e.message) };
};

/** Inspect shortcuts */
const inspectShortcutsFunc = (): JSON_DEFAULT_TYPE => {
    const res: SHORTCUTS_DATA_TYPE = new Map();
    const keys = Array.from(shortcutsDATA.current.keys());
    if (keys.length === 0) return {};
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        try { res.set(k, resolvePathFunc({ path: k })) }
        catch (e: any) { res.set(k, undefined) }
    }
    shortcutsDATA.current = res;
    return Object.fromEntries(res); /* A plain object for the outside world: the internal Map is never handed out */
};

/** String (keys) Interpolation */
const interpolateFunc = (x: { json: JSON_DEFAULT_TYPE, deps: string[] }) => {
    const jsonData = x.json;
    const deps = x.deps;

    const interopCollector: JSON_DEFAULT_TYPE = {};
    let hasInterpolation = false;

    /* If deps exists, then extract interpolatable strings */
    if (deps.length > 0) {
        const skeys = Object.keys(jsonData); /* Extract all keys from the simplified JSON object */
        for (let k = 0; k < skeys.length; k++) {
            const ckey = skeys[k]; /* Current key */

            if (!ckey.includes('%')) continue; /* Jump to the next key if the current one isn't relevant */
            hasInterpolation = true;

            const tab = [...ckey.split(''), 'z']; /* The "z" ensure that the last interpolatable string is processed, by adding an additional loop */
            const blockList: string[] = [];
            let interopString: string = '';

            for (let i = 0; i < tab.length; i++) {
                const targ = tab[i];
                const convert = parseInt(targ);
                const isNumber = !isNaN(convert);
                if (!isNumber) {
                    /* A placeholder is "%" followed by at least one digit */
                    if (interopString.length > 1 && !blockList.includes(interopString)) {
                        /* Get the corresponding dependencie's value */
                        const nb = Number(interopString.replace('%', ''));
                        const depVal = deps[nb];
                        if (!depVal)
                            throw new Error(`Invalid value for "%${nb}"`);

                        /* Store the interpolatable key and its corresponding dep's value */
                        interopCollector[interopString] = depVal;
                        blockList.push(interopString);
                    }
                    interopString = targ === '%' ? '%' : ''; /* "%0%1" holds two placeholders */

                } else {
                    if (interopString.length === 0)
                        continue;
                    interopString = interopString + targ;
                }
            }
        }
    }

    /* Proceed to the interpolation */
    let newObj: JSON_DEFAULT_TYPE = {};
    if (hasInterpolation)
        for (let key in jsonData) {
            const val = jsonData[key];
            let newKey: string = key;
            /* Longest placeholders first, so that "%10" isn't eaten by "%1" */
            const interops = Object.keys(interopCollector).sort((a, b) => b.length - a.length);
            for (let n = 0; n < interops.length; n++)
                if (newKey.includes(interops[n])) newKey = newKey.replaceAll(interops[n], interopCollector[interops[n]]);
            newObj[newKey] = val;
        }
    else newObj = jsonData;

    /* - */
    return newObj;
};

/*
*
*
* 
* 
* 
* 
*/

/** 
* Transform the JSON Object into top-level keys only 
* Don't specify a value for "arr", it's used for recursive operations only 
*/
const topLevelJsonFunc = (x: { data: JSON_DEFAULT_TYPE, arr?: string[], arrays?: string[] }): FUNCTION_DEFAULT_RETURN_TYPE => {
    let res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        const data = x.data;
        let collector: JSON_DEFAULT_TYPE = {};
        const dtyp = getRealTypeFunc(data).type;

        /* 
        * Check if data is plain plain JSON object
        * Only plain JSON objects are supported 
        */
        assertPlainObjectFunc(data);

        /* Path of the current container (undefined for the root) */
        const selfPath = (x.arr && x.arr.length > 0)
            ? formatPathFunc({ path: x.arr.join('.') })
            : undefined;

        /* Collect the paths of arrays (an array is replaced as a whole, see "reconcilePandataFunc") */
        if (dtyp === 'array' && selfPath !== undefined && x.arrays)
            x.arrays.push(selfPath);

        /* An empty array/object has no leaf: keep it as-is, otherwise it would be lost */
        if (selfPath !== undefined && isEmptyContainerFunc(data))
            collector[selfPath] = dtyp === 'array' ? [] : {};

        /* - */
        if (dtyp === 'json')
            for (let key in data) {
                const val = data[key];
                const tab: string[] = !x.arr ? [] : [...x.arr]; /* Very sensitive! Should remain like this. */

                const typ = getRealTypeFunc(val).type;
                tab.push(key);

                /* - */
                switch (typ) {
                    case 'json': /* Execute the same code as "array" case */
                    case 'array': {
                        const recurse = topLevelJsonFunc({ data: val, arr: tab, arrays: x.arrays });
                        if (!recurse.ok)
                            throw new Error(recurse.log);
                        Object.assign(collector, recurse.data);
                    } break;

                    default: {
                        const ky = formatPathFunc({ path: tab.join('.') });
                        collector[ky] = val;
                    };
                };
            }
        else if (dtyp === 'array') {
            const tab: string[] = !x.arr ? [] : [...x.arr]; /* Very sensitive! Should remain like this. */
            for (let i = 0; i < data.length; i++) {
                const entry = data[i];
                const getType = getRealTypeFunc(entry);

                /* - */
                const etyp = getType.type;
                if (!getType.valid)
                    throw new Error(`Invalid type ("${etyp}") found!`);
                const idx = `[${i}]`;

                /* - */
                if (['json', 'array'].includes(etyp)) {
                    const recurse = topLevelJsonFunc({ data: entry, arr: [...tab, idx], arrays: x.arrays });
                    if (!recurse.ok)
                        throw new Error(recurse.log);
                    Object.assign(collector, recurse.data);

                } else {
                    const ky = formatPathFunc({ path: [...tab, idx].join('.') });
                    collector[ky] = data[i];
                }
            }
        }

        /* - */
        res.data = collector;

    } catch (e: any) {
        res.ok = false;
        res.log = e.message;
        logFunc(`Err :: topLevelJsonFunc() => ${e.message}`);
    }
    return res;
};

/*
*
*
* 
* 
* 
* 
*/

/** Store pandata */
const storeDataFunc = (...x: STORE_ARG_TYPE): FUNCTION_DEFAULT_RETURN_TYPE => {
    const res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        /* Check data type */
        const arg0 = x[0];
        const arg1 = x[1];
        const dtyp = getRealTypeFunc(arg0).type;
        if (dtyp !== 'json')
            throw new Error(`Fatal error :: "data" is not a JSON object!`);

        /* - */
        const jsonData = arg0;
        const deps = !arg1 ? [] : Array.isArray(arg1) ? [...arg1] : [arg1];

        /* Check if the JSON object is empty */
        const dataPaths = Object.keys(jsonData);
        if (dataPaths.length === 0)
            throw new Error(`Empty JSON object!`);

        /* TLV */
        const arrays: string[] = []; /* Paths of the arrays found in "jsonData" */
        const tlv: JSON_DEFAULT_TYPE = topLevelJsonFunc({ data: jsonData, arrays });
        if (!tlv.ok)
            throw new Error(tlv.log);
        const data = tlv.data;

        /* Interpolation */
        let newObj = data;
        let arrayPaths = arrays;
        if (deps.length > 0) {
            newObj = interpolateFunc({ json: data, deps });
            const asKeys: JSON_DEFAULT_TYPE = {};
            for (let a = 0; a < arrays.length; a++)
                asKeys[arrays[a]] = a;
            arrayPaths = Object.keys(interpolateFunc({ json: asKeys, deps }));
        }

        /* Update "storeDATA" */
        const updateStore = updateStoreDataFunc({ pandata: newObj, arrays: arrayPaths });
        if (!updateStore.ok)
            throw new Error(updateStore.log);

    } catch (e: any) {
        res.ok = false;
        res.log = e.message;
        logFunc('Err :: storeDataFunc() =>', e.message);
    };
    return res;
};

/** Get pandata, along with the (resolved) paths it has been read from */
const getDataAndPathsFunc = (path: '*' | GET_ARG_PATH_TYPE): { data: any, paths: string[] } => {
    const res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    const cachedPandata: JSON_DEFAULT_TYPE = {}; /* Fetched pandata cache */
    try {
        const dataType = getRealTypeFunc(path).type;
        switch (dataType) {
            case 'string': {
                const paf = resolvePathFunc({ path: path as string });
                const val = extractPandataFromPathFunc({ path: paf });
                const v = !val.ok ? undefined : val.data;
                cachedPandata[paf] = v;
                res.data = v;
            } break;

            case 'array': {
                const pafTab = path as string[];
                const arr: any[] = [];

                /* Fetch pandata for each path */
                for (let i = 0; i < pafTab.length; i++) {
                    const currentPath = resolvePathFunc({ path: pafTab[i] });
                    if (!hasPropertyFunc(cachedPandata, currentPath)) {
                        const val = extractPandataFromPathFunc({ path: currentPath });
                        const v = !val.ok ? undefined : val.data;
                        arr.push(v);
                        cachedPandata[currentPath] = v;

                    } else arr.push(cachedPandata[currentPath]); /* Use cached pandata */
                }

                /* - */
                res.data = arr;
            } break;

            case 'json': {
                const pafKey = Object.keys(path);
                const obj: JSON_DEFAULT_TYPE = {};

                /* Fetch pandata for each path  */
                for (let i = 0; i < pafKey.length; i++) {
                    const ckey = pafKey[i];
                    const currentPath = resolvePathFunc({ path: (path as JSON_DEFAULT_TYPE)[ckey] });
                    if (!hasPropertyFunc(cachedPandata, currentPath)) {
                        const val = extractPandataFromPathFunc({ path: currentPath });
                        const v = !val.ok ? undefined : val.data;
                        obj[ckey] = v;
                        cachedPandata[currentPath] = v;

                    } else obj[ckey] = cachedPandata[currentPath]; /* Use cached pandata */
                }

                /* - */
                res.data = obj;
            } break;

            default: { throw new Error(`Invalid path!`) };
        };

    } catch (e: any) {
        res.ok = false;
        res.log = e.message;
        logFunc('Err :: getDataFunc() =>', e.message);
    }

    /* return */
    return {
        data: res.data,
        paths: Object.keys(cachedPandata) /* Each key of "cachedPandata" is a path */
    };
};
/** Get pandata */
const getDataFunc = (path: '*' | GET_ARG_PATH_TYPE): any => getDataAndPathsFunc(path).data;

/** Watch pandata */
const watchDataFunc = (x: { path: WATCH_ARG_TYPE, watcherId: string, callbacks: WATCH_ON_ARG_TYPE }): FUNCTION_DEFAULT_RETURN_TYPE => {
    const res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        const path = x.path;
        const watcherId = x.watcherId;
        const callbacks = x.callbacks;

        /* - */
        const typ = getRealTypeFunc(path).type;
        switch (typ) {
            case 'string': {
                for (let k in callbacks) {
                    let currentPath = resolvePathFunc({ path: path as string });
                    const callbackType = k as WATCHER_CALLBACK_TYPE; /* set | update | delete */
                    createWatcherFunc({
                        source: 'watch',
                        path: formatPathFunc({ path: currentPath, removeLastBracket: true }),
                        type: callbackType,
                        key: null,
                        watcherId,
                        callback: callbacks[callbackType] as Function
                    });
                }
            } break;

            case 'json': {
                if (Object.keys(path).length === 0)
                    throw new Error(`Empty path!`);
                for (let k in callbacks) {
                    const paths = path as JSON_STRING_TYPE;
                    const callbackType = k as WATCHER_CALLBACK_TYPE; /* set | update | delete */
                    for (let pathKey in paths) {
                        let currentPath = resolvePathFunc({ path: paths[pathKey] });
                        createWatcherFunc({
                            source: 'watch',
                            path: formatPathFunc({ path: currentPath, removeLastBracket: true }),
                            type: callbackType,
                            key: pathKey,
                            watcherId,
                            callback: callbacks[callbackType] as Function
                        });
                    }
                }
            } break;

            default: { throw new Error(`Invalid path!`) };
        };

    } catch (e: any) {
        res.ok = false; res.log = e.message;
        logFunc('Err :: watchDataFunc() =>', e.message);
    }
    return res;
};

/** Preserve pandata's references */
const preserveDATAFunc = (pandata: any): any => {
    const typ = getRealTypeFunc(pandata).type;
    const id = `$pre_${generateIdFunc()}`;
    if (['function', 'array', 'json'].includes(typ)) {
        preserveDATA.current.set(id, pandata);
        return id;
    }
    return pandata;
};

/** 
* Serialize the whole store into a string that is safe to inline in a <script> tag (SSR -> browser). 
* It reads the store itself, NOT get('*'): get('*') hands back what "preserve" holds (functions, class instances, 
* cyclic objects...), which can't travel. Dropped on purpose: preserved values, and anything JSON can't carry 
* (functions, symbols, bigint, NaN/Infinity). "onSkip" receives the dropped paths. 
*/
const dehydrateFunc = (onSkip?: (paths: string[]) => void): string => {
    const flat = storeTopLevelDATA.current;
    const skipped: string[] = [];
    const SKIP = Symbol('skip');

    /* Copy of a node, SKIP if nothing serializable is left in it */
    const walk = (node: any, tokens: PATH_TOKEN[]): any => {
        if (isContainerFunc(node)) {
            if (isEmptyNodeFunc(node)) return Array.isArray(node) ? [] : {}; /* A real empty container, kept as-is */
            if (Array.isArray(node)) {
                const out: any[] = [];
                for (let i = 0; i < node.length; i++) {
                    tokens.push(i);
                    out.push(walk(node[i], tokens));
                    tokens.pop();
                }
                while (out.length > 0 && out[out.length - 1] === SKIP) out.pop();
                if (out.length === 0) return SKIP;
                return out.map((v) => v === SKIP ? null : v); /* A dropped item in the middle leaves a hole */
            }
            const out: JSON_DEFAULT_TYPE = {};
            let count = 0;
            const keys = Array.from((node as STORE_TREE_TYPE).keys());
            for (let i = 0; i < keys.length; i++) {
                tokens.push(keys[i]);
                const v = walk(childOfFunc(node, keys[i]), tokens);
                tokens.pop();
                if (v === SKIP) continue;
                out[keys[i]] = v;
                count++;
            }
            return count === 0 ? SKIP : out;
        }

        /* A leaf */
        const key = joinPathFunc(tokens);
        if (!flat.has(key)) return SKIP; /* An array hole */
        const t = typeof node;
        if (node === null || t === 'boolean' || (t === 'number' && Number.isFinite(node))) return node;
        if (t === 'string' && !node.startsWith('$pre_')) return node; /* "$pre_..." is a preserved reference */
        skipped.push(key);
        return SKIP;
    };

    const walked = walk(storeDATA.current, []);
    const data = walked === SKIP ? {} : walked;

    if (skipped.length > 0) {
        logFunc('dehydrate() :: dropped (not serializable):', skipped);
        if (onSkip) onSkip(skipped);
    }

    /* "<" would let the data close the <script> tag; U+2028/2029 break JS string literals in old engines */
    return JSON.stringify(data)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
};

/** 
* Load a snapshot made by "dehydrate" into the store (browser side of SSR). 
* Takes the string (or an already parsed object) and writes it through the regular "store" flow, 
* so watchers and hooks are notified like for any other write. An empty snapshot is a no-op. 
*/
const hydrateFunc = (snapshot: string | JSON_DEFAULT_TYPE): FUNCTION_DEFAULT_RETURN_TYPE => {
    const res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
        if (getRealTypeFunc(data).type !== 'json')
            throw new Error('Invalid snapshot: expected a JSON object!');
        if (Object.keys(data).length === 0)
            return res;
        return storeDataFunc(data);

    } catch (e: any) {
        res.ok = false;
        res.log = e.message;
    }
    return res;
};

/*
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
*/

/* ---------------------------------------------- Hooks ---------------------------------------------- */

/** "usePanda" Hook */
const usePanda = (path: string | string[] | JSON_STRING_TYPE, state: PANDA_STORE_STATE): any => {
    /* Unique and immutable ID of this hook's watchers (generated once) */
    const idRef = useRef<string | null>(null);
    if (idRef.current === null) idRef.current = generateIdFunc();
    const watcherId = idRef.current;

    /* "path" is often a new array/object on every render, so it's compared by value */
    const pathKey = typeof path === 'string' ? path : JSON.stringify(path);

    /* 
    * Read pandata (and the real paths behind it) only when the path or the store changed. 
    * Thanks to this, the returned value keeps the same reference as long as nothing changed.
    */
    const version = state.storeVersion.current;
    const { data, paths } = useMemo(
        () => withPandaStoreState(state, () => getDataAndPathsFunc(path)),
        [pathKey, version, state]
    ); // eslint-disable-line react-hooks/exhaustive-deps

    /* Watch the paths, only while the component is mounted, and only the paths currently in use */
    const pathsKey = JSON.stringify(paths);
    const subscribe = useCallback((onChange: () => void): (() => void) =>
        withPandaStoreState(state, () => {
            const list: string[] = JSON.parse(pathsKey);
            let watchAll = false;

            /* - */
            for (let i = 0; i < list.length; i++) {
                /* "*" has no specific path to watch: listen to every change of the store */
                if (list[i] === '*') {
                    watchAll = true;
                    continue;
                };

                /* Create watcher */
                createWatcherFunc({
                    source: 'get',
                    path: formatPathFunc({ path: list[i], removeLastBracket: true }), /* Same format as the one used by "triggerUpdateFunc" */
                    watcherId,
                    callback: onChange
                });
            }

            /* - */
            if (watchAll)
                storeListeners.current.add(onChange);

            /* Clean up: when the component unmounts, or when the paths change */
            return () => withPandaStoreState(state, () => {
                removeWatcherFunc({ watcherId });
                storeListeners.current.delete(onChange);
            });
        }), [pathsKey, watcherId, state]);

    /* 
    * Re-render on every change, and re-check the store right after subscribing, 
    * so that no update is lost between the render and the subscription.
    */
    const getSnapshot = useCallback(() => state.storeVersion.current, [state]);
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    /* Multi-path reads ("[a, b]" / "{ x: a }") build a new array/object each time: keep the previous one if every value is the same */
    const lastRef = useRef<any>(undefined);
    const stable = shallowSameFunc(lastRef.current, data) ? lastRef.current : data;
    lastRef.current = stable;

    /* Return pandata */
    return stable;
};

/*
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
-
*/

/* ---------------------------------------------- Panda ---------------------------------------------- */

/* Panda */
const Panda: MAIN_TYPE = {
    init(state: PANDA_STORE_STATE): PANDA_TYPE {
        const next = {
            /* Store pandata */
            store(...x: STORE_ARG_TYPE): FUNCTION_DEFAULT_RETURN_TYPE {
                return withPandaStoreState(state, () => storeDataFunc(...x));
            },

            /* Get pandata */
            get(path: '*' | GET_ARG_PATH_TYPE): any {
                return withPandaStoreState(state, () => getDataFunc(path));
            },

            /* Watch pandata */
            watch(path: WATCH_ARG_TYPE): WATCH_RETURN_TYPE {
                const wnext = {
                    on(callbacks: WATCH_ON_ARG_TYPE, watcherId: [string]): FUNCTION_DEFAULT_RETURN_TYPE {
                        return withPandaStoreState(state, () => watchDataFunc({ path, callbacks, watcherId: watcherId[0] }));
                    }
                };
                return wnext;
            },

            /* Unwatch pandata */
            unwatch(watcherId: string | string[]): void {
                withPandaStoreState(state, () => removeWatcherFunc({ watcherId }));
            },

            /* Dehydrate the store */
            dehydrate(onSkip?: (paths: string[]) => void): string {
                return withPandaStoreState(state, () => dehydrateFunc(onSkip));
            },

            /* Hydrate the store */
            hydrate(snapshot: string | JSON_DEFAULT_TYPE): FUNCTION_DEFAULT_RETURN_TYPE {
                return withPandaStoreState(state, () => hydrateFunc(snapshot));
            },

            /* Preserve pandata's references */
            preserve(pandata: any): any {
                return withPandaStoreState(state, () => preserveDATAFunc(pandata));
            },

            /* Generate ID */
            genID(): string {
                return generateIdFunc();
            },

            /* Inspect shortcuts */
            inspectShortcuts(): JSON_DEFAULT_TYPE {
                return withPandaStoreState(state, () => inspectShortcutsFunc());
            }
        };
        return next;
    }
};

/**
* Create a fully type-safe Panda, based on the shape of your data.
*
* Every path you give to store, get, usePanda and watch is checked at compile time:
* a typo becomes a compile error, and get() / usePanda() / watch() know the type of what they return.
*
* Browser instances share the store for backwards compatibility. For SSR, call createPanda() once per request
* and pass that instance into the render tree; do not reuse a module-level instance for request-specific data.
* Without a type argument, it behaves like the untyped API.
*
* @example
* type Schema = { user: { name: string, stack: string[] } };
* export const { store, get, usePanda, watch, unwatch, preserve, genID, inspectShortcuts, dehydrate, hydrate } = createPanda<Schema>();
*/
const createPanda = <T extends JSON_DEFAULT_TYPE = any>(): PandaTyped<T> => {
    const inBrowser = 'window' in globalThis;
    const state = inBrowser ? sharedPandaStoreState : createPandaStoreState();
    const panda = Panda.init(state);
    const typed = {
        store: panda.store,
        get: panda.get,
        usePanda: (path: string | string[] | JSON_STRING_TYPE) => usePanda(path, state),
        watch: panda.watch,
        unwatch: panda.unwatch,
        preserve: panda.preserve,
        dehydrate: panda.dehydrate,
        hydrate: panda.hydrate,
        genID: panda.genID,
        inspectShortcuts: panda.inspectShortcuts
    };
    return typed as unknown as PandaTyped<T>;
};

/** Enable/disable Panda's internal debug logs */
export const setPandaDebug = (enabled: boolean): void => { _dev_ = enabled };

/* Default */
export default createPanda;