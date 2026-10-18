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
import json from '@vinoskey524/oh-my-json';

/* ---------------------------------------------- Types ---------------------------------------------- */

type MAIN_TYPE = {
    init: (state: PANDA_STORE_STATE) => PANDA_TYPE
};

type INIT_TYPE = {
    type: 'client' | 'server',
    family: string,
    address: string
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

type WATCHER_DATA_TYPE = {
    [path: string]: {
        get: { [watcherId: string]: { key: null, callback: Function } },
        watch: {
            set: { [watcherId: string]: { key: string | null, callback: Function } },
            update: { [watcherId: string]: { key: string | null, callback: Function } },
            delete: { [watcherId: string]: { key: string | null, callback: Function } }
        }
    }
};

type PRESERVE_DATA_TYPE = {
    [id: string]: object | Function
};

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
type Ref<V> = { readonly [refBrand]: V };

/** Token returned by "preserve()". Only meaningful for the type-checker. */
type Preserved<V> = string & { readonly [preservedBrand]: V };

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
type PandaPaths<T> = IsAny<T> extends true ? string : Entries<T>['p'];

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

interface PandaTyped<T> {
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

const _dev_ = false;

const _default_valid_types_: VALID_TYPES_TYPE[] = ['bigint', 'string', 'number', 'boolean', 'function', 'symbol', 'array', 'json', 'null', 'undefined'];

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
    storeDATA: { current: JSON_DEFAULT_TYPE };
    storeTopLevelDATA: { current: JSON_DEFAULT_TYPE };
    watcherDATA: { current: WATCHER_DATA_TYPE };
    preserveDATA: { current: PRESERVE_DATA_TYPE };
    shortcutsDATA: { current: JSON_DEFAULT_TYPE };
    storeVersion: { current: number };
    storeListeners: { current: Set<() => void> };
};

const createPandaStoreState = (): PANDA_STORE_STATE => ({
    storeDATA: { current: {} },
    storeTopLevelDATA: { current: {} },
    watcherDATA: { current: {} },
    preserveDATA: { current: {} },
    shortcutsDATA: { current: {} },
    storeVersion: { current: 0 },
    storeListeners: { current: new Set() }
});

/** Browser instances retain the historical shared store; server instances are isolated per createPanda() call. */
const sharedPandaStoreState = createPandaStoreState();
let activePandaStoreState = sharedPandaStoreState;

/** Run synchronous store operations against the owning Panda instance. */
const withPandaStoreState = <T>(state: PANDA_STORE_STATE, operation: () => T): T => {
    const previousState = activePandaStoreState;
    activePandaStoreState = state;
    try {
        return operation();
    } finally {
        activePandaStoreState = previousState;
    }
};

/** State references resolve against the currently executing Panda instance. */
const storeDATA = {
    get current() { return activePandaStoreState.storeDATA.current; },
    set current(value: JSON_DEFAULT_TYPE) { activePandaStoreState.storeDATA.current = value; }
};
const storeTopLevelDATA = {
    get current() { return activePandaStoreState.storeTopLevelDATA.current; },
    set current(value: JSON_DEFAULT_TYPE) { activePandaStoreState.storeTopLevelDATA.current = value; }
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
    set current(value: JSON_DEFAULT_TYPE) { activePandaStoreState.shortcutsDATA.current = value; }
};
const storeVersion = {
    get current() { return activePandaStoreState.storeVersion.current; },
    set current(value: number) { activePandaStoreState.storeVersion.current = value; }
};
const storeListeners = {
    get current() { return activePandaStoreState.storeListeners.current; },
    set current(value: Set<() => void>) { activePandaStoreState.storeListeners.current = value; }
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

/** Permanent log */
const plogFunc = (...log: any[]): void => { console.log(...log) };

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
* Append data into a JSON Object 
* Warning: It will directly modify the source/original object. 
*/
const jsonAppendDataFunc = (x: { sourceObj: JSON_DEFAULT_TYPE, pathChain: string, data: any, filter?: string[] }): JSON_DEFAULT_TYPE => {
    const sourceObj = x.sourceObj;
    let cursor: any = sourceObj;
    try {
        const pathChain = x.pathChain;
        const value = x.data;
        const filter = x.filter;

        const pathTab = pathChain.split('.');
        let cursorType: 'json' | 'array' | undefined = 'json';

        for (let n = 0; n < pathTab.length; n++) {
            const currentPath = pathTab[n]; /* current path */
            const nextPath = pathTab[n + 1] ?? undefined;

            /* True if the current path is an array index */
            const isArrayIndex = getPathTypeFunc(currentPath) === 'array';

            /* - */
            if (nextPath) { /* Navigate through the JSON tree */
                const currentPathType = getPathTypeFunc(nextPath);
                if (!cursorType)
                    continue;

                /* - */
                let arrayInit: any[] | undefined = undefined;
                if (currentPathType === 'array' && filter) {
                    const idx = n + 1;
                    arrayInit = buildArrayFromIndexPatternFunc({ patchChain: filter!, pathIndex: idx });
                }

                if (!hasPropertyFunc(cursor, currentPath)) {
                    if (isArrayIndex) {
                        const idxes = currentPath.replaceAll('[', '').replaceAll(']', '').split('_');
                        for (let d = 0; d < idxes.length; d++) {
                            const idx = Number(idxes[d]);
                            const isLastLoop = d === (idxes.length - 1);
                            const cursorVal = cursor[idx];
                            if (isLastLoop)
                                cursor[idx] =
                                    currentPathType === 'json' ?
                                        cursorVal === null ?
                                            {} :
                                            cursorVal :
                                        arrayInit;
                            cursor = cursor[idx];
                        }

                    } else {
                        cursor[currentPath] = currentPathType === 'json' ? {} : arrayInit;
                        cursor = cursor[currentPath];
                    }

                } else {
                    if (currentPathType === 'array' && cursor[currentPath] === undefined)
                        cursor[currentPath] = arrayInit;
                    cursor = cursor[currentPath];
                }

                /* Set cursor type */
                cursorType =
                    getRealTypeFunc(cursor).type === 'array' ?
                        'array' :
                        getRealTypeFunc(cursor).type === 'json' ?
                            'json' : undefined;

            } else { /* Set value */
                switch (cursorType) {
                    case 'json': { cursor[currentPath] = value } break;

                    case 'array': {
                        const tab: any[] = currentPath.replaceAll('[', '').replaceAll(']', '').split('_');
                        for (let k = 0; k < tab.length; k++) {
                            const idx = Number(tab[k]);
                            const isLastLoop = k === (tab.length - 1);
                            if (!isLastLoop)
                                cursor = cursor[idx];
                            else
                                cursor[idx] = value;
                        }
                    } break;

                    default: { };
                };
            }
        }

    } catch (e: any) { logFunc('Err :: jsonAppendDataFunc() =>', e.message) }
    return cursor;
};

/** Clone object */
const cloneObjectFunc = (object: JSON_DEFAULT_TYPE | any[]): FUNCTION_DEFAULT_RETURN_TYPE => {
    const val = object;

    /* Simplify data */
    const a = topLevelJsonFunc({ data: val });
    if (!a.ok) return a;
    const obj = a.data;

    /* Set preserved data */
    for (let k in obj) {
        const val = obj[k];
        if (typeof val !== 'string')
            continue;
        const isPreserved = val.indexOf('$pre_') === 0;
        if (isPreserved) obj[k] = preserveDATA.current[val];
    }

    /* Reverse and return data */
    const b = reverseTopLevelJsonFunc({ data: obj });
    return b.data; /* "current" comes from "val" above */
};

/** Cache store top-leveled data */
const cacheStoreTopLevelDataFunc = (): void => {
    const a = topLevelJsonFunc({ data: storeDATA.current });
    if (!a.ok) return;
    storeTopLevelDATA.current = a.data;
};

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
    shortcutsDATA.current[key] = value;
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
    const lastKey = split[1];
    let duo = [split.shift(), null];
    do {
        /* - */
        duo[1] = split.shift();

        /* Filter */
        const p0 = formatPathFunc({ path: duo[0] + '.', removeLastBracket: true });
        const p1 = formatPathFunc({ path: '.' + duo[1], removeLastBracket: true });
        const tab = Object.keys(storeTopLevelDATA.current);
        let filter = tab.filter((e) =>
            e.includes(p0) && e.indexOf(p0) === 0 &&
            e.includes(p1) && e.indexOf(p1) >= (p0.length - 1)
        );
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
                const tb = pf.split(lastKey);

                /* Check if the last/target key appears once, in the middle of the full path */
                const inMiddle = tb.length === 2 && tab[1].length > 0;
                ltab.push(inMiddle ? true : false);

                /* Save the path before the target key */
                lpaf[tb[0]] = tb[0];
            }

            /* Update result and length if all paths result in the same JSON object */
            const appearsOnceInMiddle = !ltab.includes(false);
            const samePrefixPath = Object.keys(lpaf).length === 1;
            const allPathsResultInTheSameJSONObject = appearsOnceInMiddle && samePrefixPath;
            if (allPathsResultInTheSameJSONObject) {
                const fpath = filter[0];
                const idx = fpath.indexOf(lastKey);
                filter = [fpath.slice(0, idx) + lastKey];
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
            const idx = fpath.indexOf(lastKey);
            const str = fpath.slice(0, idx) + lastKey;
            duo[0] = str;
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
        if (path === '*')
            res.data = cloneObjectFunc(storeDATA.current);
        else {
            /* Format path */
            path = formatPathFunc({ path, removeLastBracket: true });
            path = resolvePathFunc({ path });

            /* Seek path */
            const keys = Object.keys(storeTopLevelDATA.current);
            const filter = keys.filter((e) => e.includes(path) && e.indexOf(path) === 0);
            if (filter.length === 0) {
                /* Process preserved path */
                let prePath = '';
                let preVal = '';
                let rpath = '';
                const klen = keys.length;
                if (klen > 0)
                    for (let i = 0; i < klen; i++) {
                        const ckey = keys[i];
                        if (path.includes(ckey) && path.indexOf(ckey) === 0) {
                            const val = storeTopLevelDATA.current[ckey];
                            if (typeof val !== 'string')
                                break;
                            const isPreserved = val.indexOf('$pre_') === 0;
                            if (isPreserved) {
                                prePath = ckey;
                                preVal = val;
                                rpath = path.replace(ckey + '.', '');
                            }
                            break;
                        }
                    }

                /* return preserved pandata */
                if (preVal.length > 0) {
                    const preData = preserveDATA.current[preVal];
                    const jget = json.get(preData, rpath);
                    if (!jget)
                        throw new Error(`No data found at "${rpath}" (${preVal})!`);
                    res.data = jget;
                    return res;
                }

                /* If no pandata found */
                else
                    throw new Error(`No data found at "${path}"!`);
            }

            /* If pandata found */
            const tab = filter.sort((a, b) => a.localeCompare(b));
            const obj: JSON_DEFAULT_TYPE = {};
            for (let t = 0; t < tab.length; t++) {
                const targ = tab[t];
                obj[targ] = storeTopLevelDATA.current[targ];
            }

            /* Set preserved data */
            for (let k in obj) {
                const val = obj[k];
                if (typeof val !== 'string')
                    continue;
                const isPreserved = val.indexOf('$pre_') === 0;
                if (isPreserved)
                    obj[k] = preserveDATA.current[val];
            }

            /* Build JSON Object from paths */
            const reversed = reverseTopLevelJsonFunc({ data: obj });
            if (!reversed.ok)
                throw new Error(reversed.log);

            /* Get pandata */
            let pandata: any = reversed.data;
            const pathTab = path.split('.');
            for (let d = 0; d < pathTab.length; d++) {
                const typ = getRealTypeFunc(pandata).type;
                const kdx = pathTab[d];
                switch (typ) {
                    case 'json': { pandata = pandata[kdx] } break;

                    case 'array': {
                        const idxTab = kdx.replaceAll('[', '').replaceAll(']', '').split('_');
                        for (let b = 0; b < idxTab.length; b++) {
                            const idx = Number(idxTab[b]);
                            pandata = pandata[idx];
                        }
                    } break;

                    default: { };
                };
            }

            /* - */
            res.data = pandata;
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

/** Decompose path */
const decomposePathFunc = (x: { path: string }): string[] => {
    const path = x.path;
    let tab: string[] = [];

    /* - */
    const split = path.split('.');
    for (let i = 0; i < split.length; i++) {
        const target = split[i]; /* path */
        const isIndexPattern = target.includes('[') && target.indexOf('[') === 0;

        /* - */
        if (isIndexPattern) {
            const spt = target.split('_');
            for (let k = 0; k < spt.length; k++) {
                const index = spt[k];
                const tlen = tab.length;
                const latest = tlen > 0 ? tab[tlen - 1] : '';
                const val = latest + (tlen > 0 ? (k === 0 ? '.' : '_') : '') + index;
                tab.push(val);
            }
            continue; /* Jump to next target */
        }

        /* - */
        const tlen = tab.length;
        const latest = tlen > 0 ? tab[tlen - 1] : '';
        const val = latest + (tlen > 0 ? '.' : '') + target;
        tab.push(val);
    }

    /* Format paths */
    for (let j = 0; j < tab.length; j++)
        tab[j] = formatPathFunc({ path: tab[j], removeLastBracket: true });

    /* - */
    return tab;
};

/** Compare path •  */
const comparePathFunc = (x: { path: string, sourceA: JSON_DEFAULT_TYPE, sourceB: JSON_DEFAULT_TYPE }): 'changed' | 'unchanged' | undefined => {
    const path = formatPathFunc({ path: x.path });
    const sourceA = x.sourceA;
    const sourceB = x.sourceB;

    /* Check types */
    const sa = getRealTypeFunc(sourceA, ['json']); /* sourceA type */
    const sb = getRealTypeFunc(sourceB, ['json']); /* sourceB type */

    /* Check sources validity */
    if (!sa.valid || !sb.valid) return undefined;

    /* - */
    const objA: JSON_DEFAULT_TYPE = {};
    const objB: JSON_DEFAULT_TYPE = {};

    const keysA = Object.keys(sourceA);
    const keysB = Object.keys(sourceB);

    const filterA = keysA.filter((e) => e.includes(path) && e.indexOf(path) === 0);
    const filterB = keysB.filter((e) => e.includes(path) && e.indexOf(path) === 0);
    if (filterA.length !== filterB.length) return 'changed'; /* Compare lengths */

    /* - */
    filterA.sort((a, b) => a.localeCompare(b));
    filterB.sort((a, b) => a.localeCompare(b));
    if (filterA.length > 0)
        for (let i = 0; i < filterA.length; i++) {
            const current = filterA[i];
            objA[current] = sourceA[current];
        }
    if (filterB.length > 0)
        for (let i = 0; i < filterB.length; i++) {
            const current = filterB[i];
            objB[current] = sourceB[current];
        }

    /* - */
    for (let key in objA) {
        const valueA = objA[key];
        const valueB = objB[key];
        if (valueA !== valueB) return 'changed';
    }

    /* - */
    return 'unchanged';
};

/** Is preserved */
const isPreservedFunc = (value: string) => typeof value === 'string' && value.includes('$pre_') && value.indexOf('$pre_') === 0;

/** Update store */
const updateStoreDataFunc = (x: { pandata: JSON_DEFAULT_TYPE }): FUNCTION_DEFAULT_RETURN_TYPE => {
    let res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        const pandata: JSON_DEFAULT_TYPE = {};

        /* Resolve paths */
        for (let k in x.pandata) {
            const rpaf = resolvePathFunc({ path: k });
            pandata[rpaf] = x.pandata[k];
        }

        /* - */
        const paths: string[] = Object.keys(storeTopLevelDATA.current).sort((a, b) => a.localeCompare(b));
        const topLevelDataclone = { ...storeTopLevelDATA.current };
        const watchedPaths = Object.keys(watcherDATA.current);

        /* - */
        const newPandata: JSON_STRING_TYPE = {};
        const updatedPandata: JSON_STRING_TYPE = {};
        const deletedPandata: JSON_STRING_TYPE = {};

        /* - */
        const watchedPaf: JSON_DEFAULT_TYPE = {};
        const postProcess: JSON_DEFAULT_TYPE = {};

        /* True as soon as at least one path really changes */
        let mutated = false;

        /* Process each path */
        const pandataPaths = Object.keys(pandata).sort((a, b) => a.localeCompare(b));
        for (let p = 0; p < pandataPaths.length; p++) {
            const path = pandataPaths[p];
            const val = pandata[path]; /* Current path's value */

            /* Run "update" functions */
            let newVal: any = val;
            if (typeof val === 'function') {
                /* Check if the update function is sync */
                const isSync = getFunctionTypeFunc(val) === 'sync';
                if (!isSync)
                    throw new Error(`You try to update the value at "${path}" with an async function!`);
                /* Set update result to "newVal" */
                let current = storeTopLevelDATA.current[path];
                if (current && isPreservedFunc(current))
                    current = preserveDATA.current[current];
                const func = val as Function;
                const result = func(current);
                newVal = result;
            }

            /* Skip unchanged values */
            const unchanged = comparePathFunc({
                path: path,
                sourceA: pandata,
                sourceB: storeTopLevelDATA.current
            }) === 'unchanged';
            if (unchanged) continue;
            mutated = true;

            /* Process current path and collect all path affected by current path's modifications */
            const formatedPath = formatPathFunc({ path: path, removeLastBracket: true });
            const decomp = decomposePathFunc({ path: formatedPath });
            for (let i = 0; i < decomp.length; i++) {
                const targ = decomp[i]; /* Current path */
                const filter = paths.filter((e: string) => e.includes(targ) && e.indexOf(targ) === 0);
                const exists = filter.length > 0; /* If current path already exists */
                if (exists) {
                    /* collect all path, affected by current path's modifications */
                    const affPathCollector: JSON_STRING_TYPE = {};
                    for (let f = 0; f < filter.length; f++) {
                        const cpath = filter[f];
                        const dec = decomposePathFunc({ path: cpath });
                        for (let c = 0; c < dec.length; c++) {
                            const cpaf = dec[c];
                            affPathCollector[cpaf] = cpaf;
                        }
                    }

                    /* Collect watched and post-processible paths, affected by current path's modifications */
                    const arr = Object.keys(affPathCollector);
                    for (let d = 0; d < arr.length; d++) {
                        const current = arr[d];
                        if (!hasPropertyFunc(storeTopLevelDATA.current, current) && watchedPaths.includes(current))
                            watchedPaf[current] = current;
                        else
                            postProcess[current] = storeTopLevelDATA.current[current];
                    }
                }
                else newPandata[targ] = targ;
            }

            /* Update pandata */
            pandata[path] = newVal;
        }

        /* Update store */
        const newObj = Object.assign(storeTopLevelDATA.current, pandata);
        const reversedData = reverseTopLevelJsonFunc({ data: newObj }); /* Reverse JSON object */
        if (!reversedData.ok)
            throw new Error(reversedData.log);
        storeDATA.current = reversedData.data; /* Update "storeDATA" */

        /* Update "storeTopLevelDATA" */
        cacheStoreTopLevelDataFunc();

        /* Remove undefined pandata */
        for (let p in storeTopLevelDATA.current) {
            const current = storeTopLevelDATA.current[p];
            if (current === undefined)
                delete storeTopLevelDATA.current[p];
        }

        /* Tell the hooks that the store has changed */
        if (mutated) storeVersion.current++;

        /* Post processing */
        for (let k in postProcess) {
            if (hasPropertyFunc(storeTopLevelDATA.current, k)) {
                const oldVal = postProcess[k];
                const currentVal = storeTopLevelDATA.current[k];
                if (oldVal !== currentVal)
                    updatedPandata[k] = k;

            } else deletedPandata[k] = k;
        }

        /* Process watched paths */
        for (let k in watchedPaf) {
            const sourceA = topLevelDataclone;
            const sourceB = storeTopLevelDATA.current;

            /* Detect changes */
            const changed = comparePathFunc({ path: k, sourceA, sourceB }) === 'changed';
            if (!changed) continue;

            /* - */
            const keysA = Object.keys(sourceA);
            const keysB = Object.keys(sourceB);

            const filterA = keysA.filter((e) => e.includes(k) && e.indexOf(k) === 0);
            const filterB = keysB.filter((e) => e.includes(k) && e.indexOf(k) === 0);

            const updated = filterA.length > 0 && filterB.length > 0;
            if (updated)
                updatedPandata[k] = k;
            else
                deletedPandata[k] = k;
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
                storeListeners.current.forEach((listener) => { try { listener() } catch (e: any) { } });
        }));

    } catch (e: any) { res.ok = false; res.log = e.message }
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
        if (!hasPropertyFunc(watcherDATA.current, path))
            watcherDATA.current[path] = { get: {}, watch: { set: {}, update: {}, delete: {} } };

        /* Set callback */
        if (source === 'get')
            watcherDATA.current[path].get[watcherId] = { key: null, callback };
        else
            watcherDATA.current[path].watch[x.type][watcherId] = { key: x.key, callback };

    } catch (e: any) { logFunc('Err :: createWatcherFunc() =>', e.message) }
};

