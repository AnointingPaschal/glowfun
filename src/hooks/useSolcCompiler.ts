import { useState, useRef, useCallback, useEffect } from 'react'

export interface CompileError {
  severity: 'error' | 'warning'
  formattedMessage: string
  sourceLocation?: { start: number; end: number; file: string }
  errorCode?: string
}

export interface ContractOutput {
  contractName: string
  fileName: string
  abi: any[]
  bytecode: string
  deployedBytecode: string
  gasEstimates?: any
  metadata?: string
}

export interface CompileResult {
  errors: CompileError[]
  contracts: ContractOutput[]
  success: boolean
}

export const SOLC_VERSIONS: Record<string, string> = {
  '0.8.26': 'v0.8.26+commit.8a97fa7a',
  '0.8.25': 'v0.8.25+commit.b61c2a91',
  '0.8.24': 'v0.8.24+commit.e11b9ed9',
  '0.8.20': 'v0.8.20+commit.a1b79de6',
  '0.8.19': 'v0.8.19+commit.7dd6d404',
  '0.8.17': 'v0.8.17+commit.8df45f5f',
  '0.8.4':  'v0.8.4+commit.c7e474f2',
}

let msgId = 0
const pendingMap = new Map<number, (data: any) => void>()
const progressListeners = new Map<number, (msg: string) => void>()

export function useSolcCompiler(onProgress?: (msg: string) => void) {
  const workerRef = useRef<Worker | null>(null)
  const [compiling, setCompiling] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const progressRef = useRef(onProgress)
  progressRef.current = onProgress

  useEffect(() => {
    const worker = new Worker('/workers/solc.worker.js')
    worker.onmessage = (e) => {
      const { id, action, ...rest } = e.data

      // Progress messages (import fetching updates)
      if (action === 'progress') {
        const listener = progressListeners.get(id)
        if (listener) listener(rest.msg)
        return
      }

      const cb = pendingMap.get(id)
      if (cb) { pendingMap.delete(id); progressListeners.delete(id); cb(rest) }
    }
    worker.onerror = (e) => {
      console.error('Solc worker error', e)
      setError('Compiler worker error: ' + e.message)
    }
    workerRef.current = worker
    return () => { worker.terminate() }
  }, [])

  const send = useCallback((action: string, data: object, onProg?: (m: string) => void): Promise<any> => {
    return new Promise((resolve) => {
      const id = ++msgId
      pendingMap.set(id, resolve)
      if (onProg) progressListeners.set(id, onProg)
      workerRef.current?.postMessage({ id, action, data })
    })
  }, [])

  const preloadVersion = useCallback(async (version: string) => {
    setLoading(true)
    const build = SOLC_VERSIONS[version]
    if (!build) { setLoading(false); return }
    await send('version', { version: build })
    setLoading(false)
  }, [send])

  const compile = useCallback(async (
    sources: Record<string, string>,
    version = '0.8.26',
    opts: { optimize?: boolean; runs?: number; evmVersion?: string } = {}
  ): Promise<CompileResult> => {
    setCompiling(true)
    setError(null)

    const build = SOLC_VERSIONS[version] ?? SOLC_VERSIONS['0.8.26']
    const result = await send('compile', {
      version: build,
      sources,
      optimize: opts.optimize ?? true,
      runs: opts.runs ?? 200,
      evmVersion: opts.evmVersion ?? 'paris',
    }, (msg) => {
      progressRef.current?.(msg)
    })

    setCompiling(false)

    if (result.err) {
      setError(result.err)
      return { errors: [{ severity: 'error', formattedMessage: result.err }], contracts: [], success: false }
    }

    const output = result.output
    const errors: CompileError[] = (output.errors ?? []).map((e: any) => ({
      severity: e.severity,
      formattedMessage: e.formattedMessage,
      sourceLocation: e.sourceLocation,
      errorCode: e.errorCode,
    }))

    const contracts: ContractOutput[] = []
    for (const [fileName, fileContracts] of Object.entries(output.contracts ?? {})) {
      for (const [contractName, contractData] of Object.entries(fileContracts as Record<string, any>)) {
        contracts.push({
          contractName,
          fileName,
          abi: contractData.abi ?? [],
          bytecode: contractData.evm?.bytecode?.object ?? '',
          deployedBytecode: contractData.evm?.deployedBytecode?.object ?? '',
          gasEstimates: contractData.evm?.gasEstimates,
          metadata: contractData.metadata,
        })
      }
    }

    const hasErrors = errors.some(e => e.severity === 'error')
    return { errors, contracts, success: !hasErrors }
  }, [send])

  return { compile, preloadVersion, compiling, loading, error }
}
