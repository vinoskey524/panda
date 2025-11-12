# panda <img src="assets/panda.png" alt="logo" width="40" height="40" style="vertical-align:bottom;margin-top:0px">

Advanced JSON-based state manager for React and React Native (Bare and Expo).

## Table of contents

- [Installation](#installation)
- [What's panda](#whats-panda)
- [API Documentation](#api-documentation)
    - [import](#import)
    - [set](#set)
    - [get](#get)
    - [usePanda](#usePanda)
    - [update](#update)
    - [delete](#delete)
    - [String Interpolation](#string-interpolation)
    - [preserve](#preserve)
    - [watch](#watch)
    - [unwatch](#unwatch)
    - [shortcuts](#shortcuts)
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

## API Documentation

>Note: Pay a good attention to the comments inside the code sections.

### **import**

```ts
import Panda from '@vinoskey524/panda';
// or
import { store, get, usePanda, preserve, watch, unwatch, genID, inspectShortcuts } from '@vinoskey524/panda';
```

### **set**

```ts
// 1. Regular method
const regular = store({
    user: {
        name: 'John Doe',
        job: 'Software Engineer',
        stack: ['react', 'panda', 'go', 'aws'],
        address: {
            street: '123 Main St',
            city: 'New York',
            zip: '10001',
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
        {
            key: 'value'
        }
    ]
});
console.log(regular);
console.log('\n\n');


// 2. Path-based method
const pathBased = store({
    'user.name': 'John Doe',
    'user.job': 'Software Engineer',

    'user.stack.[0]': 'react',
    'user.stack.[1]': 'panda',
    'user.stack.[2]': 'go',
    'user.stack.[3]': 'aws',

    'user.address.street': '123 Main St',
    'user.address.city': 'New York',
    'user.address.zip': '1001',
    'user.address.country': 'USA',

    'user.preferences.newsletter': true,
    'user.preferences.theme': 'dark',
    'user.preferences.notifications.email': true,
    'user.preferences.notifications.sms': false,
    'user.preferences.notifications.push': true,

    'randomArray.[0][0]': 'cat',
    'randomArray.[0][1]': 'dog',
    'randomArray.[1].key': 'value'
});
console.log(pathBased);
```

```sh
# log (regular)
{
    ok: true,
    log: '',
    data: undefined
}

# log (pathBased)
{
    ok: true,
    log: '',
    data: undefined
}
```

It returns as result a JSON object with the following properties:

- **`ok`**: (`boolean`) Indicates the status of the process: `true` for success and `false` for failure.

- **`log`**: (`string`) Contains the error message in case of failure.

- **`data`**: (`undefined`) Ignore this.

### **get**

```ts
// 1. Get all
const all = get('*');

// 2. Get one data
const name = get('user.name');
console.log('name ::', name);
console.log('\n\n');


// 3. Get many data grouped inside an array
const info = get([
    'user.name',
    'user.job',
    'user.address.city',
    'randomArray.[0][1]'
]);
console.log('info ::', info);
console.log('\n\n');


// 4. Get many data grouped as a JSON object
const { theme, acceptEmail } = get({
    theme: 'user.preferences.newsletter',
    acceptEmail: 'user.preferences.notifications.email'
});
console.log('preferences ::', theme, acceptEmail);
```

```sh
# log (name)
name :: 'John Doe'

# log (info)
info :: ['John Doe', 'Software Engineer', 'New York', 'dog']

# log (preferences)
preferences :: 'dark' true
```

It will return **undefined** if no data found.

### **usePanda**

It works exactly the same way as **get**, except that **it will update every time the data change**.

### **update**

```ts
// 1. Overwrite
store({
    'user.preferences.notifications.sms': true
});
console.log('sms ::', get('user.preferences.notifications.sms'));

// 2. Functional mutation
//    • The Function must always be synchronous and return the new value!
//    • Any asynchronous function will be ignored.
//    • Here we have uppercased the user's name.
store({
    'user.name': (currentValue: string) => currentValue.toUpperCase();
});
console.log('username ::', get('user.name'));
```

```sh
# log (sms)
sms :: true

# log (username)
username :: JOHN DOE
```

### **delete**

```ts
// Set any data you want to delete as "undefined".
// • Here we have deleted the user's address.
store({
    'user.address': undefined
});
```

### **String Interpolation**

```ts
store({
    '%0': { // Will be replaced by "suv"
        name: 'Porsche Cayenne S Coupe',
        engine: 'v8, 4.0L',
        power: '473 Ps',
        '%1': '600 Nm', // Will be replaced by "torque"
        topSpeed: '273 km/h',
        '%2': '2025' // Will be replaced by "year"
    }
}, ['suv', 'torque', 'year']);
```

It works only for keys inside a JSON object, and is useful when you need to set a key that is not predictible or a key you can't set as a string litteral for any reason.

### **preserve**

```ts
const func = () => { console.log('I am preserved!') };
const obj = { color: 'white' };

store({
    preserved: {
        func: preserve(func),
        obj: preserve(obj)
    }
});

console.log('1.', get('preserved'));

console.log('2. Change color to black directly from the original object, not panda.')
obj.color = 'black';

console.log('3.', get('preserved'));
```

It allows to:
- Store functions (both sync and async).
- Keep the reference to an object or a field.

Be aware of the following facts:
- Any unpreserved function will be treated as an updater (Functional mutation).
- You cannot specify a path into a preserved object. For example, **'preserved.obj.color'** is not possible and will give undefined, only **'preserved.obj'** is possible.

```sh
# log (1)
1. {
  func: [Function: func],
  obj: {
    color: "white",
  },
}

# log (2)
2. Change color to black directly from the original object, not panda.

# log (3)
3. {
  func: [Function: func],
  obj: {
    color: "black", // Because the reference is preserved, the change is reflected inside panda.
  },
}
```

### **watch**

```ts
// 1. Watch one data
const abc = useRef(genID()).current; /* The ID will be unique and immutable during the lifetime of the component */
watch('user.stack')
    .on({
        set: (_, data: any) => { console.log('set ::', data) }, // Will fire when the data is set the first time or after being previously deleted.
        update: (_, data: any) => { console.log('update ::', data) }, // Will fire everytime the data change.
        delete: (_, data: any) => { console.log('delete ::', data) } // Will fire when the data is deleted.
    }, [abc]); // Watcher's ID. Must be unique and immutable during all the lifetime of the watcher to avoid duplication.

// 2. Watch many data
const xyz = useRef(genID()).current;
watch({
    stack: 'user.stack',
    preferences: 'user.preferences'
}).on({
    set: (key: string, data: any) => { console.log('set ::', key, data) },
    update: (key: string, data: any) => { console.log('update ::', key, data) },
    delete: (key: string, data: any) => { console.log('delete ::', key, data) }
}, [xyz]);
```

### **unwatch**

```ts
// Remove a watcher
unwatch('watcher_id');

// Remove many watchers
unwatch(['watcher_0_id', 'watcher_1_id', 'watcher_2_id']);
```

### **shortcuts**

```ts
// Disable push notifications
// We've replaced the ".preferences.notifications." by "..."
store({
    'user...push': false
});

// Get push notification status
const pushActivated = get('user...push');
console.log('push ::', pushActivated);

// It's possible to give more precision before or after the "...", depending of the structure of your JSON and the use case.
const pushActivated2 = get('user...notifications.push');
const pushActivated3 = get('user.preferences...push');

// Get sms notification status
const smsActivated = get('user...sms');
console.log('sms ::', smsActivated);

// It works even throught arrays
const keyValue = get('randomArray...key');
console.log('key ::', keyValue);

// For debug purpose
const inspection = inspectShortcuts();
console.log('inspection ::', inspection);
```

```sh
# log (push)
push :: false

# log (sms)
sms :: true

# log (key)
key :: value

# log (inspection)
# { shortcut: full-path | undefined }
# Any invalid shortcut will be "undefined".
inspection :: {
  "user...sms": "user.preferences.notifications.sms",
  "user...push": "user.preferences.notifications.push",
  "randomArray...key": "randomArray.[1].key",
}
```

A shortcut allows you to replace anything between **two keys** by **"..."**. It works for **update**, **get**, **usePanda**, **delete** and **watch**.

Don't worry, it doesn't loop into the whole JSON tree to resolve the paths. Instead, it uses a custom optimization to do it efficiently.

> ⚠️ Please, note that if a shortcut corresponds to more than one path, it'll be invalidated by panda.

```ts
const data = {
    pref: {
        notifications1: {
            aVeryVeryLongKey: {
                anotherVeryVeryLongKey: {
                    theLastVeryVeryLongKey: {
                        email: true,
                        sms: true,
                        push: true
                    }
                }
            }
        },
        notifications2: {
            aVeryVeryLongKey: {
                anotherVeryVeryLongKey: {
                    theLastVeryVeryLongKey: {
                        email: false,
                        sms: false,
                        push: false
                    }
                }
            }
        }
    }
};

// Store data
store(data);

// Get sms notification status
// This will give undefined, because the shortcut corresponds to more than one path.
const invalid = get('pref...sms');
console.log('invalid ::', invalid);

// We'll need to give more precision
const valid1 = get('pref.notifications1...sms'); // For notifications1
const valid2 = get('pref.notifications2...sms'); // For notifications2
console.log('valid ::', valid1, valid2);

// Inspect shortcuts
console.log('inspection ::', inspectShortcuts())
```

```sh 
# log (invalid)
invalid :: undefined

# log (valid)
valid :: true false

# log (inspection)
# { shortcut: full-path | undefined }
# Any invalid shortcut will be "undefined".
inspection :: {
  "pref...sms": undefined,
  "pref.notifications1...sms": "pref.notifications1.aVeryVeryLongKey.anotherVeryVeryLongKey.theLastVeryVeryLongKey.sms",
  "pref.notifications2...sms": "pref.notifications2.aVeryVeryLongKey.anotherVeryVeryLongKey.theLastVeryVeryLongKey.sms",
}
```

## Performance recommendations

- Always give an unique and immutable ID to a watcher to avoid duplications, else it'll HEAVILY slow down updates.
- Don't use panda to store or manage feeds. It's a state manager not a feeds manager! Use **[forestdb](https://npmjs.com/package/forestdb)** instead for feeds management.

## Author

My name is **Hamet Kévin E. ODOUTAN** (@vinoskey524) and I’ve been doing software development (web, desktop and mobile) since 2017.

I’m not the kind of developer who makes a dumb copy-paste from ChatGPT. No! I like to understand things and know what I’m really doing. 
For me, a real developer should be able to explain every single line of his code.

Don’t ask me which school or university I attended, because I taught myself software engineering using PDFs from **openclassrooms.com**, which was called **siteduzero** when I started.
A sad truth is that you can’t learn coding just by watching videos; you need books!

I’m really passionate about building software, and **I sincerely believe that being a developer is not just a job, but a lifestyle**!

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