/** Remove watcher */
const removeWatcherFunc = (x: { watcherId: string | string[] }) => {
    const wid = Array.isArray(x.watcherId) ? x.watcherId : [x.watcherId];
    for (let i = 0; i < wid.length; i++) {
        const id = wid[i];
        for (let k in watcherDATA.current) {
            const wdata = watcherDATA.current[k];
            delete wdata.get[id];
            delete wdata.watch.set[id];
            delete wdata.watch.update[id];
            delete wdata.watch.delete[id];

            /* Forget the path once nobody watches it anymore, otherwise "watcherDATA" only grows (and slows every update down) */
            const empty = Object.keys(wdata.get).length === 0 &&
                Object.keys(wdata.watch.set).length === 0 &&
                Object.keys(wdata.watch.update).length === 0 &&
                Object.keys(wdata.watch.delete).length === 0;
            if (empty) delete watcherDATA.current[k];
        }
    }
};

/** Run watcher function */
const runWatcherFunctionFunc = (x: { path: string, key: string | null, callback: Function }) => {
    try {
        const key = x.key;
        const pandata = extractPandataFromPathFunc({ path: x.path });
        x.callback(key, pandata.data ?? undefined);

    } catch (e: any) { logFunc('Err :: runWatcherFunctionFunc() =>', e.message) }
};

