import { useState, useRef, useCallback, useEffect } from 'react'
import Editor, { useMonaco, Monaco } from '@monaco-editor/react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient,
} from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { parseAbi, encodeDeployData, isAddress } from 'viem'
import { toast } from 'sonner'
import {
  Code2, Play, Rocket, ChevronRight, ChevronDown, AlertTriangle, CheckCircle2,
  FileCode2, Loader2, Plus, Trash2, Copy, Check, X, Terminal, Settings2,
  Package, Zap, ExternalLink, BookOpen, FolderOpen, ChevronLeft,
  RotateCcw, Download, LayoutPanelLeft,
} from 'lucide-react'
import { GlassCard } from '@/components/GlassCard'
import { useSolcCompiler, SOLC_VERSIONS, CompileResult, ContractOutput } from '@/hooks/useSolcCompiler'
import { CHAIN_ID, EXPLORER_BASE } from '@/constants'

const SPECTRAL = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

/* ── Solidity template library ──────────────────────────────────── */
const TEMPLATES: Record<string, { label: string; icon: string; source: string }> = {
  blank: {
    label: 'Blank Contract', icon: '📄',
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MyContract {
    address public owner;

    constructor() {
        owner = msg.sender;
    }
}
`,
  },
  erc20: {
    label: 'ERC-20 Token', icon: '🪙',
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract ERC20Token {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name;
        symbol = _symbol;
        owner = msg.sender;
        totalSupply = _supply * 10 ** decimals;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Zero address");
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
`,
  },
  storage: {
    label: 'Simple Storage', icon: '💾',
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract SimpleStorage {
    uint256 private storedValue;
    address public owner;
    
    event ValueChanged(uint256 oldValue, uint256 newValue, address changedBy);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor(uint256 _initialValue) {
        owner = msg.sender;
        storedValue = _initialValue;
    }

    function set(uint256 _value) external onlyOwner {
        emit ValueChanged(storedValue, _value, msg.sender);
        storedValue = _value;
    }

    function get() external view returns (uint256) {
        return storedValue;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
`,
  },
  multisig: {
    label: 'Multisig Wallet', icon: '🔐',
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract MultiSigWallet {
    event Deposit(address indexed sender, uint256 amount);
    event SubmitTransaction(address indexed owner, uint256 indexed txIndex);
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);

    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public required;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    mapping(uint256 => mapping(address => bool)) public isConfirmed;
    Transaction[] public transactions;

    modifier onlyOwner() { require(isOwner[msg.sender], "Not owner"); _; }
    modifier txExists(uint256 i) { require(i < transactions.length, "Tx does not exist"); _; }
    modifier notExecuted(uint256 i) { require(!transactions[i].executed, "Already executed"); _; }
    modifier notConfirmed(uint256 i) { require(!isConfirmed[i][msg.sender], "Already confirmed"); _; }

    constructor(address[] memory _owners, uint256 _required) {
        require(_owners.length > 0, "Owners required");
        require(_required > 0 && _required <= _owners.length, "Invalid required");
        for (uint256 i = 0; i < _owners.length; i++) {
            address o = _owners[i];
            require(o != address(0) && !isOwner[o], "Invalid owner");
            isOwner[o] = true;
            owners.push(o);
        }
        required = _required;
    }

    receive() external payable { emit Deposit(msg.sender, msg.value); }

    function submit(address _to, uint256 _value, bytes calldata _data) external onlyOwner {
        transactions.push(Transaction({ to: _to, value: _value, data: _data, executed: false, confirmations: 0 }));
        emit SubmitTransaction(msg.sender, transactions.length - 1);
    }

    function confirm(uint256 i) external onlyOwner txExists(i) notExecuted(i) notConfirmed(i) {
        isConfirmed[i][msg.sender] = true;
        transactions[i].confirmations += 1;
        emit ConfirmTransaction(msg.sender, i);
    }

    function execute(uint256 i) external onlyOwner txExists(i) notExecuted(i) {
        Transaction storage tx_ = transactions[i];
        require(tx_.confirmations >= required, "Not enough confirmations");
        tx_.executed = true;
        (bool ok,) = tx_.to.call{value: tx_.value}(tx_.data);
        require(ok, "Tx failed");
        emit ExecuteTransaction(msg.sender, i);
    }

    function revoke(uint256 i) external onlyOwner txExists(i) notExecuted(i) {
        require(isConfirmed[i][msg.sender], "Not confirmed");
        isConfirmed[i][msg.sender] = false;
        transactions[i].confirmations -= 1;
        emit RevokeConfirmation(msg.sender, i);
    }

    function getOwners() external view returns (address[] memory) { return owners; }
    function getTransactionCount() external view returns (uint256) { return transactions.length; }
}
`,
  },
  nft: {
    label: 'ERC-721 NFT', icon: '🖼️',
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract SimpleNFT {
    string public name;
    string public symbol;
    address public owner;
    uint256 public totalSupply;
    uint256 public maxSupply;
    uint256 public mintPrice;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => string) private _tokenURIs;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    modifier onlyOwner() { require(msg.sender == owner, "Not owner"); _; }

    constructor(string memory _name, string memory _symbol, uint256 _maxSupply, uint256 _mintPrice) {
        name = _name;
        symbol = _symbol;
        maxSupply = _maxSupply;
        mintPrice = _mintPrice;
        owner = msg.sender;
    }

    function mint(string memory uri) external payable {
        require(totalSupply < maxSupply, "Max supply reached");
        require(msg.value >= mintPrice, "Insufficient payment");
        uint256 tokenId = ++totalSupply;
        ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender]++;
        _tokenURIs[tokenId] = uri;
        emit Transfer(address(0), msg.sender, tokenId);
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(ownerOf[tokenId] != address(0), "Token does not exist");
        return _tokenURIs[tokenId];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(ownerOf[tokenId] == from, "Not owner");
        require(to != address(0), "Invalid recipient");
        require(msg.sender == from || isApprovedForAll[from][msg.sender] || getApproved[tokenId] == msg.sender, "Not authorized");
        delete getApproved[tokenId];
        ownerOf[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        emit Transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "Not owner");
        getApproved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function withdraw() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        require(ok, "Withdraw failed");
    }
}
`,
  },
}

/* ── Solidity language definition for Monaco ────────────────────── */
function registerSolidity(monaco: Monaco) {
  monaco.languages.register({ id: 'solidity' })
  monaco.languages.setMonarchTokensProvider('solidity', {
    keywords: [
      'pragma','import','contract','interface','library','abstract','is','using','for',
      'function','modifier','event','error','struct','enum','mapping','returns','return',
      'if','else','while','do','break','continue','throw','emit','new','delete',
      'this','super','assembly','public','private','internal','external',
      'pure','view','payable','nonpayable','override','virtual','immutable','constant',
      'memory','storage','calldata','indexed','anonymous','constructor','fallback','receive',
      'try','catch','revert','require','assert','type','selfdestruct',
    ],
    typeKeywords: [
      'uint','uint8','uint16','uint32','uint64','uint128','uint256',
      'int','int8','int16','int32','int64','int128','int256',
      'address','bool','string','bytes','bytes1','bytes2','bytes4','bytes8',
      'bytes16','bytes32',
    ],
    builtins: ['msg','block','tx','abi','address','keccak256','sha256','ripemd160','ecrecover','addmod','mulmod','gasleft'],
    tokenizer: {
      root: [
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            '@keywords': 'keyword',
            '@typeKeywords': 'type',
            '@builtins': 'keyword.builtin',
            '@default': 'identifier',
          },
        }],
        { include: '@whitespace' },
        [/[{}()\[\]]/, '@brackets'],
        [/[<>](?!@symbols)/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/\d+(\.\d+)?([eE][\-+]?\d+)?/, 'number'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
        [/'[^']*'/, 'string'],
      ],
      comment: [
        [/[^\/*]+/, 'comment'],
        [/\/\*/, 'comment', '@push'],
        [/\*\//, 'comment', '@pop'],
        [/[\/*]/, 'comment'],
      ],
      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\*/, 'comment', '@comment'],
        [/\/\/.*$/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],
    },
  } as any)
  monaco.editor.defineTheme('glowfun-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c084fc' },
      { token: 'type', foreground: '60a5fa' },
      { token: 'keyword.builtin', foreground: 'f472b6' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'number.hex', foreground: 'fbbf24' },
      { token: 'string', foreground: '34d399' },
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'identifier', foreground: 'e5e7eb' },
      { token: 'delimiter', foreground: '9ca3af' },
    ],
    colors: {
      'editor.background': '#0a0a14',
      'editor.foreground': '#e5e7eb',
      'editorLineNumber.foreground': '#374151',
      'editorLineNumber.activeForeground': '#6b7280',
      'editor.selectionBackground': '#8b5cf620',
      'editor.lineHighlightBackground': '#ffffff08',
      'editorCursor.foreground': '#8b5cf6',
      'editorIndentGuide.background': '#1f2937',
      'editorIndentGuide.activeBackground': '#374151',
    },
  })
}

/* ── Types ───────────────────────────────────────────────────────── */
interface File { name: string; content: string }
interface DeployedContract {
  name: string; address: string; abi: any[]; txHash: string; timestamp: number
}
interface AbiInput { name: string; type: string; value: string }

/* ── Deployed contract interaction card ─────────────────────────── */
function ContractInteraction({ deployed, onClose }: { deployed: DeployedContract; onClose: () => void }) {
  const { writeContract } = useWriteContract()
  const [selectedFn, setSelectedFn] = useState<any>(null)
  const [fnArgs, setFnArgs] = useState<AbiInput[]>([])
  const [ethValue, setEthValue] = useState('')
  const [readResult, setReadResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const publicClient = usePublicClient()

  const functions = deployed.abi.filter((x: any) => x.type === 'function')
  const readFns = functions.filter((f: any) => f.stateMutability === 'view' || f.stateMutability === 'pure')
  const writeFns = functions.filter((f: any) => f.stateMutability !== 'view' && f.stateMutability !== 'pure')

  const selectFn = (fn: any) => {
    setSelectedFn(fn)
    setFnArgs(fn.inputs?.map((i: any) => ({ ...i, value: '' })) ?? [])
    setReadResult(null)
  }

  const callRead = async () => {
    if (!selectedFn || !publicClient) return
    try {
      const args = fnArgs.map(a => parseArg(a.value, a.type))
      const result = await (publicClient as any).readContract({
        address: deployed.address as `0x${string}`,
        abi: deployed.abi,
        functionName: selectedFn.name,
        args,
      })
      setReadResult(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
    } catch (e: any) {
      setReadResult(`Error: ${e.message}`)
    }
  }

  const callWrite = () => {
    if (!selectedFn) return
    const args = fnArgs.map(a => parseArg(a.value, a.type))
    writeContract({
      address: deployed.address as `0x${string}`,
      abi: deployed.abi,
      functionName: selectedFn.name,
      args,
      value: ethValue ? BigInt(Math.floor(parseFloat(ethValue) * 1e18)) : undefined,
    } as any, {
      onSuccess: () => toast.success(`${selectedFn.name} submitted!`),
      onError: (e: any) => toast.error(e.message),
    })
  }

  const parseArg = (val: string, type: string): any => {
    if (type === 'uint256' || type.startsWith('uint')) return BigInt(val || '0')
    if (type === 'bool') return val === 'true'
    if (type.endsWith('[]')) {
      try { return JSON.parse(val) } catch { return [] }
    }
    return val
  }

  const isRead = selectedFn && (selectedFn.stateMutability === 'view' || selectedFn.stateMutability === 'pure')
  const isPayable = selectedFn?.stateMutability === 'payable'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-white">{deployed.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {deployed.address.slice(0, 10)}…{deployed.address.slice(-8)}
            </span>
            <button onClick={() => { navigator.clipboard.writeText(deployed.address); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              {copied ? <Check size={10} style={{ color: '#34d399' }} /> : <Copy size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />}
            </button>
            <a href={`${EXPLORER_BASE}/address/${deployed.address}`} target="_blank" rel="noopener">
              <ExternalLink size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
            </a>
          </div>
        </div>
        <button onClick={onClose} style={{ color: 'rgba(255,255,255,0.3)' }}><X size={14} /></button>
      </div>

      {/* Read functions */}
      {readFns.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Read</div>
          <div className="space-y-1">
            {readFns.map((fn: any) => (
              <button key={fn.name} onClick={() => selectFn(fn)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all"
                style={{ background: selectedFn?.name === fn.name ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedFn?.name === fn.name ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)'}`, color: selectedFn?.name === fn.name ? '#60a5fa' : 'rgba(255,255,255,0.6)' }}>
                <Code2 size={10} />{fn.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Write functions */}
      {writeFns.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Write</div>
          <div className="space-y-1">
            {writeFns.map((fn: any) => (
              <button key={fn.name} onClick={() => selectFn(fn)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all"
                style={{ background: selectedFn?.name === fn.name ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedFn?.name === fn.name ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}`, color: selectedFn?.name === fn.name ? '#c084fc' : 'rgba(255,255,255,0.6)' }}>
                <Zap size={10} />{fn.name}
                {fn.stateMutability === 'payable' && <span className="ml-auto text-[9px] px-1 rounded" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>payable</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Function args + action */}
      {selectedFn && (
        <div className="space-y-2 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {fnArgs.map((arg, i) => (
            <div key={i}>
              <div className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{arg.name} <span style={{ color: 'rgba(255,255,255,0.2)' }}>({arg.type})</span></div>
              <input value={arg.value} onChange={e => {
                const next = [...fnArgs]; next[i] = { ...next[i], value: e.target.value }; setFnArgs(next)
              }}
                placeholder={arg.type}
                className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white bg-transparent outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
            </div>
          ))}
          {isPayable && (
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: '#fbbf24' }}>ETH value (native)</div>
              <input value={ethValue} onChange={e => setEthValue(e.target.value)} placeholder="0.0"
                className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white bg-transparent outline-none"
                style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }} />
            </div>
          )}
          <button
            onClick={isRead ? callRead : callWrite}
            className="w-full py-2 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5"
            style={{ background: isRead ? 'rgba(96,165,250,0.15)' : 'linear-gradient(135deg, #8b5cf6, #ec4899)', border: isRead ? '1px solid rgba(96,165,250,0.2)' : 'none' }}>
            {isRead ? <><BookOpen size={11} />Call (read)</> : <><Zap size={11} />Transact</>}
          </button>
          {readResult && (
            <div className="p-2 rounded-lg text-[10px] font-mono break-all whitespace-pre-wrap" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.1)', color: '#93c5fd' }}>
              {readResult}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Deploy panel ───────────────────────────────────────────────── */
function DeployPanel({
  contracts, onDeployed, onBack,
}: {
  contracts: ContractOutput[]
  onDeployed: (c: DeployedContract) => void
  onBack: () => void
}) {
  const { address: wallet } = useAccount()
  const [selected, setSelected] = useState(contracts[0]?.contractName ?? '')
  const [constructorArgs, setConstructorArgs] = useState<AbiInput[]>([])
  const [ethValue, setEthValue] = useState('')
  const { writeContract, data: deployHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: deployHash })

  const contract = contracts.find(c => c.contractName === selected)

  useEffect(() => {
    if (!contract) return
    const ctr = contract.abi.find((x: any) => x.type === 'constructor')
    setConstructorArgs(ctr?.inputs?.map((i: any) => ({ ...i, value: '' })) ?? [])
  }, [selected, contract])

  useEffect(() => {
    if (isSuccess && receipt && contract) {
      const addr = receipt.contractAddress
      if (addr) {
        const deployed: DeployedContract = {
          name: contract.contractName,
          address: addr,
          abi: contract.abi,
          txHash: deployHash ?? '',
          timestamp: Date.now(),
        }
        onDeployed(deployed)
        toast.success(`${contract.contractName} deployed at ${addr.slice(0,10)}…`)
      }
    }
  }, [isSuccess, receipt])

  const deploy = () => {
    if (!contract || !wallet) return
    const args = constructorArgs.map(a => parseArg(a.value, a.type))
    const calldata = encodeDeployData({
      abi: contract.abi,
      bytecode: `0x${contract.bytecode}` as `0x${string}`,
      args,
    })
    writeContract({
      abi: contract.abi,
      bytecode: `0x${contract.bytecode}` as `0x${string}`,
      functionName: '',
      args: [],
      chainId: CHAIN_ID as any,
    } as any, {
      // @ts-ignore
      data: calldata,
      value: ethValue ? BigInt(Math.floor(parseFloat(ethValue) * 1e18)) : 0n,
    })
  }

  const parseArg = (val: string, type: string): any => {
    if (type === 'uint256' || type.startsWith('uint')) return BigInt(val || '0')
    if (type === 'bool') return val === 'true'
    if (type.endsWith('[]')) { try { return JSON.parse(val) } catch { return [] } }
    return val
  }

  const busy = isPending || isConfirming

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={onBack} style={{ color: 'rgba(255,255,255,0.4)' }}><ChevronLeft size={14} /></button>
        <span className="text-xs font-semibold text-white">Deploy Contract</span>
      </div>

      {/* Contract selector */}
      <div>
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Contract</div>
        <div className="space-y-1">
          {contracts.map(c => (
            <button key={c.contractName} onClick={() => setSelected(c.contractName)}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-left"
              style={{ background: selected === c.contractName ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected === c.contractName ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}`, color: selected === c.contractName ? '#c084fc' : 'rgba(255,255,255,0.6)' }}>
              <Package size={10} />{c.contractName}
              <span className="ml-auto text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{(c.bytecode.length / 2 / 1000).toFixed(1)}KB</span>
            </button>
          ))}
        </div>
      </div>

      {/* Constructor args */}
      {constructorArgs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Constructor Args</div>
          <div className="space-y-1.5">
            {constructorArgs.map((arg, i) => (
              <div key={i}>
                <div className="text-[10px] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{arg.name} <span style={{ color: 'rgba(255,255,255,0.2)' }}>({arg.type})</span></div>
                <input value={arg.value} onChange={e => {
                  const next = [...constructorArgs]; next[i] = { ...next[i], value: e.target.value }; setConstructorArgs(next)
                }}
                  placeholder={arg.type}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white bg-transparent outline-none"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ETH value (if payable constructor) */}
      {contract?.abi.find((x: any) => x.type === 'constructor')?.stateMutability === 'payable' && (
        <div>
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: '#fbbf24' }}>ETH Value</div>
          <input value={ethValue} onChange={e => setEthValue(e.target.value)} placeholder="0.0"
            className="w-full px-2.5 py-1.5 rounded-lg text-xs text-white bg-transparent outline-none"
            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)' }} />
        </div>
      )}

      {!wallet ? (
        <div className="text-center pt-2">
          <p className="text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>Connect wallet to deploy</p>
          <ConnectKitButton />
        </div>
      ) : (
        <button onClick={deploy} disabled={!contract || busy || !contract.bytecode}
          className="w-full py-2.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 16px rgba(139,92,246,0.25)' }}>
          {busy ? <><Loader2 size={12} className="animate-spin" />{isConfirming ? 'Confirming…' : 'Deploying…'}</> : <><Rocket size={12} />Deploy to Arc Mainnet</>}
        </button>
      )}

      {deployHash && (
        <a href={`${EXPLORER_BASE}/tx/${deployHash}`} target="_blank" rel="noopener"
          className="flex items-center gap-1.5 text-[10px]" style={{ color: '#a78bfa' }}>
          <ExternalLink size={10} />View transaction
        </a>
      )}
    </div>
  )
}

