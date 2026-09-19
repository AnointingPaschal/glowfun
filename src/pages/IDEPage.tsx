import { useState, useRef, useCallback, useEffect, Component, ReactNode, ErrorInfo } from 'react'
import Editor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useWaitForTransactionReceipt, usePublicClient, useSendTransaction, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { encodeDeployData, isAddress } from 'viem'
import { toast } from 'sonner'
import {
  Code2, Play, Rocket, ChevronRight, ChevronDown, AlertTriangle, CheckCircle2,
  FileCode2, Loader2, Plus, Trash2, Copy, Check, X, Terminal,
  Package, Zap, ExternalLink, BookOpen, FolderOpen, ChevronLeft,
  RotateCcw, Download,
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { useSolcCompiler, SOLC_VERSIONS, CompileResult, ContractOutput } from '@/hooks/useSolcCompiler'
import { CHAIN_ID, EXPLORER_BASE } from '@/constants'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

/* ── Error Boundary ──────────────────────────────────────────────── */
class IDEErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('[IDE Error]', e, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ color: 'rgba(255,255,255,0.5)' }}>
          <AlertTriangle size={32} style={{ color: '#f87171' }} />
          <div className="text-center">
            <div className="text-white font-semibold mb-1">IDE encountered an error</div>
            <div className="text-xs font-mono max-w-md" style={{ color: '#f87171' }}>{this.state.error}</div>
          </div>
          <button onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white"
            style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ── Solidity language + theme ───────────────────────────────────── */