/** Trigger update */
const triggerUpdateFunc = (x: TRIGGER_UPDATE_ARG_TYPE): void => {
    try {
        const path = Array.isArray(x.path) ? x.path : [x.path];
        const typ = x.type;
        const state = activePandaStoreState;

        for (let i = 0; i < path.length; i++) {
            const targ = formatPathFunc({ path: path[i], removeLastBracket: true }); /* Current path */
            const exists = watcherDATA.current[targ];
            if (!exists) continue;

            /* - */
            const getwatchers = watcherDATA.current[targ].get;
            const getFuncs = Object.values(getwatchers);
            for (let k = 0; k < getFuncs.length; k++)
                delayFunc().then(() => withPandaStoreState(state, () => {
                    try { getFuncs[k].callback() } catch (e: any) { }
                }));

            /* - */
            const watchWatchers = watcherDATA.current[targ].watch[typ];
            const watchFuncs = Object.values(watchWatchers);
            for (let k = 0; k < watchFuncs.length; k++)
                delayFunc().then(() => withPandaStoreState(state, () => {
                    runWatcherFunctionFunc({
                        path: targ,
                        key: watchFuncs[k].key,
                        callback: watchFuncs[k].callback
                    })
                }));
        }

    } catch (e: any) { logFunc('Err :: triggerUpdateFunc() =>', e.message) };
};

