/* ================================================================
   GlowFun · Solidity Compiler Web Worker
   - Loads solc from CDN
   - Resolves @openzeppelin and other package imports via GitHub CDN
   - Handles relative imports inside package files recursively
   ================================================================ */

// ── Package → CDN base URL mapping ─────────────────────────────────
const PACKAGE_CDN = {
  '@openzeppelin/contracts':
    'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.0.2/contracts',
  '@openzeppelin/contracts-upgradeable':
    'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts-upgradeable/v5.0.2/contracts',
  'solmate':
    'https://raw.githubusercontent.com/transmissions11/solmate/v6/src',
  '@uniswap/v2-core/contracts':
    'https://raw.githubusercontent.com/Uniswap/v2-core/master/contracts',
  '@uniswap/v3-core/contracts':
    'https://raw.githubusercontent.com/Uniswap/v3-core/main/contracts',
  'forge-std/src':
    'https://raw.githubusercontent.com/foundry-rs/forge-std/v1.7.0/src',
}

// ── Synchronous HTTP fetch (valid in Workers, not in main thread) ───
const _fetchCache = {}
function fetchSync(url) {
  if (url in _fetchCache) return _fetchCache[url]
  try {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false) // false = synchronous (OK in workers)
    xhr.send()
    _fetchCache[url] = xhr.status === 200 ? xhr.responseText : null
    return _fetchCache[url]
  } catch (e) {
    _fetchCache[url] = null
    return null
  }
}

// ── Resolve a (fromVirtualPath, importPath) pair ────────────────────
// Returns { virtualPath, fetchUrl } or null
function resolveImport(fromVirtualPath, importPath) {
  // 1. Direct package import: @openzeppelin/contracts/token/ERC20/ERC20.sol
  for (const [pkg, cdnBase] of Object.entries(PACKAGE_CDN)) {
    if (importPath === pkg || importPath.startsWith(pkg + '/')) {
      const sub = importPath.slice(pkg.length).replace(/^\//, '')
      return { virtualPath: importPath, fetchUrl: `${cdnBase}/${sub}` }
    }
  }

  // 2. Relative import: ./IERC20.sol  ../utils/Context.sol
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    // Compute virtual path relative to fromVirtualPath's directory
    const fromDir = fromVirtualPath.includes('/')
      ? fromVirtualPath.split('/').slice(0, -1)
      : []
    const parts = [...fromDir, ...importPath.split('/')]
    const resolved = []
    for (const part of parts) {
      if (part === '' || part === '.') continue
      if (part === '..') { if (resolved.length) resolved.pop() }
      else resolved.push(part)
    }
    const virtualPath = resolved.join('/')

    // Determine fetch URL by matching package prefix of the resolved path
    for (const [pkg, cdnBase] of Object.entries(PACKAGE_CDN)) {
      if (virtualPath === pkg || virtualPath.startsWith(pkg + '/')) {
        const sub = virtualPath.slice(pkg.length).replace(/^\//, '')
        return { virtualPath, fetchUrl: `${cdnBase}/${sub}` }
      }
    }

    // Relative within the user's own files (no CDN needed)
    return { virtualPath, fetchUrl: null }
  }

  return null
}

// Extract all import paths from a Solidity source string
const IMPORT_RE = /^\s*import\s+(?:(?:{[^}]*}|[\w\s,*]+)\s+from\s+)?["']([^"']+)["']/gm
function extractImports(src) {
  const paths = []
  let m
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(src)) !== null) paths.push(m[1])
  return paths
}

// ── Resolve ALL transitive imports, mutating `sources` in place ─────
function resolveAllImports(sources, onProgress) {
  const queue = Object.keys(sources).slice()
  const processed = new Set()
  let fetched = 0

  while (queue.length > 0) {
    const vpath = queue.shift()
    if (processed.has(vpath)) continue
    processed.add(vpath)

    const content = sources[vpath]?.content || ''
    const imports = extractImports(content)

    for (const rawPath of imports) {
      // Already in sources (user supplied or already fetched)
      if (sources[rawPath]) {
        if (!processed.has(rawPath)) queue.push(rawPath)
        continue
      }

      const res = resolveImport(vpath, rawPath)
      if (!res) continue

      const { virtualPath, fetchUrl } = res

      // Already resolved under canonical path
      if (sources[virtualPath]) {
        // Make sure the original import key also maps to the content
        if (virtualPath !== rawPath) sources[rawPath] = sources[virtualPath]
        if (!processed.has(virtualPath)) queue.push(virtualPath)
        continue
      }

      if (fetchUrl) {
        const src = fetchSync(fetchUrl)
        if (src) {
          fetched++
          sources[virtualPath] = { content: src }
          // Also register under the raw import path so solc finds it
          if (virtualPath !== rawPath) sources[rawPath] = { content: src }
          queue.push(virtualPath)
          if (onProgress) onProgress(fetched, rawPath)
        } else {
          // Leave it missing — solc will emit a proper "not found" error
          if (onProgress) onProgress(fetched, `⚠ ${rawPath} (not found)`)
        }
      }
    }
  }
}

// ── solc loader ─────────────────────────────────────────────────────
let solcVersion = null
let loadedModule = null
const pendingCallbacks = []

function loadVersion(version, callback) {
  if (solcVersion === version && loadedModule) { callback(null, loadedModule); return }

  pendingCallbacks.push(callback)
  if (pendingCallbacks.length > 1) return // already loading

  loadedModule = null
  solcVersion = version

  const prev = self.Module || {}
  self.Module = Object.assign(prev, {
    onRuntimeInitialized() {
      loadedModule = self.Module
      const cbs = pendingCallbacks.splice(0)
      cbs.forEach(cb => cb(null, loadedModule))
    },
  })

  try {
    importScripts(`https://binaries.soliditylang.org/bin/soljson-${version}.js`)
    // Sync build already initialised
    if (loadedModule === null && self.Module && typeof self.Module.cwrap === 'function') {
      loadedModule = self.Module
      const cbs = pendingCallbacks.splice(0)
      cbs.forEach(cb => cb(null, loadedModule))
    }
  } catch (err) {
    const cbs = pendingCallbacks.splice(0)
    cbs.forEach(cb => cb(String(err)))
  }
}

function callSolc(module, inputJSON) {
  const fn = module.cwrap('solidity_compile', 'string', ['string', 'number'])
  return JSON.parse(fn(inputJSON, 0))
}

// ── Message handler ─────────────────────────────────────────────────
self.addEventListener('message', function (e) {
  const { id, action, data } = e.data

  if (action === 'version') {
    loadVersion(data.version, (err) => {
      self.postMessage({ id, action: 'version', err })
    })
    return
  }

  if (action === 'compile') {
    loadVersion(data.version, (err, module) => {
      if (err) { self.postMessage({ id, action: 'compile', err: String(err) }); return }

      // Build sources map starting from user-supplied files
      const sources = {}
      for (const [name, content] of Object.entries(data.sources)) {
        sources[name] = { content }
      }

      // Fetch all transitive imports (blocking XHR — valid in workers)
      self.postMessage({ id, action: 'progress', msg: 'Resolving imports…' })
      resolveAllImports(sources, (n, path) => {
        self.postMessage({ id, action: 'progress', msg: `Fetched (${n}): ${path}` })
      })

      const input = {
        language: 'Solidity',
        sources,
        settings: {
          outputSelection: {
            '*': {
              '*': ['abi', 'evm.bytecode', 'evm.bytecode.object',
                    'evm.deployedBytecode', 'evm.gasEstimates', 'metadata'],
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
