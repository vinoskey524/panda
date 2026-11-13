# panda <img src="assets/panda.png" alt="logo" width="40" height="40" style="vertical-align:bottom;margin-top:0px">

Advanced JSON-based state manager for React and React Native (Bare and Expo).

> **Now strongly type-safe and fully SSR-compatible.** Give `createPanda` your state schema and Panda checks paths, write values, updater values, and watcher callback data at compile time. For server rendering, create a Panda instance per request and pass that instance into the render tree; each server instance has isolated state, and `usePanda` uses React's external-store API with a server snapshot.

[Official Documentation](https://package524.vercel.app)

## Table of contents

- [Installation](#installation)
- [What's panda](#whats-panda)
- [Quick start and data model](#quick-start-and-data-model)
- [Type safety](#type-safety)
- [API Documentation](#api-documentation)
    - [store](#store)
    - [get](#get)
    - [usePanda](#usePanda)
    - [watch and unwatch](#watch-and-unwatch)
    - [Path shortcuts](#path-shortcuts)
    - [preserve](#preserve)
- [Server-side rendering](#server-side-rendering)
- [Performance recommendations](#performance-recommendations)
- [Author](#author)
- [Other packages](#other-packages)
- [Contact Me](#contact-me)
- [License](#license)

## Installation

```sh
# npm
$ npm install @vinoskey524/panda

# yarn
$ yarn add @vinoskey524/panda

# pnpm
$ pnpm add @vinoskey524/panda

# bun
$ bun add @vinoskey524/panda
```

## What's Panda 

Panda is a powerful software that allows you to manage the states of your applications with incredible ease and flexibility, no matter the size or complexity of your apps. Unlike other state managers, it uses a single JSON data source and notifies in real time of any change occurring at any field level, no matter the depth. It's as simple as that!

## Quick start and data model

```ts
import createPanda from '@vinoskey524/panda';

// 1. Create the type for your app state
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

// 2. Use this factory to create an instance. On the server, call it per request.
const createAppPanda = () => createPanda<AppState>();
const panda = createAppPanda();

// 3. Initialize your state
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
```

## Type safety

`createPanda<AppState>()` derives valid paths and value types from `AppState`. In typed mode, misspelled paths and incompatible values are compile-time errors, while reads, React hook values, and watcher callbacks inherit their schema types.

```ts
panda.get('user.address.zip'); // string
panda.get('user.stack.[0]'); // string
panda.get('randomArray.[1].key'); // string

panda.store({
  'user.address.zip': 10002,
  'user.preferences.notifications.sms': true
});

// Compile-time errors in typed mode:
panda.get('user.address.postcode'); // 'postcode' doesn't exists
panda.store({ 'user.address.zip': '10001' }); // string, but zip is a number
```

Path typing supports nested object fields, array indexes, and `...` shortcuts. The path generator has a finite recursion depth, so very deeply nested schemas may exceed the typed-path limit. Type checking is compile-time guidance; it does not validate external JSON at runtime. Without a schema type argument (`createPanda()`), the API falls back to the untyped form.

## API Documentation

>Note: Pay a good attention to the comments inside the code sections.

### **store**

`store` accepts a regular nested object, dot/bracket path keys, or a mixture of both. It returns `{ ok, log, data }`; check `ok` and use `log` if an operation fails (`data` is currently `undefined` for a store operation).

```ts
// 1. Nested-object form
panda.store({
  user: {
    name: 'Jane Doe'
  }
});

// 2. Path-based form and a synchronous functional update
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

For interpolated keys, provide paths as the second argument. In typed mode, each `%N` value is checked against its matching dependency path:

```ts
panda.store({ 
  '%0': 'Boston',
  '%1': 'light'
},[
  'user.address.city',
  'user.preferences.theme'
]);
```

### **get**

`get` can read the whole state, one path, a list of paths, or an object that maps your own result keys to paths.

```ts
// 1. Single path
const name = panda.get('user.name');

// 2. Many paths (Array)
const [job, city] = panda.get(['user.job', 'user.address.city']);

// 3. Many paths (JSON)
const profile = panda.get({
  displayName: 'user.name',
  postalCode: 'user.address.zip'
});

// 4. Get all
const all = panda.get('*');
```

In typed mode, each path determines the corresponding return type. `get('*')` represents the progressively populated state, so its fields are deeply optional. A missing path returns `undefined` at runtime.

### **usePanda**

`usePanda` accepts the same path forms as `get`, but subscribes the calling React component and re-renders it when the selected path changes. Call it only inside a React function component or custom hook.

```tsx
type AppPanda = ReturnType<typeof createAppPanda>;

function UserSummary({ panda }: { panda: AppPanda }) {
  const name = panda.usePanda('user.name');
  const zip = panda.usePanda('user.address.zip');

  return <p>{name} — {zip}</p>;
}
```

Panda implements the hook with `useSyncExternalStore`, including a server snapshot for React SSR. Subscriptions are cleaned up when the component unmounts or changes the paths it reads.

### **watch and unwatch**

Use `watch(path).on(callbacks, watcherId)` for imperative notifications. `set` fires when a path is first set or set again after deletion; `update` fires when an existing value changes; `delete` fires when a value is deleted. For a single watched path, the callback key is `null`. For an object of named paths, the key is the matching alias and the data type follows that path.

```tsx
import { useEffect, useRef } from 'react';

type AppPanda = ReturnType<typeof createAppPanda>;

function ZipWatcher({ panda }: { panda: AppPanda }) {
  const watcherIdRef = useRef<[string] | null>(null);
  if (watcherIdRef.current === null) {
    watcherIdRef.current = [panda.genID()];
  }

  useEffect(() => {
    const watcherId = watcherIdRef.current!;
    const registration = panda.watch('user.address.zip').on({
      set: (_key, zip) => console.log('zip set:', zip),
      update: (_key, zip) => console.log('zip updated:', zip),
      delete: (_key, value) => console.log('zip deleted:', value) // value is undefined
    }, watcherId);

    if (!registration.ok) console.error(registration.log);
    return () => panda.unwatch(watcherId);
  }, [panda]);

  return null;
}
```

Watcher IDs must be unique and stable for the lifetime of each watcher. Callbacks are synchronous functions; async callbacks are ignored by Panda and rejected by the typed API. Notifications are deferred until after the `store()` call, so do not expect a callback to have run before that call returns.

To watch multiple paths, provide aliases; the callback key is narrowed to those aliases:

```ts
const watcherId: [string] = [panda.genID()];

panda.watch({
  zip: 'user.address.zip',
  city: 'user.address.city'
}).on({
  update: (key, value) => console.log(key, value)
}, watcherId);

// Later, or in a React effect's cleanup:
panda.unwatch(watcherId);
```

`unwatch` accepts one ID or an array of IDs.

### **Path shortcuts**

Use `...` to abbreviate a unique path between a prefix and a final key. Shortcuts work with `store`, `get`, `usePanda`, and `watch`.

```ts
panda.store({ 'user...push': false });
const pushEnabled = panda.get('user...push');
const shortcuts = panda.inspectShortcuts();
```

A shortcut must resolve to exactly one schema path. If it is missing or ambiguous, typed mode reports an error for the shortcut; at runtime an unresolved shortcut cannot identify a value. `inspectShortcuts()` returns the shortcut-to-path mappings Panda has resolved.

### **preserve**

`preserve(value)` tells Panda to retain a function or object by reference instead of treating it as ordinary JSON data. In a schema-typed store, function-valued fields can be written using the token returned by `preserve`:

```ts
type StateWithAction = {
  onSave: () => void;
};

const actions = createPanda<StateWithAction>();
const onSave = () => console.log('Saved');

actions.store({ onSave: actions.preserve(onSave) });
```

Panda does not traverse inside preserved values, so read the preserved field itself rather than a nested path within it. Preserved references are not JSON-serializable; keep them out of data that must be transferred from an SSR server to the browser.

## Server-side rendering

Panda is designed to work with React SSR and hydration. On a server runtime, each call to `createPanda()` creates a new isolated store. Create the instance inside the request/render function, seed it before rendering, and pass that same instance to the components in that request. Do not keep a request-specific Panda instance in module scope: a server process can handle multiple users and requests.

```tsx
import { renderToString } from 'react-dom/server';

function renderProfileRequest(requestState: AppState) {
  // A new, isolated store for this request.
  const panda = createAppPanda();
  const result = panda.store(requestState);
  if (!result.ok) throw new Error(result.log);

  const html = renderToString(<UserSummary panda={panda} />);
  return { html, initialState: requestState };
}
```

For hydration, safely serialize the same initial state with your framework's supported data-transfer mechanism, create a browser Panda instance, seed it with that state, and pass it to the hydrated tree:

```tsx
import { hydrateRoot } from 'react-dom/client';

const panda = createAppPanda();
const result = panda.store(initialStateFromServer);
if (!result.ok) throw new Error(result.log);

hydrateRoot(rootElement, <UserSummary panda={panda} />);
```

The server render and first client render must start from matching data to avoid hydration mismatches. Use your framework's safe serializer instead of inserting untrusted JSON directly into an inline `<script>`. Keep SSR-transferable state JSON-compatible; preserved functions and object references cannot be serialized as normal JSON.

For backwards compatibility, Panda instances created in a browser share the browser store. On the server, instances created per request have isolated stores. Panda also captures each instance's state for deferred store notifications, watcher callbacks, and React subscriptions, so those deferred updates continue to target the instance that scheduled them.

## Performance recommendations

- Give each watcher a unique, stable ID and remove it with `unwatch` when it is no longer needed.
- Subscribe with `usePanda` to the specific paths a component needs instead of reading the entire state when unnecessary.
- Panda manages application state; it is not a feed manager. For feeds, use [forestdb](https://npmjs.com/package/forestdb).

## Author

My name is **Hamet Kévin E. ODOUTAN** (@vinoskey524), and I'm a self-taught full-stack software engineer with **9 years of experience (since 2017)** designing, building, and shipping web and mobile applications with **TypeScript**, **React**, and **PostgreSQL**, including custom PL/pgSQL functions.

I take features end to end, from database schema and APIs to polished, high-performance interfaces, and I work across web and mobile with React and React Native (Bare and Expo). I use AI tools throughout my workflow to move quickly, prioritize what matters most, and iterate fast. I'm always ready to learn and adopt new technologies quickly.

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

Copyright (c) [2025] [Hamet Kévin E. ODOUTAN]

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