/* ── Main IDE Page ──────────────────────────────────────────────── */
export function IDEPage() {
  const monaco = useMonaco()
  const [files, setFiles] = useState<File[]>([
    { name: 'Contract.sol', content: TEMPLATES.blank.source },
  ])
  const [activeFile, setActiveFile] = useState('Contract.sol')
  const [sidebarTab, setSidebarTab] = useState<'files' | 'templates'>('files')
  const [rightTab, setRightTab] = useState<'compile' | 'deploy' | 'interact'>('compile')
  const [solcVersion, setSolcVersion] = useState('0.8.26')
  const [optimize, setOptimize] = useState(true)
  const [runs, setRuns] = useState(200)
  const [evmVersion, setEvmVersion] = useState('paris')
  const [result, setResult] = useState<CompileResult | null>(null)
  const [showErrors, setShowErrors] = useState(true)
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([])
  const [selectedDeployed, setSelectedDeployed] = useState<DeployedContract | null>(null)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [consoleLog, setConsoleLog] = useState<string[]>(['GlowFun IDE ready. Select a template or write Solidity to get started.'])
  const [showingDeploy, setShowingDeploy] = useState(false)

  const { compile, compiling, loading } = useSolcCompiler()

  useEffect(() => {
    if (monaco) registerSolidity(monaco)
  }, [monaco])

  const currentFile = files.find(f => f.name === activeFile)

  const log = (msg: string) => setConsoleLog(prev => [...prev.slice(-100), msg])

  const handleCompile = async () => {
    if (!currentFile) return
    log(`[${new Date().toLocaleTimeString()}] Compiling ${activeFile} with solc ${solcVersion}…`)

    const sources: Record<string, string> = {}
    files.forEach(f => { sources[f.name] = f.content })

    const res = await compile(sources, solcVersion, { optimize, runs, evmVersion })
    setResult(res)
    setShowErrors(true)

    if (res.errors.length === 0) {
      log(`[${new Date().toLocaleTimeString()}] ✓ Compiled successfully — ${res.contracts.length} contract(s)`)
      res.contracts.forEach(c => log(`  • ${c.contractName} — bytecode: ${c.bytecode.length / 2} bytes`))
    } else {
      const errs = res.errors.filter(e => e.severity === 'error')
      const warns = res.errors.filter(e => e.severity === 'warning')
      if (errs.length) log(`[${new Date().toLocaleTimeString()}] ✗ ${errs.length} error(s), ${warns.length} warning(s)`)
      else log(`[${new Date().toLocaleTimeString()}] ⚠ Compiled with ${warns.length} warning(s)`)
    }

    if (res.success) {
      setRightTab('deploy')
      setShowingDeploy(true)
    }
  }

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return
    setFiles(prev => prev.map(f => f.name === activeFile ? { ...f, content: value } : f))
  }

  const addFile = () => {
    const name = `Contract${files.length + 1}.sol`
    setFiles(prev => [...prev, { name, content: TEMPLATES.blank.source }])
    setActiveFile(name)
  }

  const deleteFile = (name: string) => {
    if (files.length === 1) return
    setFiles(prev => prev.filter(f => f.name !== name))
    if (activeFile === name) setActiveFile(files[0].name)
  }

  const loadTemplate = (key: string) => {
    const tpl = TEMPLATES[key]
    const newName = `${key.charAt(0).toUpperCase() + key.slice(1)}.sol`
    if (files.find(f => f.name === newName)) {
      setFiles(prev => prev.map(f => f.name === newName ? { ...f, content: tpl.source } : f))
    } else {
      setFiles(prev => [...prev, { name: newName, content: tpl.source }])
    }
    setActiveFile(newName)
    setResult(null)
    setShowingDeploy(false)
    log(`[${new Date().toLocaleTimeString()}] Loaded template: ${tpl.label}`)
  }

  const downloadFile = () => {
    if (!currentFile) return
    const blob = new Blob([currentFile.content], { type: 'text/plain' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = currentFile.name; a.click()
  }

  const errors = result?.errors.filter(e => e.severity === 'error') ?? []
  const warnings = result?.errors.filter(e => e.severity === 'warning') ?? []

  return (
    <div style={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ background: 'rgba(10,10,20,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              <Code2 size={11} className="text-white" />
            </div>
            <span className="text-xs font-bold text-white hidden sm:inline" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Solidity IDE</span>
          </div>
          <div className="h-3 w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Arc Mainnet</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Compiler settings */}
          <select value={solcVersion} onChange={e => setSolcVersion(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-lg text-white bg-transparent outline-none border"
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
            {Object.keys(SOLC_VERSIONS).map(v => <option key={v} value={v} style={{ background: '#0a0a14' }}>solc {v}</option>)}
          </select>
          <select value={evmVersion} onChange={e => setEvmVersion(e.target.value)}
            className="text-[10px] px-2 py-1 rounded-lg text-white bg-transparent outline-none border hidden sm:block"
            style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
            {['paris', 'shanghai', 'cancun', 'london', 'berlin'].map(v => <option key={v} value={v} style={{ background: '#0a0a14' }}>{v}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{ color: 'rgba(255,255,255,0.5)' }}>
            <div onClick={() => setOptimize(v => !v)}
              className="w-7 h-4 rounded-full relative transition-all cursor-pointer"
              style={{ background: optimize ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.1)' }}>
              <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
                style={{ left: optimize ? '14px' : '2px' }} />
            </div>
            opt
          </label>

          <button onClick={downloadFile} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <Download size={12} style={{ color: 'rgba(255,255,255,0.4)' }} />
          </button>

          <motion.button onClick={handleCompile} disabled={compiling}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
            {compiling ? <><Loader2 size={11} className="animate-spin" />Compiling…</> : <><Play size={11} />Compile</>}
          </motion.button>
        </div>
      </div>

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: File explorer */}
        <AnimatePresence>
          {!leftCollapsed && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 200, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              style={{ background: 'rgba(8,8,16,0.9)', borderRight: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: 200 }}>
                {/* Sidebar tabs */}
                <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {[{ id: 'files', icon: FolderOpen, label: 'Files' }, { id: 'templates', icon: BookOpen, label: 'Templates' }].map(t => (
                    <button key={t.id} onClick={() => setSidebarTab(t.id as any)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium transition-all"
                      style={{ borderBottom: sidebarTab === t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: sidebarTab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}>
                      <t.icon size={10} />{t.label}
                    </button>
                  ))}
                </div>

                {sidebarTab === 'files' ? (
                  <div className="p-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Files</span>
                      <button onClick={addFile} style={{ color: 'rgba(255,255,255,0.4)' }}><Plus size={11} /></button>
                    </div>
                    <div className="space-y-0.5">
                      {files.map(f => (
                        <div key={f.name} onClick={() => setActiveFile(f.name)}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer group"
                          style={{ background: activeFile === f.name ? 'rgba(139,92,246,0.12)' : 'transparent' }}>
                          <FileCode2 size={10} style={{ color: activeFile === f.name ? '#a78bfa' : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                          <span className="text-[10px] flex-1 truncate" style={{ color: activeFile === f.name ? '#a78bfa' : 'rgba(255,255,255,0.5)' }}>{f.name}</span>
                          {files.length > 1 && (
                            <button onClick={e => { e.stopPropagation(); deleteFile(f.name) }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: 'rgba(255,100,100,0.6)' }}>
                              <Trash2 size={9} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Templates</div>
                    {Object.entries(TEMPLATES).map(([key, tpl]) => (
                      <button key={key} onClick={() => loadTemplate(key)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-[10px] text-left transition-all hover:bg-white/5"
                        style={{ color: 'rgba(255,255,255,0.6)' }}>
                        <span>{tpl.icon}</span>{tpl.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle left */}
        <button onClick={() => setLeftCollapsed(v => !v)}
          className="flex items-center justify-center w-4 flex-shrink-0 transition-all hover:bg-white/5"
          style={{ background: 'rgba(8,8,16,0.7)', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
          {leftCollapsed ? <ChevronRight size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronLeft size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />}
        </button>

        {/* CENTER: Monaco editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* File tabs */}
          <div className="flex items-center overflow-x-auto flex-shrink-0"
            style={{ background: 'rgba(8,8,16,0.8)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {files.map(f => (
              <button key={f.name} onClick={() => setActiveFile(f.name)}
                className="flex items-center gap-1.5 px-3 py-2 text-[10px] whitespace-nowrap flex-shrink-0 border-r transition-all"
                style={{
                  borderColor: 'rgba(255,255,255,0.05)',
                  background: activeFile === f.name ? 'rgba(139,92,246,0.08)' : 'transparent',
                  borderBottom: activeFile === f.name ? '2px solid #8b5cf6' : '2px solid transparent',
                  color: activeFile === f.name ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                }}>
                <FileCode2 size={9} />{f.name}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-hidden">
            <Editor
              key={activeFile}
              height="100%"
              language="solidity"
              theme="glowfun-dark"
              value={currentFile?.content ?? ''}
              onChange={handleEditorChange}
              options={{
                fontSize: 13,
                fontFamily: '"Fira Code", "JetBrains Mono", "Cascadia Code", monospace',
                fontLigatures: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 4,
                insertSpaces: true,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'line',
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
              }}
            />
          </div>

          {/* Console */}
          <div style={{ height: 100, background: 'rgba(4,4,8,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', overflow: 'auto' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 sticky top-0" style={{ background: 'rgba(4,4,8,0.95)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <Terminal size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
              <span className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.25)' }}>Console</span>
              <button onClick={() => setConsoleLog([])} className="ml-auto" style={{ color: 'rgba(255,255,255,0.2)' }}>
                <RotateCcw size={9} />
              </button>
            </div>
            <div className="px-3 py-1">
              {consoleLog.map((line, i) => (
                <div key={i} className="text-[10px] font-mono py-0.5"
                  style={{ color: line.includes('✗') || line.includes('Error') ? '#f87171' : line.includes('✓') ? '#34d399' : line.includes('⚠') ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Toggle right */}
        <button onClick={() => setRightCollapsed(v => !v)}
          className="flex items-center justify-center w-4 flex-shrink-0 transition-all hover:bg-white/5"
          style={{ background: 'rgba(8,8,16,0.7)', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
          {rightCollapsed ? <ChevronLeft size={10} style={{ color: 'rgba(255,255,255,0.3)' }} /> : <ChevronRight size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />}
        </button>

        {/* RIGHT: Compiler output + Deploy + Interact */}
        <AnimatePresence>
          {!rightCollapsed && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              style={{ background: 'rgba(8,8,16,0.9)', borderLeft: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ width: 280, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Tab bar */}
                <div className="flex border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {[
                    { id: 'compile', label: 'Output', icon: Terminal },
                    { id: 'deploy', label: 'Deploy', icon: Rocket },
                    { id: 'interact', label: 'Interact', icon: Zap },
                  ].map(t => (
                    <button key={t.id} onClick={() => setRightTab(t.id as any)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-[9px] font-medium transition-all"
                      style={{ borderBottom: rightTab === t.id ? '2px solid #8b5cf6' : '2px solid transparent', color: rightTab === t.id ? '#a78bfa' : 'rgba(255,255,255,0.3)' }}>
                      <t.icon size={9} />{t.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {/* Compile output */}
                  {rightTab === 'compile' && (
                    <div className="space-y-3">
                      {!result ? (
                        <div className="text-center py-8">
                          <Code2 size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Press Compile to get output</p>
                        </div>
                      ) : (
                        <>
                          {/* Status */}
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                            style={{ background: result.success ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${result.success ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)'}` }}>
                            {result.success
                              ? <CheckCircle2 size={12} style={{ color: '#34d399' }} />
                              : <AlertTriangle size={12} style={{ color: '#f87171' }} />}
                            <span className="text-[10px] font-medium" style={{ color: result.success ? '#34d399' : '#f87171' }}>
                              {result.success ? `Compiled — ${result.contracts.length} contract(s)` : `${errors.length} error(s)`}
                            </span>
                          </div>

                          {/* Errors/warnings */}
                          {result.errors.length > 0 && (
                            <div>
                              <button onClick={() => setShowErrors(v => !v)} className="flex items-center gap-1.5 text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                {showErrors ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                                {errors.length > 0 && <span style={{ color: '#f87171' }}>{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
                                {warnings.length > 0 && <span style={{ color: '#fbbf24' }}>{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
                              </button>
                              <AnimatePresence>
                                {showErrors && (
                                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden space-y-1">
                                    {result.errors.map((e, i) => (
                                      <div key={i} className="p-2 rounded-lg text-[9px] font-mono leading-relaxed"
                                        style={{ background: e.severity === 'error' ? 'rgba(248,113,113,0.06)' : 'rgba(251,191,36,0.06)', border: `1px solid ${e.severity === 'error' ? 'rgba(248,113,113,0.12)' : 'rgba(251,191,36,0.12)'}`, color: e.severity === 'error' ? '#fca5a5' : '#fde68a' }}>
                                        {e.formattedMessage}
                                      </div>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* Compiled contracts */}
                          {result.contracts.map(c => (
                            <div key={c.contractName} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Package size={10} style={{ color: '#a78bfa' }} />
                                <span className="text-[10px] font-semibold text-white">{c.contractName}</span>
                                <span className="ml-auto text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{(c.bytecode.length / 2 / 1000).toFixed(1)}KB</span>
                              </div>
                              {/* ABI preview */}
                              <div className="text-[9px] space-y-0.5 ml-4">
                                {c.abi.filter((x: any) => x.type === 'function' || x.type === 'event').slice(0, 6).map((item: any, i) => (
                                  <div key={i} className="flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    <span style={{ color: item.type === 'event' ? '#fbbf24' : item.stateMutability === 'view' ? '#60a5fa' : '#c084fc' }}>
                                      {item.type === 'event' ? 'evt' : item.stateMutability === 'view' ? 'rd' : 'fn'}
                                    </span>
                                    {item.name}({item.inputs?.map((i: any) => i.type).join(', ')})
                                  </div>
                                ))}
                                {c.abi.filter((x: any) => x.type === 'function' || x.type === 'event').length > 6 && (
                                  <div style={{ color: 'rgba(255,255,255,0.25)' }}>+{c.abi.filter((x: any) => x.type === 'function' || x.type === 'event').length - 6} more</div>
                                )}
                              </div>
                            </div>
                          ))}

                          {result.success && (
                            <button onClick={() => { setRightTab('deploy'); setShowingDeploy(true) }}
                              className="w-full py-2 rounded-xl text-[10px] font-semibold text-white flex items-center justify-center gap-1.5"
                              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                              <Rocket size={10} />Deploy →
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Deploy tab */}
                  {rightTab === 'deploy' && (
                    <>
                      {result?.success ? (
                        <DeployPanel
                          contracts={result.contracts}
                          onDeployed={c => { setDeployedContracts(prev => [c, ...prev]); setSelectedDeployed(c); setRightTab('interact') }}
                          onBack={() => setRightTab('compile')}
                        />
                      ) : (
                        <div className="text-center py-8">
                          <Rocket size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                          <p className="text-[10px] mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Compile first to deploy</p>
                          <button onClick={handleCompile} disabled={compiling}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold text-white mx-auto"
                            style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.3)' }}>
                            {compiling ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                            Compile
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Interact tab */}
                  {rightTab === 'interact' && (
                    <>
                      {deployedContracts.length === 0 ? (
                        <div className="text-center py-8">
                          <Zap size={24} className="mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.1)' }} />
                          <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Deploy a contract to interact</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Contract selector */}
                          <div className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Deployed Contracts</div>
                          <div className="space-y-1 mb-3">
                            {deployedContracts.map((c, i) => (
                              <button key={i} onClick={() => setSelectedDeployed(c)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] text-left"
                                style={{ background: selectedDeployed?.address === c.address ? 'rgba(139,92,246,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedDeployed?.address === c.address ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}`, color: selectedDeployed?.address === c.address ? '#c084fc' : 'rgba(255,255,255,0.6)' }}>
                                <Package size={9} />{c.name}
                              </button>
                            ))}
                          </div>
                          {selectedDeployed && (
                            <ContractInteraction deployed={selectedDeployed} onClose={() => setSelectedDeployed(null)} />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
