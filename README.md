# panda <img src="assets/panda.png" alt="logo" width="40" height="40" style="vertical-align:bottom;margin-top:0px">

Advanced JSON-based state manager for React and React Native (Bare and Expo).

> **Strongly type-safe and fully SSR-compatible.** Give `createPanda` your state schema and Panda checks paths, written values, updater functions and watcher data at compile time. For server rendering, create one Panda instance per request, export it with `dehydrate()` on the server and load it with `hydrate()` in the browser.

[Official Documentation](https://package524.vercel.app)

## Table of contents

- [Install](#install)
- [What is Panda](#what-is-panda)
- [Quick start and data model](#quick-start-and-data-model)
- [Type safety](#type-safety)
- [Good to know](#good-to-know)
- [API Documentation](#api-documentation)
    - [store](#store)
    - [get](#get)
    - [usePanda](#usepanda)
    - [watch and unwatch](#watch-and-unwatch)
    - [Path shortcuts](#path-shortcuts)
    - [preserve](#preserve)
        - [Function values](#example-1-callbacks-functions)
        - [Object or Class instances](#example-2-an-object-kept-by-reference-class-instance)
        - [React elements/components](#example-3-preserving-react-elementscomponents)
    - [dehydrate and hydrate](#dehydrate-and-hydrate)
    - [Utilities](#utilities)
- [Server-side rendering](#server-side-rendering)
- [Performance recommendations](#performance-recommendations)
- [Author](#author)
- [Other packages](#other-packages)
- [Contact Me](#contact-me)
- [License](#license)

## Install

```sh
npm install @vinoskey524/panda
# or: yarn add @vinoskey524/panda
# or: pnpm add @vinoskey524/panda
# or: bun add @vinoskey524/panda
```

## What is Panda

Panda is a powerful library that lets you manage the state of your applications with ease and flexibility, no matter their size or complexity. Unlike other state managers, it uses a single JSON data source and notifies you in real time of any change at any field, however deep. It's as simple as that!

## Quick start and data model

```ts
// App.tsx

// 1. import 'createPanda'
import createPanda from '@vinoskey524/panda';

// 2. Describe your app state
type AppState = {
  user: {
    name: string;
    job: string;
    stack: string[];
    address: {
      street: string;
      city: string;
      zip: number;
      country: string;
    };
    preferences: {
      newsletter: boolean;
      theme: 'light' | 'dark';
      notifications: {
        email: boolean;
        sms: boolean;
        push: boolean;
      };
    };
  };
  // A tuple documents the two different shapes held in this array.
  randomArray: [string[], { key: string }];
};

// 3. Use this factory to create an instance. On the server, call it once per request.
const createAppPanda = () => createPanda<AppState>();
export const panda = createAppPanda(); 

// 4. Initialize your state
panda.store({
  user: {
    name: 'John Doe',
    job: 'Software Engineer',
    stack: ['react', 'panda', 'go', 'aws'],
    address: {
      street: '123 Main St',
      city: 'New York',
      zip: 10001,
      country: 'USA'
    },
    preferences: {
      newsletter: true,
      theme: 'dark',
      notifications: {
        email: true,
        sms: false,
        push: true
      }
    }
  },
  randomArray: [
    ['cat', 'dog'],
    { key: 'value' }
  ]
});

/* 5. Your App component */ 
const App = () => {
  /* ... */
}
export default App;
```

Every value lives at a **path**:

| What you point at | Path syntax | Example |
| --- | --- | --- |
| A field of an object | dot | `user.address.city` |
| An item of an array | `.[index]` | `user.stack.[0]` |
| A field of an array item | `.[index].field` | `randomArray.[1].key` |
| An item of an array inside an array | `[i][j]` (no dot between) | `randomArray.[0][1]` |
| A shortcut to a unique path | `...` | `user...push` (see [Path shortcuts](#path-shortcuts)) |

## Type safety

`createPanda<AppState>()` derives the valid paths and value types from `AppState`. In typed mode, misspelled paths and incompatible values are compile-time errors, while reads, React hook values and watcher callbacks inherit their schema types.

```ts
panda.get('user.address.zip'); // number
panda.get('user.stack.[0]'); // string
panda.get('randomArray.[1].key'); // string

panda.store({
  'user.address.zip': 10002,
  'user.preferences.notifications.sms': true
});

// Compile-time errors in typed mode:
panda.get('user.address.postcode'); // 'postcode' doesn't exist
panda.store({ 'user.address.zip': '10001' }); // 'zip' is a number, not a string
```

Things worth knowing:

- Path typing supports nested object fields, array indexes and `...` shortcuts. The path generator has a finite recursion depth (about 12 levels), so very deeply nested schemas may exceed the typed-path limit.
- Type checking is compile-time guidance only. It does not validate external JSON (API responses, snapshots) at runtime.
- A typed `get('user.name')` returns the schema type (`string`), not `string | undefined`. A path that has not been written yet still returns `undefined` at runtime, so guard reads of fields you may not have stored. `get('*')` is the exception: it is typed as a deeply optional copy of your state.
- Without a schema type argument (`createPanda()`), the API falls back to the untyped form (any string path, any value).
- The package exports the helper types `Ref`, `Preserved`, `PandaTyped` and `PandaPaths`. `Ref` is used to type [preserved](#preserve) values.

## Good to know

- **Plain JSON data:** Strings, numbers, booleans, null, arrays and plain objects are accepted. Other objects (Date, Map, Set, class instances...) are rejected and `store` returns `{ ok: false, log }`; to keep such a value by reference, use [`preserve`](#preserve).
- **Writing an object merges it:** `store({ user: { name: 'Jane' } })` changes `user.name` and keeps every other field of `user`.
- **Writing an array replaces it:** To change one item, use its index path (`'user.stack.[1]'`).
- **undefined deletes:** Set a field to `undefined` to remove it, together with everything under it. Deleting an array item leaves `null` in its place, unless it is the last item (the array then gets shorter).
- **Empty containers are kept:** `store({ list: [] })` stores an empty array. Writing `{}` over an existing object leaves that object unchanged.
- **Field names build paths:** So avoid dots (`.`) in them.
- **Bare Function:** A bare function is an updater, not a value (see [store](#store)). To store a function as a value, use [`preserve`](#preserve).

## API Documentation

> Note: Pay close attention to the comments inside the code sections.

### **store**

`store` accepts a regular nested object, dot/bracket path keys, or a mixture of both. It returns `{ ok, log, data }`: check `ok` and read `log` if an operation fails (`data` is always `undefined` for a store operation). A failed `store` leaves the state untouched.

```ts
// 1. Nested-object form
panda.store({
  user: {
    name: 'Jane Doe'
  }
});

// 2. Path-based form, with a synchronous functional update
panda.store({
  'user.preferences.notifications.sms': true,
  'user.name': (currentName) => currentName.toUpperCase()
});

// 3. Array paths use bracket indexes
panda.store({
  'randomArray.[0][1]': 'panda',
  'randomArray.[1].key': 'updated'
});
```

A functional update receives the current value and must synchronously return its replacement. Async updater functions are rejected. Set a field to `undefined` to delete it:

```ts
panda.store({ 'user.address': undefined });
```

For interpolated keys, provide the paths as the second argument. In typed mode, each `%N` value is checked against its matching path:

```ts
panda.store(
  {
    '%0': 'Boston',
    '%1': 'light'
  },
  [
    'user.address.city', // %0
    'user.preferences.theme' // %1
  ]
);
```

### **get**

`get` can read the whole state, one path, a list of paths, or an object that maps your own result keys to paths.

```ts
// 1. Single path
const name = panda.get('user.name');

// 2. Many paths (array)
const [job, city] = panda.get(['user.job', 'user.address.city']);

// 3. Many paths (object)
const profile = panda.get({
  displayName: 'user.name',
  postalCode: 'user.address.zip'
});

// 4. Everything
const all = panda.get('*');
```

In typed mode, each path determines the corresponding return type. A missing path returns `undefined` at runtime.

**Reads are memoized**: as long as nothing changed under a path, `get` returns the very same object, so the result is safe in dependency arrays and `React.memo` comparisons. The returned values are shared, so treat them as **read-only** and write changes back with `store`.

### **usePanda**

`usePanda` accepts the same path forms as `get`, but it also subscribes the calling component and re-renders it when the selected paths change. Call it only inside a React function component or a custom hook.

```tsx
type AppPanda = ReturnType<typeof createAppPanda>;
type PandaProps = { panda: AppPanda };

const UserSummary = ({ panda }: PandaProps) => {
  // Re-renders only when "user.name" or "user.address.city" changes
  const name = panda.usePanda('user.name');
  const city = panda.usePanda('user.address.city');

  return <p>{name} lives in {city}</p>;
};
```

Panda implements the hook with React's `useSyncExternalStore`, including a server snapshot for SSR. Subscriptions are cleaned up when the component unmounts or when it changes the paths it reads. When you pass several paths (an array or an object), the hook keeps returning the same array/object until one of the values really changes.

### **watch and unwatch**

Use `watch(path).on(callbacks, [watcherId])` for imperative notifications (outside of React rendering):

| Callback | Fires when |
| --- | --- |
| `set` | a path is set for the first time, or set again after it was deleted |
| `update` | the value of an existing path changes |
| `delete` | a path is deleted (the callback receives `undefined`) |

Each callback receives `(key, data)`. For a single watched path, `key` is `null`. For an object of named paths, `key` is the matching alias and `data` has the type of that path.

#### Keep the `watcherId` stable with `useRef`

Every watcher needs a **unique id**, passed as a one-item array (`[string]`) and generated with `panda.genID()`. The id must stay the **same for the whole life of the watcher**. In a component, that means creating it once and keeping it in a `useRef`: a ref keeps the same value across re-renders.

```tsx
import { useEffect, useRef } from 'react';

const ZipWatcher = ({ panda }: PandaProps) => {
  // 1. Create the id ONCE, on the first render, and keep it in a ref.
  const watcherId: string = useRef(panda.genID()).current; // the same id on every render

  // 2. Register the watcher when the component mounts, remove it when it unmounts.
  useEffect(() => {
    const registration = panda.watch('user.address.zip').on({
        set: (key, zip) => console.log('zip set:', zip),
        update: (key, zip) => console.log('zip updated:', zip),
        delete: (key, value) => console.log('zip deleted:', value) // value is undefined
    }, [watcherId]);

    if (!registration.ok) console.error(registration.log);

    return () => panda.unwatch(watcherId); // cleanup
  }, [panda, watcherId]);

  return null;
};
```

Why `useRef` and not a plain variable? A variable declared in the component body is re-created on every render:

```tsx
const ZipWatcher = ({ panda }: PandaProps) => {
  // Don't: a NEW id on every render.
  const watcherId: string = panda.genID();

  useEffect(() => {
    panda.watch('user.address.zip').on({ 
      update: (key, value) => {} 
    }, [watcherId]);
    return () => panda.unwatch(watcherId);
  }, [panda, watcherId]); // watcherId changes at every render, so the watcher is removed and
                          // registered again after every render
  return null;
};
```

If the id changes between renders, the effect cleanup unwatches the old id and registers a new one each time. And if the id is left out of the effect's dependencies instead, the watcher keeps the id of the first render while the component holds a different one, which makes it easy to forget a watcher that is never removed. With `useRef`, the id is created once and never changes.

#### Good to know

- Callbacks must be synchronous and must **not return a value**: async callbacks are rejected by the typed API and ignored (with a warning) at runtime, and an expression-bodied arrow such as `() => items.push(x)` is a type error. Always use a block body: `() => { items.push(x); }`.
- Notifications are deferred until after the `store()` call, so a callback has not run yet when `store()` returns.
- Because of that deferral, a watcher registered right after a `store()` call can still receive the notification of that earlier `store()`.
- Watch several paths at once with aliases. The callback `key` is narrowed to those aliases:

```ts
const watcherId: string = useRef(panda.genID()).current;

// Watch many paths
panda.watch({
  zip: 'user.address.zip',
  city: 'user.address.city'
}).on({
  update: (key, value) => { console.log(key, value) } // key: 'zip' | 'city'
}, [watcherId]);

// Later, or in a React effect's cleanup:
panda.unwatch(watcherId);
```

- `unwatch` accepts one id or an array of ids.

### **Path shortcuts**

Use `...` to abbreviate a unique path between a prefix and a final key. Shortcuts work with `store`, `get`, `usePanda` and `watch`.

```ts
panda.store({ 'user...push': false });
const pushEnabled = panda.get('user...push');
const shortcuts = panda.inspectShortcuts(); // { 'user...push': 'user.preferences.notifications.push' }
```

A shortcut must resolve to exactly one schema path. If it matches nothing or is ambiguous, typed mode reports a compile-time error; at runtime an unresolved shortcut cannot identify a value. `inspectShortcuts()` returns an object that maps every shortcut Panda has seen to the path it resolves to (or `undefined` if it cannot be resolved).

### **preserve**

Panda stores JSON. `preserve(value)` is the escape hatch for everything that is not JSON: a function, a class instance, a React element, a React component... Panda keeps it **by reference** (it never copies or looks inside it) and gives you back a token that you can store at any path. Reading that path returns the original value, not a copy.

Three rules:

1. **A bare function in `store` is an updater**, not a value. To store a function as a value, wrap it: `preserve(fn)`.
2. **Type preserved fields in your schema.** Functions can be typed directly. For objects, class instances and React elements, use `Ref<T>`: `type State = { player: Ref<AudioPlayer>; modal: Ref<ReactElement>; myFunction: Function }`;.
3. **Reading gives you the original value.** The type you get back is `T`, not `Ref<T>`.

#### Example 1: callbacks (functions)

```ts
// 1. Create an instance of panda
type AppState = {
  session: { userName: string };
  actions: { logout: () => void };
};
const app = createPanda<AppState>();

// 2. The function to store
const logout = () => console.log('Logged out');

// 3. Store the function itself, not an updater
app.store({
  session: { userName: 'John' },
  actions: { 
    logout: app.preserve(logout) // preserve the function itself
  }
});

// 4. Anywhere in your app
const onLogout = app.get('actions.logout'); // the very same function
onLogout();
```

#### Example 2: an object kept by reference (class instance)

```ts
import createPanda from '@vinoskey524/panda';
import type { Ref } from '@vinoskey524/panda'; // `Ref` helper

// 1. Create your class
class AudioPlayer {
  play() {
    /* ... */
  }
};

// 2. Create an instance of panda
type MediaState = { 
    player: Ref<AudioPlayer> // use `Ref<T>` to type the preserved field
};
const media = createPanda<MediaState>();

// 3. Store/preserve the AudioPlayer instance
media.store({ 
    player: media.preserve(new AudioPlayer()) 
});

// 4. Anywhere in your app
media.get('player').play(); // the same AudioPlayer instance every time
```

Panda does not watch what happens inside a preserved value: changing the instance does not notify anybody. To tell Panda (and its watchers and hooks) that the value changed, store a new preserved reference: `media.store({ player: media.preserve(player) })`.

#### Example 3: preserving React elements/components

`preserve` also keeps a React **element** (`preserve(<MyComponent />)`) or a React **component** (`preserve(MyComponent)`). The path you stored it at becomes a key you can read from anywhere to render it. That makes a state-driven "slot", for example a modal, a toast or a side panel that any part of your app can open without prop drilling.

```tsx
import createPanda from '@vinoskey524/panda';
import type { Ref } from '@vinoskey524/panda';
import type { ReactElement } from 'react';

// 1. Describe the slot: an element is typed with Ref<ReactElement>
type UiState = {
    modal: Ref<ReactElement> 
};
const ui = createPanda<UiState>();

// 2. The component you want to display
const ConfirmDialog = ({ message }: { message: string }) => (
  <div role="dialog">
    <p>{message}</p>
    <button onClick={() => ui.store({ modal: ui.preserve(<></>) })}>
      Close
    </button>
  </div>
);

// 3. Preserve the element ONCE (module scope), then reuse the token
const confirmDialog = ui.preserve(<ConfirmDialog message="Delete this item?" />);

// 4. The host: it renders whatever element is stored under "modal"
const ModalHost = () => {
  const modal = ui.usePanda('modal'); // the element
  return <>{modal}</>;
};

// 5. Anyone can open the modal: just store the preserved element under that key
const DeleteButton = () => (
  <button onClick={() => ui.store({ modal: confirmDialog })}>
    Delete
  </button>
);

const App = () => (
  <>
    <DeleteButton />
    <ModalHost />
  </>
);
```

- **Open**: `ui.store({ modal: confirmDialog })`. `ModalHost` re-renders and shows the dialog.
- **Close**: `ui.store({ modal: ui.preserve(<></>) })`. `ModalHost` renders nothing again.
- **Swap**: store another preserved element under the same key and the host displays it instead.

Preserve the component itself when you want to decide its props at render time:

```tsx
import type { FC } from 'react'; // 'FC' stands for 'FunctionComponent' 

// 1. Create an instance of panda
type UiState = { screen: FC<ScreenProps> };
const ui = createPanda<UiState>();

// 2. Preserve the component
type ScreenProps = { title: string };
const SettingsScreen = ({ title }: ScreenProps) => <main>{title}</main>;
ui.store({ screen: ui.preserve(SettingsScreen) });

// 3. Retrieve and render the preserved component
const ScreenHost = () => {
  const Screen = ui.usePanda('screen'); // the component, used like any other component
  return <Screen title="Settings" />;
};
```

| You preserve | Stored value | You render it with | Props |
| --- | --- | --- | --- |
| an element: `preserve(<Dialog message="Hi" />)` | a ready-made element | `{element}` | fixed when the element is created |
| a component: `preserve(Dialog)` | the component function | `<Component />` | chosen where you render it |

#### Things to remember

- **Create preserved values once:** Panda keeps every preserved reference for the lifetime of the instance, so calling `preserve(...)` again and again (for example on every render or every click) keeps adding references. Create it once (module scope, `useMemo`, `useRef`) and reuse the token.
- **Preserved values never travel:** They are not JSON, so [`dehydrate`](#dehydrate-and-hydrate) leaves them out. After hydrating in the browser, store them again (for example in an effect or an event handler).
- **Panda never looks inside a preserved value:** It is not traversed or watched, and typed mode generates no sub-paths for it. Read the preserved field itself, not a path inside it.

### **dehydrate and hydrate**

These two functions move a whole Panda state from one place to another (usually from a server to a browser):

```ts
// 1. Anywhere: turn the whole state into a string
const snapshot: string = panda.dehydrate();

// 2. Elsewhere: load it into another instance
const result = otherPanda.hydrate(snapshot); // { ok, log, data }
if (!result.ok) console.error(result.log);
```

- `dehydrate(onSkip?)` returns a JSON string that is safe to put inside an inline `<script>` tag (`<` and the JavaScript line separators are escaped). Anything that JSON cannot carry is left out: [preserved](#preserve) values, functions, symbols, BigInt, `NaN` and `Infinity`. Pass `onSkip` to receive the list of the paths that were left out.
- `hydrate(snapshot)` accepts the string or the already parsed object. It writes it with the regular `store` flow, so watchers and hooks are notified like for any other write. A snapshot that is not valid JSON, or not an object, returns `{ ok: false, log }`.

See [Server-side rendering](#server-side-rendering) for the complete flow.

### **Utilities**

- `genID()` returns a unique string. Use it to create [watcher ids](#keep-the-watcherid-stable-with-useref).
- `inspectShortcuts()` lists the resolved [shortcuts](#path-shortcuts).
- `setPandaDebug(true)` turns on Panda's internal debug logs (`import { setPandaDebug } from '@vinoskey524/panda'`).

## Server-side rendering

Server rendering means your server builds the HTML of the page, so the user sees content before any JavaScript runs. Then the browser "hydrates" that HTML: React attaches to it instead of rebuilding it. For this to work, **the first render in the browser must produce exactly the same HTML as the server**, which means it must read exactly the same data.

Panda gives you everything for that:

```
 SERVER (once per request)                                                    BROWSER
 ─────────────────────────                                                    ───────
 1. panda = createAppPanda()     ← a fresh store, just for this request
 2. panda.store(data)            ← fill it BEFORE rendering
 3. html = renderToString(...)   ← components read the store
 4. state = panda.dehydrate()    ← export the store as a string
         │
         └── send  html + state ────────────────────────────────────────────► 5. panda = createAppPanda()
                                                                              6. panda.hydrate(state)   ← same data as the server
                                                                              7. hydrateRoot(root, <UserSummary panda={panda} />)
```

Here is the complete example. It uses three files and the `UserSummary` component from [usePanda](#usepanda).

**`app-panda.ts`: shared by the server and the browser**

```ts
import createPanda from '@vinoskey524/panda';

export type AppState = {
  user: {
    name: string;
    address: { zip: number };
  };
};

// A factory, not a ready-made instance: each request needs its own.
export const createAppPanda = () => createPanda<AppState>();
export type AppPanda = ReturnType<typeof createAppPanda>;
```

**`UserSummary.tsx`: shared. The component receives the instance as a prop**

```tsx
import type { AppPanda } from './app-panda';

export const UserSummary = ({ panda }: { panda: AppPanda }) => {
  const name = panda.usePanda('user.name');
  const zip = panda.usePanda('user.address.zip');

  return (
    <p>
      {name} — {zip}
    </p>
  );
};
```

**`server.tsx`: runs on every request**

```tsx
import { renderToString } from 'react-dom/server';
import { createAppPanda } from './app-panda';
import { UserSummary } from './UserSummary';

export const renderPage = async (userId: string) => {
  const user = await fetchUser(userId); // your own data loading

  const panda = createAppPanda(); // 1. a fresh, isolated store for THIS request
  panda.store({ user }); // 2. fill it BEFORE rendering
  const html = renderToString(<UserSummary panda={panda} />); // 3. render the page
  const state = panda.dehydrate(); // 4. export the store, safe to inline in a <script>

  return `<!doctype html>
<html>
  <body>
    <div id="root">${html}</div>
    <script>window.__PANDA_STATE__ = ${state};</script>
    <script src="/client.js"></script>
  </body>
</html>`;
};
```

**`client.tsx`: runs in the browser**

```tsx
import { hydrateRoot } from 'react-dom/client';
import { createAppPanda } from './app-panda';
import { UserSummary } from './UserSummary';

declare global {
  interface Window {
    __PANDA_STATE__?: object;
  }
}

const panda = createAppPanda();

// 5. Load the server's data BEFORE React hydrates...
if (window.__PANDA_STATE__) panda.hydrate(window.__PANDA_STATE__);

// 6. ...so the first render reads the same data as the server did.
hydrateRoot(document.getElementById('root')!, <UserSummary panda={panda} />);
```

Without step 5, the browser store would be empty at the first render: `UserSummary` would render nothing while the HTML sent by the server shows the user, and React would report a hydration mismatch.

### Rules to keep in mind

- **One instance per request, on the server:** Create it inside the request handler (that is why `createAppPanda` is a function). Never keep a request's Panda instance in module scope: a server process handles many users, and they must not share data. Instances created on a server are isolated from each other.
- **Fill the store before you render:** Pass that same instance to the components of that request (as a prop, like above).
- **Hydrate before `hydrateRoot`:** `hydrate()` is synchronous, so the data is in the store when React starts.
- **Only JSON travels:** `dehydrate()` leaves out [preserved](#preserve) values (functions, components, instances). Store them again in the browser, after hydration (in an effect, for example).
- **Browser data stays in the browser:** Values that only exist there (`localStorage`, the window size...) cannot be known by the server: store them in an effect, after hydration, otherwise the first render will not match.
- **Browser instances share one store:** In a browser, every `createPanda()` call gives access to the same store (for backwards compatibility), so create your browser instance once, as in `client.tsx`.
- **In a framework the three steps are the same:** create the instance and `store` the data on the server, send `dehydrate()`'s output next to the HTML, and `hydrate()` in the browser before hydrating. Use the framework's own mechanism to transfer the string if it has one.

Panda captures each instance's state for its deferred store notifications, watcher callbacks and React subscriptions, so those deferred updates always target the instance that scheduled them.

## Performance recommendations

- Subscribe with `usePanda` to the specific paths a component needs instead of reading the entire state.
- Write only what changes: `store({ 'user.address.city': 'Paris' })` only touches that path, and its cost follows the size of the change, not the size of your store.
- Reads are memoized, so you can depend on their results in `useMemo`/`useEffect` dependency arrays. Treat them as read-only.
- Give each watcher a unique id, keep it stable with `useRef`, and remove the watcher with `unwatch` when it is no longer needed.
- Create preserved values once and reuse their tokens.
- Panda manages application state; it is not a feed manager. For feeds, use [forestdb](https://npmjs.com/package/forestdb).

## Author

My name is **Hamet Kévin E. ODOUTAN** (@vinoskey524), and I'm a self-taught full-stack software engineer with **9 years of experience (since 2017)** designing, building and shipping web and mobile applications with **TypeScript**, **React** and **PostgreSQL**, including custom PL/pgSQL functions.

I take features end to end, from database schema and APIs to polished, high-performance interfaces, and I work across web and mobile with React and React Native (Bare and Expo). I use AI tools throughout my workflow to move quickly, prioritize what matters most and iterate fast. I'm always ready to learn and adopt new technologies quickly.

## Other packages

Below are other packages from the same author.

<!-- - **[voicify](https://npmjs.com/package/voicify)**: A highly efficient and blazing fast Text-To-Speech (TTS) software. -->

- **[forestdb](https://npmjs.com/package/forestdb)**: An uncomplicated real-time database with encrypted HTTP and WebSocket server-client communication, fast caching, dataflow and state management, a cross-runtime file system manager, and more, working seamlessly on both frontend and backend.

- **[cococity](https://npmjs.com/package/cococity)**: A lightweight and high-performance library that provides regional data and precise GPS-based localization, without relying on external APIs.

- **[illisible](https://npmjs.com/package/illisible)**: A powerful and high-performance cross-runtime encryption software.

- **[feedlist-react](https://npmjs.com/package/@vinoskey524/feedlist-react)**: A highly efficient and high-performance feeds renderer, designed for React.

- **[feedlist-react-native](https://npmjs.com/package/@vinoskey524/feedlist-react-native)**: A highly efficient and high-performance feeds renderer, designed for React Native (Bare and Expo).

- **[oh-my-json](https://npmjs.com/package/@vinoskey524/oh-my-json)**: The zenith of JSON manipulation.

## Contact Me

Feel free to reach me at [vinoskey524@gmail.com](mailto:vinoskey524@gmail.com). I speak both French and English.

## License

MIT License

Copyright (c) 2025 Hamet Kévin E. ODOUTAN

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM,
OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
