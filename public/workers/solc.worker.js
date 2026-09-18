/* ================================================================
   GlowFun · Solidity Compiler Web Worker
   Loads solc from CDN and compiles Standard JSON input
   ================================================================ */

let solcVersion = null
let loadedModule = null
let pendingCallbacks = []

function callSolc(module, inputJSON) {
  try {
    const compile = module.cwrap('solidity_compile', 'string', ['string', 'number'])
    return JSON.parse(compile(inputJSON, 0))
  } catch (e) {
    // Fallback: try undocumented direct call
    try {
      const result = module._solidity_compile
        ? module.ccall('solidity_compile', 'string', ['string', 'number'], [inputJSON, 0])
        : null
      if (result) return JSON.parse(result)
    } catch {}
    throw e
  }
}

function loadVersion(version, callback) {
  // Already loaded this version
  if (solcVersion === version && loadedModule) {
    callback(null, loadedModule)
    return
  }

  pendingCallbacks.push(callback)
  if (pendingCallbacks.length > 1) return // already loading

  // Reset state
  loadedModule = null
  solcVersion = version

  // Set up Module before importScripts
  const prevModule = self.Module
  self.Module = Object.assign(prevModule || {}, {
    onRuntimeInitialized: function () {
      loadedModule = self.Module
      const cbs = pendingCallbacks.splice(0)
      cbs.forEach(cb => cb(null, loadedModule))
    },
  })

  try {
    importScripts(`https://binaries.soliditylang.org/bin/soljson-${version}.js`)
    // Synchronous load (emscripten asm.js builds)
    if (loadedModule === null && self.Module && typeof self.Module.cwrap === 'function') {
      loadedModule = self.Module
      const cbs = pendingCallbacks.splice(0)
      cbs.forEach(cb => cb(null, loadedModule))
    }
  } catch (err) {
    const cbs = pendingCallbacks.splice(0)
    cbs.forEach(cb => cb(err.message))
  }
}

self.addEventListener('message', function (e) {
  const { id, action, data } = e.data

  if (action === 'version') {
    // Just load/cache the version
    loadVersion(data.version, (err) => {
      self.postMessage({ id, action: 'version', err })
    })
    return
  }

  if (action === 'compile') {
    loadVersion(data.version, (err, module) => {
      if (err) {
        self.postMessage({ id, action: 'compile', err: String(err) })
        return
      }

      const input = {
        language: 'Solidity',
        sources: data.sources,
        settings: {
          outputSelection: {
            '*': {
              '*': ['abi', 'evm.bytecode', 'evm.bytecode.object', 'evm.deployedBytecode', 'evm.gasEstimates', 'metadata', 'storageLayout'],
              '': ['ast'],
            },
          },
          optimizer: {
            enabled: data.optimize !== false,
            runs: data.runs || 200,
          },
          evmVersion: data.evmVersion || 'paris',
        },
      }

      try {
        const output = callSolc(module, JSON.stringify(input))
        self.postMessage({ id, action: 'compile', output })
      } catch (compileErr) {
        self.postMessage({ id, action: 'compile', err: String(compileErr) })
      }
    })
    return
  }
})