/** Build array from index pattern */
const buildArrayFromIndexPatternFunc = (x: { patchChain: any[], pathIndex: number }): any[] => {
    const patchChain = x.patchChain;
    const pathIndex = x.pathIndex;

    /* 0. Collect indexes and get array's max depth */
    let indexCollector: JSON_DEFAULT_TYPE = {};
    let maxDepth: number = 0;
    for (let l = 0; l < patchChain.length; l++) {
        /* Collect indexes */
        const spt = patchChain[l].split('.');
        const targ = spt[pathIndex].replaceAll('[', '').replaceAll(']', '');
        indexCollector[targ] = targ;

        /* Get array's max depth */
        const arr: any[] = targ.split('_');
        const alen = arr.length - 1;
        if (alen > maxDepth) maxDepth = alen;
    }

    /* 1. Create the top-level array "tab" */
    let tab: any[] = [];
    const lengthsTab = Object.keys(indexCollector).sort((a, b) => a.localeCompare(b));
    let l = 0;
    for (let t = 0; t < lengthsTab.length; t++) {
        const n = Number(lengthsTab[t].split('_')[0]);
        if (n > l) l = n;
    }
    tab = Array(l + 1).fill(undefined).map(() => null);

    /* 2. Create nested arrays */
    const hasNestedArr = maxDepth > 0;
    if (hasNestedArr)
        for (let h = 1; h <= maxDepth; h++) {
            const deepLevel = h;
            const len = deepLevel + 1;
            let filta = lengthsTab.filter((e) => e.split('_').length >= len);

            /* Limit deph to current "len", for each entry of "filter" */
            const newFilter: JSON_DEFAULT_TYPE = {};
            for (let s = 0; s < filta.length; s++) {
                const entry = filta[s];
                const split = entry.split('_');
                let val = entry;
                if (split.length > len) {
                    const arr = split.slice(0, len);
                    val = arr.join('_');
                };
                newFilter[val] = val;
            }
            filta = Object.keys(newFilter).sort((a, b) => a.localeCompare(b));

            /* Extract prefixes */
            const prefixes: JSON_DEFAULT_TYPE = {};
            for (let p = 0; p < filta.length; p++) {
                const arr = filta[p].split('_');
                let pfx = '';
                for (let f = 0; f < deepLevel; f++)
                    pfx = pfx + (pfx.length > 0 ? '_' : '') + arr[f];
                prefixes[pfx] = pfx;
            }

            /* Process each prefix */
            for (let key in prefixes) {
                const prefix = prefixes[key]; /* current prefix */

                /* Get nested array length */
                const indexCombinaison = filta.filter((e) => e.indexOf(prefix) === 0).sort((a, b) => a.localeCompare(b)); /* Extract all index combinaison, belonging to the current prefix */
                const joinedNestedIndex = indexCombinaison.join('_').replaceAll(`${prefix}_`, '');
                const nestedLength = Number(joinedNestedIndex.split('_').reverse()[0]) + 1;

                /* Create nested arrays */
                const splt = prefix.split('_');
                let tabRef: any[] = tab;
                for (let s = 0; s < splt.length; s++) {
                    const currentIndex = Number(splt[s]);
                    const isLastLoop = s === splt.length - 1;
                    if (!isLastLoop) tabRef = tabRef[currentIndex];
                    else tabRef[currentIndex] = Array(nestedLength).fill(undefined).map(() => null);
                }
            }
        }

    /* - */
    return tab;
};

