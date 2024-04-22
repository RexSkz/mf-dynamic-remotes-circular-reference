# Module Federation Dynamic Remotes Issue

If you use dynamic remotes with `optimization.runtimeChunk`, you will experience a blank screen with no error due to a never-ending promise...

```js
// This will cause the app display to be blank
module.exports = {
  optimization: {
    runtimeChunk: {
      name: 'runtime',
    },
  },
  plugins: [
    new ModuleFederationPlugin({
      remotes: {
        'sub_app': `promise new Promise(resolve => {
          const script = document.createElement('script');
          script.src = 'http://localhost:3001/remoteEntry.js';
          script.onload = () => {
            resolve({
              get: request => window.sub_app.get(request),
              init: arg => {
                try { return window.sub_app.init(arg); } catch(e) { }
              },
            });
          };
          document.head.appendChild(script);
        })`,
      },
    }),
  ],
};
```

## Steps to Reproduce

1. Clone this repository
2. Run `pnpm i && pnpm start`
3. Open http://localhost:3000 in your browser

Either removing `optimization.runtimeChunk` or using hard-coded remotes instead of dynamic remotes will solve the issue.

```js
// This will work
module.exports = {
  // optimization: {
  //   runtimeChunk: {
  //     name: 'runtime',
  //   },
  // },
  plugins: [
    new ModuleFederationPlugin({
      remotes: {
        'sub_app': `promise new Promise(resolve => {
          const script = document.createElement('script');
          script.src = 'http://localhost:3001/remoteEntry.js';
          script.onload = () => {
            resolve({
              get: request => window.sub_app.get(request),
              init: arg => {
                try { return window.sub_app.init(arg); } catch(e) { }
              },
            });
          };
          document.head.appendChild(script);
        })`,
      },
    }),
  ],
};
```

```js
// This will work too
module.exports = {
  optimization: {
    runtimeChunk: {
      name: 'runtime',
    },
  },
  plugins: [
    new ModuleFederationPlugin({
      remotes: {
        'sub_app': 'sub_app@http://localhost:3001/remoteEntry.js',
      },
    }),
  ],
};
```

But this method will solve it once and for all.

```js
// Kee pboth `optimization.runtimeChunk` and dynamic remotes and it's working
module.exports = {
  optimization: {
    runtimeChunk: {
      name: 'runtime',
    },
  },
  plugins: [
    new ModuleFederationPlugin({
      // notice the "...args" in `get` and `init`
      // which means we pass all parameters
      remotes: {
        'sub_app': `promise new Promise(resolve => {
          const script = document.createElement('script');
          script.src = 'http://localhost:3001/remoteEntry.js';
          script.onload = () => {
            resolve({
              get: (...args) => window.sub_app.get(...args),
              init: (...args) => {
                try { return window.sub_app.init(...args); } catch(e) { }
              },
            });
          };
          document.head.appendChild(script);
        })`,
      },
    }),
  ],
};
```

## Root Cause

Both the "dynamic remotes" in module federation and the `runtimeChunk` feature play important roles in the issue.

- Dynamic remotes: returns a promise that resolves to an object with `get` and `init` functions, which in [the document](https://webpack.js.org/concepts/module-federation/#promise-based-dynamic-remotes) has just one parameter.
- `runtimeChunk`: creates a runtime chunk that contains the `__webpack_require__` function, which grabs this function out of the main chunk and the MF chunk.

But actually, `get` and `init` functions in dynamic remotes is called by `__webpack_require__.I`, which have more than one parameter - the second parameter `initScope` is important to handle circular dependencies in MF.

```js
var initPromises = {};
var initTokens = {};

__webpack_require__.I = (name, initScope) => {
  if(!initScope) initScope = [];

  var initToken = initTokens[name];
  if(!initToken) initToken = initTokens[name] = {};
  if(initScope.indexOf(initToken) >= 0) return;
  initScope.push(initToken);

  if(initPromises[name]) return initPromises[name];
  // ...
  initExternal("webpack/container/reference/sub_app");
  // ...
  return initPromises[name] = Promise.all(promises).then(() => (initPromises[name] = 1));
};
```

When app A calls app B, A will push an empty object (`initToken`) to the `initScope` array. Theoretically, this array should be passed to B, so when B calls A back, A can check if the `initToken` is in the `initScope` array and return immediately.

But in the example provided by the document, the `initScope` array is not passed, so it will be `undefined` and then be a new array. A will never know if its `initToken` is in `initScope`.

The `initPromises` now contains a promise, which actually is a promise that tried to load B! That means a promise is waiting for itself to resolve, which will never happen, and there is no error.

The MF chunk in A is:

```js
var promises = [];
switch(name) {
	case "default": {
		initExternal("webpack/container/reference/sub_app");
	}
	break;
}
if(!promises.length) return initPromises[name] = 1;
return initPromises[name] = Promise.all(promises).then(() => (initPromises[name] = 1));
```

The call path is:

```js
'A/business.js': await import('B')
'A/runtime.js':    initPromises['default'] = ...
'A/runtime.js':      initExternal('B')
'A/main.js':           script.onload => window.B.init('default')                    // A uses dynamic remotes
'B/remote-entry.js':     __webpack_require__.I('default', undefined)                // so the 2nd param is missing
'B/remote-entry.js':       initExternal('A')
'B/remote-entry.js':         module.init('default', [{/*B*/}])                      // B does not use dynamic remotes
'A/runtime.js':                __webpack_require__.I('default', [{/*B*/}, {/*A*/}]) // so the 2nd param is passed
'A/runtime.js':                  // initPromises['default'] already exists, return it
'A/runtime.js':                  // which cause the promise to wait for itself to resolve
```

The reason why it only happens when `runtimeChunk` is enabled is that if it's `false`, the `__webpack_require__.I` will be separated into both the main chunk and the MF chunk, and there is no `initExternal` call in the MF chunk.

The MF chunk in A is now:

```js
var promises = [];
switch(name) {
}
if(!promises.length) return initPromises[name] = 1;
return initPromises[name] = Promise.all(promises).then(() => (initPromises[name] = 1));
```

The call path is:

```js
'A/business.js': await import('B')
'A/main.js':       initPromises['default'] = ...
'A/main.js':         initExternal('B')
'A/main.js':           script.onload => window.B.init('default')                    // A uses dynamic remotes
'B/remote-entry.js':     __webpack_require__.I('default', undefined)                // so the 2nd param is missing
'B/remote-entry.js':       initExternal('A')
'B/remote-entry.js':         module.init('default', [{/*B*/}])                      // B does not use dynamic remotes
'A/remote-entry.js':           __webpack_require__.I('default', [{/*B*/}, {/*A*/}]) // so the 2nd param is passed
'A/remote-entry.js':             // initPromises['default'] exists in A/main.js, not A/remote-entry.js
'A/remote-entry.js':             // no initExternal call, return immediately
'A/remote-entry.js':           // done
'B/remote-entry.js':         // done
'B/remote-entry.js':       // done
'B/remote-entry.js':     // done
'A/main.js':           // done
'A/main.js':         // done
'A/main.js':       // done
'A/business.js': // done
```