function registerSolidity(monaco: Monaco) {
  try {
    if (!monaco.languages.getLanguages().find(l => l.id === 'solidity')) {
      monaco.languages.register({ id: 'solidity' })
    }
    monaco.languages.setMonarchTokensProvider('solidity', {
      keywords: ['pragma','import','contract','interface','library','abstract','is','using',
        'function','modifier','event','error','struct','enum','mapping','returns','return',
        'if','else','while','for','do','break','continue','emit','new','delete','this','super',
        'assembly','public','private','internal','external','pure','view','payable','override',
        'virtual','immutable','constant','memory','storage','calldata','indexed','anonymous',
        'constructor','fallback','receive','try','catch','revert','require','assert','selfdestruct'],
      typeKeywords: ['uint','uint8','uint16','uint32','uint64','uint128','uint256',
        'int','int8','int16','int32','int64','int128','int256',
        'address','bool','string','bytes','bytes1','bytes2','bytes4','bytes8','bytes16','bytes32'],
      builtins: ['msg','block','tx','abi','keccak256','sha256','ecrecover','gasleft','addmod','mulmod'],
      tokenizer: {
        root: [
          [/[a-zA-Z_$][\w$]*/, { cases: { '@keywords': 'keyword', '@typeKeywords': 'type', '@builtins': 'predefined', '@default': 'identifier' } }],
          { include: '@whitespace' },
          [/[{}()\[\]]/, '@brackets'],
          [/[;,.]/, 'delimiter'],
          [/0x[0-9a-fA-F]+/, 'number.hex'],
          [/\d+(\.\d+)?/, 'number'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"/, { token: 'string.quote', next: '@string' }],
          [/'[^']*'/, 'string'],
        ],
        comment: [[/[^\/*]+/, 'comment'], [/\/\*/, 'comment', '@push'], [/\*\//, 'comment', '@pop'], [/[\/*]/, 'comment']],
        whitespace: [[/[ \t\r\n]+/, ''], [/\/\*/, 'comment', '@comment'], [/\/\/.*$/, 'comment']],
        string: [[/[^\\"]+/, 'string'], [/\\./, 'string.escape'], [/"/, { token: 'string.quote', next: '@pop' }]],
      },
    } as any)
    monaco.editor.defineTheme('glowfun-dark', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c084fc', fontStyle: 'bold' },
        { token: 'type', foreground: '60a5fa' },
        { token: 'predefined', foreground: 'f472b6' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'number.hex', foreground: 'fbbf24' },
        { token: 'string', foreground: '34d399' },
        { token: 'string.quote', foreground: '34d399' },
        { token: 'comment', foreground: '4b5563', fontStyle: 'italic' },
        { token: 'identifier', foreground: 'e5e7eb' },
        { token: 'delimiter', foreground: '6b7280' },
      ],
      colors: {
        'editor.background': '#0a0a14',
        'editor.foreground': '#e5e7eb',
        'editorLineNumber.foreground': '#2d2d3a',
        'editorLineNumber.activeForeground': '#6b7280',
        'editor.selectionBackground': '#8b5cf620',
        'editor.lineHighlightBackground': '#ffffff08',
        'editorCursor.foreground': '#8b5cf6',
        'editor.wordHighlightBackground': '#8b5cf610',
        'editorIndentGuide.background1': '#1f2937',
        'editorBracketMatch.background': '#8b5cf620',
        'editorBracketMatch.border': '#8b5cf6',
      },
    })
  } catch (e) {
    console.warn('[IDE] Language registration warning:', e)
  }
}

/* ── Templates ───────────────────────────────────────────────────── */
const TEMPLATES: Record<string, { label: string; icon: string; source: string }> = {
  blank: { label: 'Blank', icon: '📄', source: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.26;\n\ncontract MyContract {\n    address public owner;\n\n    constructor() {\n        owner = msg.sender;\n    }\n}\n` },
  erc20: { label: 'ERC-20 Token', icon: '🪙', source: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.26;\n\ncontract ERC20Token {\n    string public name;\n    string public symbol;\n    uint8 public decimals = 18;\n    uint256 public totalSupply;\n    address public owner;\n\n    mapping(address => uint256) public balanceOf;\n    mapping(address => mapping(address => uint256)) public allowance;\n\n    event Transfer(address indexed from, address indexed to, uint256 value);\n    event Approval(address indexed owner, address indexed spender, uint256 value);\n\n    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }\n\n    constructor(string memory _name, string memory _symbol, uint256 _supply) {\n        name = _name; symbol = _symbol; owner = msg.sender;\n        totalSupply = _supply * 10 ** decimals;\n        balanceOf[msg.sender] = totalSupply;\n        emit Transfer(address(0), msg.sender, totalSupply);\n    }\n\n    function transfer(address to, uint256 amount) external returns (bool) {\n        require(balanceOf[msg.sender] >= amount, "Insufficient balance");\n        balanceOf[msg.sender] -= amount;\n        balanceOf[to] += amount;\n        emit Transfer(msg.sender, to, amount);\n        return true;\n    }\n\n    function approve(address spender, uint256 amount) external returns (bool) {\n        allowance[msg.sender][spender] = amount;\n        emit Approval(msg.sender, spender, amount);\n        return true;\n    }\n\n    function transferFrom(address from, address to, uint256 amount) external returns (bool) {\n        allowance[from][msg.sender] -= amount;\n        balanceOf[from] -= amount;\n        balanceOf[to] += amount;\n        emit Transfer(from, to, amount);\n        return true;\n    }\n\n    function mint(address to, uint256 amount) external onlyOwner {\n        totalSupply += amount; balanceOf[to] += amount;\n        emit Transfer(address(0), to, amount);\n    }\n}\n` },
  storage: { label: 'Simple Storage', icon: '💾', source: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.26;\n\ncontract SimpleStorage {\n    uint256 private value;\n    address public owner;\n    event ValueChanged(uint256 oldVal, uint256 newVal);\n\n    constructor(uint256 _init) { owner = msg.sender; value = _init; }\n\n    function set(uint256 _v) external {\n        require(msg.sender == owner, "Not owner");\n        emit ValueChanged(value, _v);\n        value = _v;\n    }\n\n    function get() external view returns (uint256) { return value; }\n}\n` },
  multisig: { label: 'Multisig Wallet', icon: '🔐', source: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.26;\n\ncontract MultiSig {\n    address[] public owners;\n    uint256 public required;\n    mapping(address => bool) public isOwner;\n\n    struct Tx { address to; uint256 value; bytes data; bool executed; uint256 confirms; }\n    Tx[] public transactions;\n    mapping(uint256 => mapping(address => bool)) public confirmed;\n\n    modifier onlyOwner() { require(isOwner[msg.sender], "Not owner"); _; }\n\n    constructor(address[] memory _owners, uint256 _req) {\n        for (uint i; i < _owners.length; i++) { isOwner[_owners[i]] = true; owners.push(_owners[i]); }\n        required = _req;\n    }\n\n    receive() external payable {}\n\n    function submit(address to, uint256 val, bytes calldata data) external onlyOwner {\n        transactions.push(Tx(to, val, data, false, 0));\n    }\n\n    function confirm(uint256 i) external onlyOwner {\n        require(!confirmed[i][msg.sender], "Already confirmed");\n        confirmed[i][msg.sender] = true;\n        transactions[i].confirms++;\n    }\n\n    function execute(uint256 i) external onlyOwner {\n        Tx storage t = transactions[i];\n        require(t.confirms >= required && !t.executed);\n        t.executed = true;\n        (bool ok,) = t.to.call{value: t.value}(t.data);\n        require(ok, "Failed");\n    }\n}\n` },
  nft: { label: 'ERC-721 NFT', icon: '🖼️', source: `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.26;\n\ncontract SimpleNFT {\n    string public name;\n    string public symbol;\n    uint256 public totalSupply;\n    uint256 public maxSupply;\n    uint256 public mintPrice;\n    address public owner;\n\n    mapping(uint256 => address) public ownerOf;\n    mapping(address => uint256) public balanceOf;\n    mapping(uint256 => string) private _uris;\n\n    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);\n\n    constructor(string memory _name, string memory _sym, uint256 _max, uint256 _price) {\n        name = _name; symbol = _sym; maxSupply = _max; mintPrice = _price; owner = msg.sender;\n    }\n\n    function mint(string memory uri) external payable {\n        require(totalSupply < maxSupply, "Sold out");\n        require(msg.value >= mintPrice, "Underpaid");\n        uint256 id = ++totalSupply;\n        ownerOf[id] = msg.sender;\n        balanceOf[msg.sender]++;\n        _uris[id] = uri;\n        emit Transfer(address(0), msg.sender, id);\n    }\n\n    function tokenURI(uint256 id) external view returns (string memory) {\n        require(ownerOf[id] != address(0), "Nonexistent"); return _uris[id];\n    }\n\n    function withdraw() external {\n        require(msg.sender == owner); (bool ok,) = owner.call{value: address(this).balance}(""); require(ok);\n    }\n}\n` },
}

/* ── Types ───────────────────────────────────────────────────────── */
interface File { name: string; content: string }
interface DeployedContract { name: string; address: string; abi: any[]; txHash: string }
interface AbiInput { name: string; type: string; value: string }

/* ── Contract Interaction ────────────────────────────────────────── */
function ContractInteraction({ deployed, onClose }: { deployed: DeployedContract; onClose: () => void }) {
  const { writeContract } = useWriteContract()
  const publicClient = usePublicClient()
  const [selectedFn, setSelectedFn] = useState<any>(null)
  const [fnArgs, setFnArgs] = useState<AbiInput[]>([])
  const [ethValue, setEthValue] = useState('')
  const [readResult, setReadResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const functions = deployed.abi.filter(x => x.type === 'function')
  const isRead = selectedFn && ['view', 'pure'].includes(selectedFn.stateMutability)

  const selectFn = (fn: any) => {
    setSelectedFn(fn); setFnArgs(fn.inputs?.map((i: any) => ({ ...i, value: '' })) ?? []); setReadResult(null)
  }

  const parseArg = (val: string, type: string): any => {
    if (type.startsWith('uint') || type.startsWith('int')) return BigInt(val || '0')
    if (type === 'bool') return val === 'true'
    if (type.endsWith('[]')) { try { return JSON.parse(val) } catch { return [] } }
    return val
  }

  const callRead = async () => {
    if (!selectedFn || !publicClient) return
    try {
      const args = fnArgs.map(a => parseArg(a.value, a.type))
      const result = await (publicClient as any).readContract({ address: deployed.address as `0x${string}`, abi: deployed.abi, functionName: selectedFn.name, args })
      setReadResult(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
    } catch (e: any) { setReadResult(`Error: ${e.message}`) }
  }

  const callWrite = () => {
    if (!selectedFn) return
    const args = fnArgs.map(a => parseArg(a.value, a.type))
    writeContract({ address: deployed.address as `0x${string}`, abi: deployed.abi, functionName: selectedFn.name, args, value: ethValue ? BigInt(Math.floor(parseFloat(ethValue) * 1e18)) : undefined } as any, {
      onSuccess: () => toast.success(`${selectedFn.name} submitted!`),
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-white">{deployed.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>{deployed.address.slice(0,10)}…</span>
            <button onClick={() => { navigator.clipboard.writeText(deployed.address); setCopied(true); setTimeout(() => setCopied(false),1500) }}>
              {copied ? <Check size={10} style={{ color: '#34d399' }} /> : <Copy size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />}
            </button>
            <a href={`${EXPLORER_BASE}/address/${deployed.address}`} target="_blank" rel="noopener"><ExternalLink size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /></a>
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.3)' }}><X size={14} /></button>
      </div>

      {/* Functions list */}
      {['view/pure', 'write'].map(group => {
        const fns = group === 'view/pure'
          ? functions.filter(f => ['view','pure'].includes(f.stateMutability))
          : functions.filter(f => !['view','pure'].includes(f.stateMutability))
        if (fns.length === 0) return null
        return (
          <div key={group}>
            <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>{group === 'view/pure' ? 'Read' : 'Write'}</div>
            <div className="space-y-0.5">
              {fns.map((fn: any) => (
                <button key={fn.name} onClick={() => selectFn(fn)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] text-left"
                  style={{ background: selectedFn?.name === fn.name ? (group === 'view/pure' ? 'rgba(96,165,250,0.12)' : 'rgba(139,92,246,0.12)') : 'rgba(255,255,255,0.03)', color: selectedFn?.name === fn.name ? (group === 'view/pure' ? '#60a5fa' : '#c084fc') : 'rgba(255,255,255,0.55)', border: `1px solid ${selectedFn?.name === fn.name ? (group === 'view/pure' ? 'rgba(96,165,250,0.2)' : 'rgba(139,92,246,0.2)') : 'rgba(255,255,255,0.04)'}` }}>
                  {group === 'view/pure' ? <BookOpen size={9} /> : <Zap size={9} />}{fn.name}
                  {fn.stateMutability === 'payable' && <span className="ml-auto text-[8px]" style={{ color: '#fbbf24' }}>payable</span>}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {/* Args */}
      {selectedFn && (
        <div className="space-y-1.5 pt-1.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {fnArgs.map((arg, i) => (
            <div key={i}>
              <div className="text-[9px] mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{arg.name} ({arg.type})</div>
              <input value={arg.value} onChange={e => { const n=[...fnArgs]; n[i]={...n[i],value:e.target.value}; setFnArgs(n) }}
                placeholder={arg.type} className="w-full px-2 py-1.5 rounded-lg text-[10px] text-white bg-transparent outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
            </div>
          ))}
          {selectedFn.stateMutability === 'payable' && (
            <div>
              <div className="text-[9px] mb-0.5" style={{ color: '#fbbf24' }}>ETH value</div>
              <input value={ethValue} onChange={e => setEthValue(e.target.value)} placeholder="0.0"
                className="w-full px-2 py-1.5 rounded-lg text-[10px] text-white bg-transparent outline-none"
                style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.1)' }} />
            </div>
          )}
          <button onClick={isRead ? callRead : callWrite}
            className="w-full py-1.5 rounded-lg text-[10px] font-semibold text-white flex items-center justify-center gap-1"
            style={{ background: isRead ? 'rgba(96,165,250,0.15)' : 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
            {isRead ? <><BookOpen size={10} />Read</> : <><Zap size={10} />Transact</>}
          </button>
          {readResult && <div className="p-2 rounded-lg text-[9px] font-mono break-all whitespace-pre-wrap" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.1)', color: '#93c5fd' }}>{readResult}</div>}
        </div>
      )}
    </div>
  )
}

/* ── Deploy Panel ────────────────────────────────────────────────── */
function DeployPanel({ contracts, onDeployed, onBack }: { contracts: ContractOutput[]; onDeployed: (c: DeployedContract) => void; onBack: () => void }) {
  const { address: wallet } = useAccount()
  const [selected, setSelected] = useState(contracts[0]?.contractName ?? '')
  const [args, setArgs] = useState<AbiInput[]>([])
  const [ethValue, setEthValue] = useState('')
  const { sendTransaction, data: deployHash, isPending } = useSendTransaction()
  const { isLoading: confirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: deployHash })

  const contract = contracts.find(c => c.contractName === selected)

  useEffect(() => {
    if (!contract) return
    const ctr = contract.abi.find((x: any) => x.type === 'constructor')
    setArgs(ctr?.inputs?.map((i: any) => ({ ...i, value: '' })) ?? [])
  }, [selected])

  useEffect(() => {
    if (isSuccess && receipt?.contractAddress && contract) {
      onDeployed({ name: contract.contractName, address: receipt.contractAddress, abi: contract.abi, txHash: deployHash ?? '' })
      toast.success(`${contract.contractName} deployed!`)
    }
  }, [isSuccess, receipt])

  const parseArg = (val: string, type: string): any => {
    if (type.startsWith('uint') || type.startsWith('int')) return BigInt(val || '0')
    if (type === 'bool') return val === 'true'
    if (type.endsWith('[]')) { try { return JSON.parse(val) } catch { return [] } }
    return val
  }

  const deploy = () => {
    if (!contract || !wallet) return
    const calldata = encodeDeployData({ abi: contract.abi, bytecode: `0x${contract.bytecode}` as `0x${string}`, args: args.map(a => parseArg(a.value, a.type)) })
    sendTransaction({ data: calldata, chainId: CHAIN_ID as any, value: ethValue ? BigInt(Math.floor(parseFloat(ethValue) * 1e18)) : 0n } as any, {
      onError: (e: any) => toast.error(e.shortMessage ?? e.message),
    })
  }

  const busy = isPending || confirming

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} style={{ color: 'rgba(255,255,255,0.4)' }}><ChevronLeft size={14} /></button>
        <span className="text-xs font-semibold text-white">Deploy to Arc Mainnet</span>
      </div>
      <div className="space-y-1">
        {contracts.map(c => (
          <button key={c.contractName} onClick={() => setSelected(c.contractName)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] text-left"
            style={{ background: selected === c.contractName ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)', color: selected === c.contractName ? '#c084fc' : 'rgba(255,255,255,0.6)', border: `1px solid ${selected === c.contractName ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
            <Package size={10} />{c.contractName}
            <span className="ml-auto text-[8px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{(c.bytecode.length/2/1000).toFixed(1)}KB</span>
          </button>
        ))}
      </div>
      {args.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Constructor Args</div>
          {args.map((arg, i) => (
            <div key={i}>
              <div className="text-[9px] mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{arg.name} ({arg.type})</div>
              <input value={arg.value} onChange={e => { const n=[...args]; n[i]={...n[i],value:e.target.value}; setArgs(n) }}
                placeholder={arg.type} className="w-full px-2 py-1.5 rounded-lg text-[10px] text-white bg-transparent outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
            </div>
          ))}
        </div>
      )}
      {!wallet ? (
        <div className="text-center"><ConnectKitButton /></div>
      ) : (
        <button onClick={deploy} disabled={busy || !contract?.bytecode}
          className="w-full py-2.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', boxShadow: '0 4px 16px rgba(139,92,246,0.25)' }}>
          {busy ? <><Loader2 size={12} className="animate-spin" />{confirming ? 'Confirming…' : 'Deploying…'}</> : <><Rocket size={12} />Deploy</>}
        </button>
      )}
      {deployHash && (
        <a href={`${EXPLORER_BASE}/tx/${deployHash}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[9px]" style={{ color: '#a78bfa' }}>
          <ExternalLink size={9} />View transaction
        </a>
      )}
    </div>
  )
}

/* ── Main IDE ────────────────────────────────────────────────────── */
function IDEInner() {
  const [files, setFiles] = useState<File[]>([{ name: 'Contract.sol', content: TEMPLATES.blank.source }])
  const [activeFile, setActiveFile] = useState('Contract.sol')
  const [sidebarTab, setSidebarTab] = useState<'files' | 'templates'>('files')
  const [rightTab, setRightTab] = useState<'output' | 'deploy' | 'interact'>('output')
  const [solcVersion, setSolcVersion] = useState('0.8.26')
  const [optimize, setOptimize] = useState(true)
  const [evmVersion, setEvmVersion] = useState('paris')
  const [result, setResult] = useState<CompileResult | null>(null)
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([])
  const [selectedDeployed, setSelectedDeployed] = useState<DeployedContract | null>(null)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(false)
  const [mobileSheet, setMobileSheet] = useState(false)
  const [logs, setLogs] = useState(['GlowFun Solidity IDE ready. Bundled Monaco — no CDN required.'])
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const [editorHeight, setEditorHeight] = useState(500)
  const { compile, compiling } = useSolcCompiler()

  // On mobile: close panels by default so editor has full width
  useEffect(() => {
    if (window.innerWidth < 768) { setLeftOpen(false); setRightOpen(false) }
  }, [])

  const log = (msg: string) => setLogs(p => [...p.slice(-99), msg])
  const current = files.find(f => f.name === activeFile)

  // Measure editor container so Monaco always gets an explicit pixel height
  useEffect(() => {
    const el = editorAreaRef.current
    if (!el) return
    const update = () => { if (el.offsetHeight > 50) setEditorHeight(el.offsetHeight) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleMount = useCallback((ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = ed
    try { registerSolidity(monaco) } catch (e) { console.warn('[IDE] Solidity lang setup failed', e) }
    try { monaco.editor.setTheme('glowfun-dark') } catch {}
  }, [])

  const handleChange = useCallback((val: string | undefined) => {
    if (val === undefined) return
    setFiles(p => p.map(f => f.name === activeFile ? { ...f, content: val } : f))
  }, [activeFile])

  const handleCompile = async () => {
    if (!current) return
    log(`[${new Date().toLocaleTimeString()}] Compiling ${activeFile} with solc ${solcVersion}…`)
    const sources: Record<string, string> = {}
    files.forEach(f => { sources[f.name] = f.content })
    const res = await compile(sources, solcVersion, { optimize, evmVersion })
    setResult(res)
    if (res.success) {
      log(`✓ Compiled OK — ${res.contracts.length} contract(s)`)
      res.contracts.forEach(c => log(`  • ${c.contractName} ${(c.bytecode.length/2/1000).toFixed(1)}KB`))
      setRightTab('deploy')
      setRightOpen(true)           // always open right panel on desktop
      setMobileSheet(true)         // always open sheet on mobile
    } else {
      const errs = res.errors.filter(e => e.severity === 'error')
      log(`✗ ${errs.length} error(s)`)
      setRightTab('output')
      setRightOpen(true)
      setMobileSheet(true)
    }
  }

  const addFile = () => {
    const name = `Contract${files.length + 1}.sol`
    setFiles(p => [...p, { name, content: TEMPLATES.blank.source }])
    setActiveFile(name)
  }

  const deleteFile = (name: string) => {
    if (files.length === 1) return
    const rest = files.filter(f => f.name !== name)
    setFiles(rest)
    if (activeFile === name) setActiveFile(rest[0].name)
  }

  const loadTemplate = (key: string) => {
    const tpl = TEMPLATES[key]
    const name = `${key.charAt(0).toUpperCase() + key.slice(1)}.sol`
    if (!files.find(f => f.name === name)) setFiles(p => [...p, { name, content: tpl.source }])
    else setFiles(p => p.map(f => f.name === name ? { ...f, content: tpl.source } : f))
    setActiveFile(name); setResult(null); setSidebarTab('files')
    log(`Loaded template: ${tpl.label}`)
  }

  const errors = result?.errors.filter(e => e.severity === 'error') ?? []
  const warnings = result?.errors.filter(e => e.severity === 'warning') ?? []

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* ── Topbar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2"
        style={{ background: 'rgba(10,10,20,0.95)', borderBottom: '1px solid rgba(255,255,255,0.06)', height: 44 }}>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
            <Code2 size={11} className="text-white" />
          </div>
          <span className="text-xs font-bold text-white hidden sm:inline" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Solidity IDE</span>
          <div className="h-3 w-px mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Arc Mainnet</span>
        </div>
        <div className="flex items-center gap-2">
          <select value={solcVersion} onChange={e => setSolcVersion(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-lg text-white outline-none border" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
            {Object.keys(SOLC_VERSIONS).map(v => <option key={v} value={v} style={{ background: '#0a0a14' }}>solc {v}</option>)}
          </select>
          <select value={evmVersion} onChange={e => setEvmVersion(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-lg text-white outline-none border hidden sm:block" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
            {['paris','shanghai','cancun','london','berlin'].map(v => <option key={v} value={v} style={{ background: '#0a0a14' }}>{v}</option>)}
          </select>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <div onClick={() => setOptimize(v => !v)} className="w-7 h-4 rounded-full relative cursor-pointer"
              style={{ background: optimize ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)' }}>
              <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all" style={{ left: optimize ? 14 : 2 }} />
            </div>
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>opt</span>
          </label>
          <button onClick={() => { if (current) { const b=new Blob([current.content],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=current.name;a.click() } }}
            className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Download size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>
          <motion.button onClick={handleCompile} disabled={compiling} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
            {compiling ? <><Loader2 size={11} className="animate-spin" />Compiling…</> : <><Play size={11} />Compile</>}
          </motion.button>
        </div>
      </div>

      {/* ── Main 3-panel area ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left sidebar */}
        {leftOpen && (
          <div style={{ width: 188, flexShrink: 0, background: 'rgba(8,8,16,0.9)', borderRight: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="flex flex-shrink-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {([{ id:'files', icon:FolderOpen }, { id:'templates', icon:BookOpen }] as const).map(t => (
                <button key={t.id} onClick={() => setSidebarTab(t.id)}
                  className="flex-1 flex items-center justify-center py-2 text-[9px] font-medium gap-1 uppercase tracking-widest transition-all"
                  style={{ borderBottom: sidebarTab===t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: sidebarTab===t.id ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}>
                  <t.icon size={10} />{t.id}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {sidebarTab === 'files' ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>Files</span>
                    <button onClick={addFile} style={{ color: 'rgba(255,255,255,0.4)' }}><Plus size={11} /></button>
                  </div>
                  {files.map(f => (
                    <div key={f.name} onClick={() => setActiveFile(f.name)} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group mb-0.5"
                      style={{ background: activeFile===f.name ? 'rgba(139,92,246,0.12)' : 'transparent' }}>
                      <FileCode2 size={9} style={{ color: activeFile===f.name ? '#a78bfa' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                      <span className="text-[10px] flex-1 truncate" style={{ color: activeFile===f.name ? '#a78bfa' : 'rgba(255,255,255,0.5)' }}>{f.name}</span>
                      {files.length > 1 && <button onClick={e => { e.stopPropagation(); deleteFile(f.name) }} className="opacity-0 group-hover:opacity-100" style={{ color: 'rgba(248,113,113,0.6)' }}><Trash2 size={9} /></button>}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Templates</div>
                  {Object.entries(TEMPLATES).map(([k, t]) => (
                    <button key={k} onClick={() => loadTemplate(k)} className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[10px] text-left mb-0.5 transition-all hover:bg-white/5"
                      style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <span>{t.icon}</span>{t.label}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Left toggle */}
        <button onClick={() => setLeftOpen(v => !v)} className="flex-shrink-0 flex items-center justify-center w-3 hover:bg-white/5 transition-all"
          style={{ background: 'rgba(8,8,16,0.7)', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          {leftOpen ? <ChevronLeft size={9} style={{ color: 'rgba(255,255,255,0.2)' }} /> : <ChevronRight size={9} style={{ color: 'rgba(255,255,255,0.2)' }} />}
        </button>

        {/* Center: editor + console */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* File tabs */}
          <div className="flex-shrink-0 flex overflow-x-auto" style={{ background: 'rgba(8,8,16,0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {files.map(f => (
              <button key={f.name} onClick={() => setActiveFile(f.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] whitespace-nowrap flex-shrink-0 border-r transition-all"
                style={{ borderColor: 'rgba(255,255,255,0.05)', background: activeFile===f.name ? 'rgba(139,92,246,0.08)' : 'transparent', borderBottom: activeFile===f.name ? '2px solid #8b5cf6' : '2px solid transparent', color: activeFile===f.name ? '#a78bfa' : 'rgba(255,255,255,0.4)' }}>
                <FileCode2 size={9} />{f.name}
              </button>
            ))}
          </div>

          {/* Monaco Editor */}
          <div ref={editorAreaRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {editorHeight < 80 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a14', zIndex: 5 }}>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Measuring editor area… ({editorHeight}px)</div>
              </div>
            )}
            <Editor
              key={activeFile}
              height={editorHeight}
              language="solidity"
              theme="glowfun-dark"
              value={current?.content ?? ''}
              onChange={handleChange}
              onMount={handleMount}
              loading={
                <div className="flex items-center justify-center h-full" style={{ background: '#0a0a14' }}>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <Loader2 size={14} className="animate-spin" />Loading editor…
                  </div>
                </div>
              }
              options={{
                fontSize: 13,
                fontFamily: '"Fira Code","JetBrains Mono","Cascadia Code",monospace',
                fontLigatures: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 4,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'line',
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                bracketPairColorization: { enabled: true },
              }}
            />
          </div>

          {/* Console */}
          <div className="flex-shrink-0" style={{ height: 90, background: 'rgba(4,4,8,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', overflowY: 'auto' }}>
            <div className="sticky top-0 flex items-center gap-2 px-3 py-1" style={{ background: 'rgba(4,4,8,0.95)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <Terminal size={9} style={{ color: 'rgba(255,255,255,0.25)' }} />
              <span className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>Console</span>
              <button onClick={() => setLogs([])} className="ml-auto" style={{ color: 'rgba(255,255,255,0.2)' }}><RotateCcw size={9} /></button>
            </div>
            <div className="px-3 py-1">
              {logs.map((line, i) => (
                <div key={i} className="text-[9px] font-mono py-px"
                  style={{ color: line.startsWith('✗')||line.includes('error') ? '#f87171' : line.startsWith('✓') ? '#34d399' : 'rgba(255,255,255,0.45)' }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right toggle */}
        <button onClick={() => setRightOpen(v => !v)} className="flex-shrink-0 flex items-center justify-center w-3 hover:bg-white/5 transition-all"
          style={{ background: 'rgba(8,8,16,0.7)', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
          {rightOpen ? <ChevronRight size={9} style={{ color: 'rgba(255,255,255,0.2)' }} /> : <ChevronLeft size={9} style={{ color: 'rgba(255,255,255,0.2)' }} />}
        </button>

        {/* Right panel */}
        {rightOpen && (
          <div style={{ width: 268, flexShrink: 0, background: 'rgba(8,8,16,0.9)', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tab bar */}
            <div className="flex-shrink-0 flex border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {([{ id:'output', icon:Terminal, label:'Output' }, { id:'deploy', icon:Rocket, label:'Deploy' }, { id:'interact', icon:Zap, label:'Interact' }] as const).map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-medium transition-all"
                  style={{ borderBottom: rightTab===t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: rightTab===t.id ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}>
                  <t.icon size={9} />{t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {/* Output tab */}
              {rightTab === 'output' && (
                <div className="space-y-3">
                  {!result ? (
                    <div className="text-center py-8">
                      <Code2 size={20} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Press Compile to see output</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl"
                        style={{ background: result.success ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${result.success ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}` }}>
                        {result.success ? <CheckCircle2 size={11} style={{ color: '#34d399' }} /> : <AlertTriangle size={11} style={{ color: '#f87171' }} />}
                        <span className="text-[10px] font-medium" style={{ color: result.success ? '#34d399' : '#f87171' }}>
                          {result.success ? `OK — ${result.contracts.length} contract(s)` : `${errors.length} error(s)`}
                        </span>
                      </div>
                      {result.errors.map((e, i) => (
                        <div key={i} className="p-2 rounded-lg text-[9px] font-mono"
                          style={{ background: e.severity==='error' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${e.severity==='error' ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)'}`, color: e.severity==='error' ? '#fca5a5' : '#fde68a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {e.formattedMessage?.slice(0, 400)}
                        </div>
                      ))}
                      {result.contracts.map(c => (
                        <div key={c.contractName} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Package size={9} style={{ color: '#a78bfa' }} />
                            <span className="text-[10px] font-semibold text-white">{c.contractName}</span>
                            <span className="ml-auto text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{(c.bytecode.length/2/1000).toFixed(1)}KB</span>
                          </div>
                          <div className="ml-3 space-y-px">
                            {c.abi.filter((x:any) => ['function','event'].includes(x.type)).slice(0,5).map((item:any) => (
                              <div key={item.name} className="text-[9px] flex gap-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                <span style={{ color: item.type==='event' ? '#fbbf24' : ['view','pure'].includes(item.stateMutability) ? '#60a5fa' : '#c084fc' }}>
                                  {item.type==='event' ? 'evt' : ['view','pure'].includes(item.stateMutability) ? 'rd' : 'fn'}
                                </span>
                                {item.name}()
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {result.success && (
                        <button onClick={() => setRightTab('deploy')} className="w-full py-2 rounded-xl text-[10px] font-semibold text-white flex items-center justify-center gap-1"
                          style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                          <Rocket size={10} />Deploy →
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Deploy tab */}
              {rightTab === 'deploy' && (
                result?.success
                  ? <DeployPanel contracts={result.contracts} onDeployed={c => { setDeployedContracts(p => [c,...p]); setSelectedDeployed(c); setRightTab('interact') }} onBack={() => setRightTab('output')} />
                  : <div className="text-center py-8">
                      <Rocket size={20} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                      <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Compile successfully first</p>
                      <button onClick={handleCompile} disabled={compiling} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-medium text-white mx-auto" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                        {compiling ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}Compile
                      </button>
                    </div>
              )}

              {/* Interact tab */}
              {rightTab === 'interact' && (
                deployedContracts.length === 0
                  ? <div className="text-center py-8"><Zap size={20} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} /><p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Deploy a contract first</p></div>
                  : <div className="space-y-2">
                      <div className="space-y-1 mb-3">
                        {deployedContracts.map((c, i) => (
                          <button key={i} onClick={() => setSelectedDeployed(c)} className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] text-left"
                            style={{ background: selectedDeployed?.address===c.address ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)', color: selectedDeployed?.address===c.address ? '#c084fc' : 'rgba(255,255,255,0.6)', border: `1px solid ${selectedDeployed?.address===c.address ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
                            <Package size={9} />{c.name}
                          </button>
                        ))}
                      </div>
                      {selectedDeployed && <ContractInteraction deployed={selectedDeployed} onClose={() => setSelectedDeployed(null)} />}
                    </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Build Bottom Sheet ── */}
      {mobileSheet && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setMobileSheet(false) }}
        >
          <div
            style={{
              background: 'rgba(10,10,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px 20px 0 0',
              maxHeight: '80dvh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
            </div>
            {/* Sheet header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {([
                  { id:'output', icon:Terminal, label:'Output' },
                  { id:'deploy', icon:Rocket, label:'Deploy' },
                  { id:'interact', icon:Zap, label:'Interact' },
                ] as const).map(t => (
                  <button key={t.id} onClick={() => setRightTab(t.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: rightTab===t.id ? 'rgba(139,92,246,0.2)' : 'transparent',
                      color: rightTab===t.id ? '#c084fc' : 'rgba(255,255,255,0.45)',
                      boxShadow: rightTab===t.id ? '0 2px 8px rgba(139,92,246,0.2)' : 'none',
                    }}>
                    <t.icon size={12} />{t.label}
                    {t.id === 'deploy' && result?.success && rightTab !== 'deploy' && (
                      <span className="w-1.5 h-1.5 rounded-full ml-1" style={{ background: '#34d399' }} />
                    )}
                  </button>
                ))}
              </div>
              <button onClick={() => setMobileSheet(false)}
                className="p-2 rounded-xl ml-2" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                <X size={14} />
              </button>
            </div>

            {/* Sheet content — same as right panel */}
            <div className="flex-1 overflow-y-auto p-4">
              {rightTab === 'output' && (
                <div className="space-y-3">
                  {!result ? (
                    <div className="text-center py-12">
                      <Code2 size={28} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Press Compile to see output</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                        style={{ background: result.success ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${result.success ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}` }}>
                        {result.success
                          ? <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                          : <AlertTriangle size={14} style={{ color: '#f87171' }} />}
                        <span className="text-xs font-medium" style={{ color: result.success ? '#34d399' : '#f87171' }}>
                          {result.success ? `${result.contracts.length} contract(s) compiled` : `${result.errors.filter(e=>e.severity==='error').length} error(s)`}
                        </span>
                      </div>
                      {result.errors.map((e, i) => (
                        <div key={i} className="p-3 rounded-xl text-[10px] font-mono leading-relaxed whitespace-pre-wrap"
                          style={{ background: e.severity==='error' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${e.severity==='error' ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)'}`, color: e.severity==='error' ? '#fca5a5' : '#fde68a' }}>
                          {e.formattedMessage}
                        </div>
                      ))}
                      {result.contracts.map(c => (
                        <div key={c.contractName} className="p-3 rounded-xl space-y-2"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div className="flex items-center gap-2">
                            <Package size={12} style={{ color: '#a78bfa' }} />
                            <span className="text-xs font-semibold text-white">{c.contractName}</span>
                            <span className="ml-auto text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{(c.bytecode.length/2/1000).toFixed(1)}KB</span>
                          </div>
                          <div className="text-[9px] space-y-0.5 ml-4">
                            {c.abi.filter((x:any)=>x.type==='function'||x.type==='event').slice(0,5).map((item:any,i:number) => (
                              <div key={i} style={{ color: 'rgba(255,255,255,0.4)' }}>
                                <span style={{ color: item.type==='event' ? '#fbbf24' : item.stateMutability==='view' ? '#60a5fa' : '#c084fc', marginRight: 4 }}>
                                  {item.type==='event' ? 'evt' : item.stateMutability==='view' ? 'rd' : 'fn'}
                                </span>
                                {item.name}({item.inputs?.map((i:any)=>i.type).join(', ')})
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {result.success && (
                        <button onClick={() => setRightTab('deploy')}
                          className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                          style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
                          <Rocket size={14} />Deploy Contract →
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {rightTab === 'deploy' && (
                result?.success
                  ? <DeployPanel
                      contracts={result.contracts}
                      onDeployed={c => { setDeployedContracts(p=>[c,...p]); setSelectedDeployed(c); setRightTab('interact') }}
                      onBack={() => setRightTab('output')}
                    />
                  : <div className="text-center py-12">
                      <Rocket size={28} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.3)' }}>Compile first to unlock deploy</p>
                      <button onClick={() => { setMobileSheet(false); handleCompile() }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white mx-auto"
                        style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                        <Play size={12} />Compile Now
                      </button>
                    </div>
              )}

              {rightTab === 'interact' && (
                deployedContracts.length === 0
                  ? <div className="text-center py-12">
                      <Zap size={28} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Deploy a contract to interact</p>
                    </div>
                  : <div className="space-y-2">
                      {deployedContracts.map((c,i) => (
                        <button key={i} onClick={() => setSelectedDeployed(c)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-left"
                          style={{ background: selectedDeployed?.address===c.address ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${selectedDeployed?.address===c.address ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)'}`, color: selectedDeployed?.address===c.address ? '#c084fc' : 'rgba(255,255,255,0.6)' }}>
                          <Package size={10} />{c.name}
                          <span className="ml-auto text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{c.address.slice(0,8)}…</span>
                        </button>
                      ))}
                      {selectedDeployed && <ContractInteraction deployed={selectedDeployed} onClose={() => setSelectedDeployed(null)} />}
                    </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile build-status bar (always visible after compile) ── */}
      {result && (
        <div
          className="md:hidden flex-shrink-0 flex items-center justify-between px-3 py-2"
          style={{
            background: result.success ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
            borderTop: `1px solid ${result.success ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}`,
          }}
        >
          <div className="flex items-center gap-2">
            {result.success
              ? <CheckCircle2 size={13} style={{ color: '#34d399' }} />
              : <AlertTriangle size={13} style={{ color: '#f87171' }} />}
            <span className="text-xs font-medium" style={{ color: result.success ? '#34d399' : '#f87171' }}>
              {result.success
                ? `${result.contracts.length} contract(s) compiled`
                : `${result.errors.filter(e=>e.severity==='error').length} error(s)`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {result.success && (
              <button
                onClick={() => { setRightTab('deploy'); setMobileSheet(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', boxShadow: '0 2px 10px rgba(139,92,246,0.4)' }}
              >
                <Rocket size={11} />Deploy
              </button>
            )}
            <button
              onClick={() => { setRightTab(result.success ? 'output' : 'output'); setMobileSheet(true) }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Details
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function IDEPage() {
  return (
    <IDEErrorBoundary>
      <IDEInner />
    </IDEErrorBoundary>
  )
}