/** Inspect shortcuts */
const inspectShortcutsFunc = (): JSON_DEFAULT_TYPE => {
    let res: JSON_DEFAULT_TYPE = {};
    const keys = Object.keys(shortcutsDATA.current);
    if (keys.length === 0) return res;
    for (let k in shortcutsDATA.current) {
        try { res[k] = resolvePathFunc({ path: k }) }
        catch (e: any) { res[k] = undefined }
    }
    shortcutsDATA.current = res;
    return res;
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
                    if (targ !== '%' && interopString.length > 0) {
                        /* - */
                        if (blockList.includes(interopString)) continue;

                        /* Get the corresponding dependencie's value */
                        const nb = Number(interopString.replace('%', ''));
                        const depVal = deps[nb];
                        if (!depVal)
                            throw new Error(`Invalid value for "%${nb}"`);

                        /* Store the interpolatable key and its corresponding dep's value */
                        interopCollector[interopString] = depVal;

                        /* - */
                        blockList.push(interopString);
                        interopString = '';

                    } else if (targ === '%') interopString = interopString + targ;

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
            for (let interop in interopCollector)
                if (newKey.includes(interop)) newKey = newKey.replaceAll(interop, interopCollector[interop]);
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
* Don't specify a value for "arr", it's used for recursive ops only 
*/
const topLevelJsonFunc = (x: { data: JSON_DEFAULT_TYPE, arr?: string[] }): FUNCTION_DEFAULT_RETURN_TYPE => {
    let res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        const data = x.data;
        let collector: JSON_DEFAULT_TYPE = {};
        const dtyp = getRealTypeFunc(data).type;

        /* - */
        if (dtyp === 'json')
            for (let key in data) {
                const val = data[key];
                const tab: string[] = !x.arr ? [] : [...x.arr]; /* Very sensitive! Should remain like this. */

                const typ = getRealTypeFunc(val).type;
                tab.push(key);

                /* - */
                switch (typ) {
                    case 'json': {
                        const recurse = topLevelJsonFunc({ data: val, arr: tab });
                        if (!recurse.ok)
                            throw new Error(recurse.log);
                        Object.assign(collector, recurse.data);
                    } break;

                    case 'array': {
                        for (let i = 0; i < val.length; i++) {
                            const entry = val[i];
                            const getType = getRealTypeFunc(entry);

                            const etyp = getType.type;
                            if (!getType.valid)
                                throw Error(`Invalid type ("${etyp}") found!`);
                            const idx = `[${i}]`;

                            /* - */
                            if (['json', 'array'].includes(etyp)) {
                                const recurse = topLevelJsonFunc({ data: entry, arr: [...tab, idx] });
                                if (!recurse.ok)
                                    throw new Error(recurse.log);
                                Object.assign(collector, recurse.data);

                            } else {
                                const ky = formatPathFunc({ path: [...tab, idx].join('.') });
                                collector[ky] = val[i];
                            }
                        }
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
                    const recurse = topLevelJsonFunc({ data: entry, arr: [...tab, idx] });
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
        res.ok = false; res.log = e.message;
        logFunc(`Err :: topLevelJsonFunc() => ${e.message}`);
    }
    return res;
};

/** Reverse "topLevelJsonFunc" */
const reverseTopLevelJsonFunc = (x: { data: JSON_DEFAULT_TYPE }): FUNCTION_DEFAULT_RETURN_TYPE => {
    let res: FUNCTION_DEFAULT_RETURN_TYPE = { ok: true, log: '', data: undefined };
    try {
        logFunc('\n\n');
        /* 
        * Purge 
        * When a path with a value of type array or json is overwritted, then clear any other depending paths in order to apply the update safely
        */
        const jsonData = x.data;
        const array = Object.keys(jsonData);
        const flt = array.filter((e) => ['array', 'json'].includes(getRealTypeFunc(jsonData[e]).type));
        for (let i = 0; i < flt.length; i++) {
            const paf = flt[i];
            const todelete = array.filter((e) =>
                e.includes(paf) &&
                e.indexOf(paf) === 0 &&
                e.length > paf.length
            );
            if (todelete.length > 0)
                for (let t = 0; t < todelete.length; t++) {
                    const k = todelete[t];
                    delete jsonData[k];
                }
        }

        /* - */
        const data = jsonData;
        const allKeys = Object.keys(data).sort((a, b) => a.localeCompare(b));
        const collector: JSON_DEFAULT_TYPE = {};

        /* Extract first column keys */
        const firstColumnKeys: JSON_DEFAULT_TYPE = {};
        for (let k in data) {
            const firstColumnKeyName = k.split('.')[0];
            firstColumnKeys[firstColumnKeyName] = firstColumnKeyName;
        }

        /* For each top-level key, extract all keys containing it */
        const topLevelKeys: { [keys: string]: string[] } = {};
        const tab = Object.keys(firstColumnKeys);
        for (let i = 0; i < tab.length; i++) {
            /* Extract keys */
            const target = tab[i];
            let keysTab = allKeys.filter((e) => e.includes(target) && e.indexOf(target) === 0);
            const kjoin = keysTab.join('');
            if (kjoin.includes('.'))
                keysTab = keysTab.filter((e) => e.includes(target + '.') && e.indexOf(target + '.') === 0);
            topLevelKeys[target] = keysTab;

            /* Set 'top-level' keys inside the collector */
            const firstEntry = keysTab[0] || undefined;
            const path = !firstEntry ? undefined : firstEntry.split('.')[1] ?? undefined;
            if (path) { /* Process top-level keys that are objects */
                const topLevelKeyType = getPathTypeFunc(path);
                collector[target] = (topLevelKeyType === 'json') ? {} : [];

            } else { /* Process top-level keys that are not objects */
                collector[target] = data[target];
                delete topLevelKeys[target]; /* Remove the top-level key as its processing is finished */
            }
        }

        /* Build array for top-level keys with a value of type array */
        for (let k in collector) {
            /* Skip non-array values */
            if (getRealTypeFunc(collector[k]).type !== 'array')
                continue;
            /* Build array from index pattern */
            const ktab = topLevelKeys[k];
            const flt = ktab.filter((e) => e.includes(k) && e.indexOf(k) === 0);
            collector[k] = buildArrayFromIndexPatternFunc({ patchChain: flt, pathIndex: 1 });
        }

        /* Get longest path length */
        const lenObj: JSON_DEFAULT_TYPE = {};
        let arr: number[] = [];
        for (let n = 0; n < allKeys.length; n++) {
            const ktab = allKeys[n].split('.');
            lenObj[ktab.length] = ktab.length;
        }
        arr = Object.values(lenObj);
        const longestPathLength = arr.sort((a, b) => b - a)[0];

        /* Process the paths of each top-level key */
        let processedPathChain: JSON_DEFAULT_TYPE = {};
        for (let k in topLevelKeys) {
            const keysTab = topLevelKeys[k];
            let pathIndex = 1;
            do {
                for (let i = 0; i < keysTab.length; i++) {
                    const ckey = keysTab[i]; /* current key */
                    const pathTab = ckey.split('.');

                    /* Get progressive pathChain */
                    let pathChain = '';
                    for (let p = 0; p <= pathIndex; p++)
                        pathChain = pathChain + (pathChain.length > 0 ? '.' : '') + pathTab[p];

                    /* Skip already processed path */
                    if (hasPropertyFunc(processedPathChain, pathChain))
                        continue;

                    /* - */
                    const filter = keysTab.filter((e) => e.includes(pathChain) && e.indexOf(pathChain) === 0);
                    if (filter.length === 0)
                        continue;
                    filter.sort((a, b) => a.localeCompare(b));

                    /* - */
                    const split = filter[0].split('.');
                    const nextPath = split[pathIndex + 1];

                    const paf = split.join('.');
                    const value = data[paf];

                    if (nextPath)
                        switch (getPathTypeFunc(nextPath)) {
                            case 'json': { jsonAppendDataFunc({ sourceObj: collector, pathChain: paf, data: value }) } break;

                            case 'array': { jsonAppendDataFunc({ sourceObj: collector, pathChain: paf, data: value, filter }); } break;

                            default: { };
                        }
                    else jsonAppendDataFunc({ sourceObj: collector, pathChain: paf, data: value });

                    /* Exclude current "pathChain" from next loops */
                    processedPathChain[pathChain] = pathChain;
                }

                /* Increment */
                pathIndex++;

            } while (pathIndex < longestPathLength);
        }

        /* - */
        res.data = collector;

    } catch (e: any) {
        res.ok = false; res.log = e.message;
        logFunc(`Err :: reverseTopLevelJsonFunc() => ${e.message}`);
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
        const tlv: JSON_DEFAULT_TYPE = topLevelJsonFunc({ data: jsonData });
        if (!tlv.ok)
            throw new Error(tlv.log);
        const data = tlv.data;

        /* Interpolation */
        let newObj = data;
        if (deps.length > 0)
            newObj = interpolateFunc({ json: data, deps });

        /* Update "storeDATA" */
        const updateStore = updateStoreDataFunc({ pandata: newObj });
        if (!updateStore.ok)
            throw new Error(updateStore.log);

    } catch (e: any) {
        res.ok = false; res.log = e.message;
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

        /* - */
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
        res.ok = false; res.log = e.message;
        logFunc('Err :: getDataFunc() =>', e.message);
    }
    return { data: res.data, paths: Object.keys(cachedPandata) }; /* Each key of "cachedPandata" is a path */
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
                    /* - */
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
        preserveDATA.current[id] = pandata;
        return id;
    }
    return pandata;
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
                }

                /* - */
                createWatcherFunc({
                    source: 'get',
                    path: formatPathFunc({ path: list[i], removeLastBracket: true }), /* Same format as the one used by "triggerUpdateFunc" */
                    watcherId,
                    callback: onChange
                });
            }
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

    /* Return pandata */
    return data;
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
                const store = withPandaStoreState(state, () => storeDataFunc(...x));
                return store;
            },

            /* Get pandata */
            get(path: '*' | GET_ARG_PATH_TYPE): any {
                const get = withPandaStoreState(state, () => getDataFunc(path));
                return get;
            },

            /* Watch pandata */
            watch(path: WATCH_ARG_TYPE): WATCH_RETURN_TYPE {
                const wnext = {
                    on(callbacks: WATCH_ON_ARG_TYPE, watcherId: [string]): FUNCTION_DEFAULT_RETURN_TYPE {
                        const watch = withPandaStoreState(state, () => watchDataFunc({ path, callbacks, watcherId: watcherId[0] }));
                        return watch;
                    }
                };
                return wnext;
            },

            /* Unwatch pandata */
            unwatch(watcherId: string | string[]): void {
                withPandaStoreState(state, () => removeWatcherFunc({ watcherId }));
            },

            /* Preserve pandata's references */
            preserve(pandata: any): any {
                const preserve = withPandaStoreState(state, () => preserveDATAFunc(pandata));
                return preserve;
            },

            /* Generate ID */
            genID(): string {
                return generateIdFunc();
            },

            /* Inspect shortcuts */
            inspectShortcuts(): JSON_DEFAULT_TYPE {
                return withPandaStoreState(state, () => {
                    inspectShortcutsFunc();
                    return shortcutsDATA.current;
                });
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
* export const { store, get, usePanda, watch, unwatch, preserve, genID, inspectShortcuts } = createPanda<Schema>();
*/
export const createPanda = <T extends JSON_DEFAULT_TYPE = any>(): PandaTyped<T> => {
    const state = ('window' in globalThis) ? sharedPandaStoreState : createPandaStoreState();
    const panda = Panda.init(state);
    const typed = {
        store: panda.store,
        get: panda.get,
        usePanda: (path: string | string[] | JSON_STRING_TYPE) => usePanda(path, state),
        watch: panda.watch,
        unwatch: panda.unwatch,
        preserve: panda.preserve,
        genID: panda.genID,
        inspectShortcuts: panda.inspectShortcuts
    };
    return typed as unknown as PandaTyped<T>;
};
export default createPanda;

