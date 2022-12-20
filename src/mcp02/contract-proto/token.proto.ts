import * as BN from '../../bn.js'
import * as mvc from '../../mvc'
import * as proto from '../../common/protoheader'
import * as Utils from '../../common/utils'
import { toHex } from '../../scryptlib'
import { buildScriptData } from '../../common/tokenUtil'
export const PROTO_VERSION = 1
export const SIGNER_NUM = 5
export const SIGNER_VERIFY_NUM = 3

export type SensibleID = {
  txid: string
  index: number
}
export type FormatedDataPart = {
  tokenName?: string
  tokenSymbol?: string
  decimalNum?: number
  tokenAddress?: string
  tokenAmount?: BN
  genesisHash?: string
  sensibleID?: SensibleID
  protoVersion?: number
  protoType?: proto.PROTO_TYPE
}

// <op_pushdata> + <type specific data> + <proto header> + <data_len(4 bytes)> + <version(1 bytes)>
// <token type specific data> = <name(40 bytes)> + <symbol(20 bytes)> + <decimal(1 bytes)> + <address(20 bytes)> + <token amount(8 bytes)> + <genesisHash(20 bytes)> + <genesisTxid(36 bytes)>

// name 40
// symbol 20
// decimal 1
// address 20
// token amount/token value 8
// genesis hash 20
// genesis txid 36
// token version // 4
// token type // 4
// protp flag // 12
/**
 * 对应上面10个参数
 * */
const TOKEN_NAME_LEN = 40
const TOKEN_SYMBOL_LEN = 20
const DECIMAL_NUM_LEN = 1
const TOKEN_ADDRESS_LEN = 20
const TOKEN_AMOUNT_LEN = 8
const GENESIS_HASH_LEN = 20
const SENSIBLE_ID_LEN = 36 // genesis txid
// proto.PROTO_VERSION_LEN
// proto.PROTO_TYPE_LEN
// proto.PROTO_FLAG_LEN

const GENESISTX_ID_OFFSET = SENSIBLE_ID_LEN + proto.getHeaderLen()
const GENESIS_HASH_OFFSET = GENESISTX_ID_OFFSET + GENESIS_HASH_LEN
const TOKEN_AMOUNT_OFFSET = GENESIS_HASH_OFFSET + TOKEN_AMOUNT_LEN
const TOKEN_ADDRESS_OFFSET = TOKEN_AMOUNT_OFFSET + TOKEN_ADDRESS_LEN
const DECIMAL_NUM_OFFSET = TOKEN_ADDRESS_OFFSET + DECIMAL_NUM_LEN
const TOKEN_SYMBOL_OFFSET = DECIMAL_NUM_OFFSET + TOKEN_SYMBOL_LEN
const TOKEN_NAME_OFFSET = TOKEN_SYMBOL_OFFSET + TOKEN_NAME_LEN

const OP_PUSH_LEN = 2
const TOKEN_HEADER_LEN = TOKEN_NAME_OFFSET
const DATA_LEN = TOKEN_HEADER_LEN + OP_PUSH_LEN

export const OP_TRANSFER = 1
export const OP_UNLOCK_FROM_CONTRACT = 2

export enum FT_OP_TYPE {
  TRANSFER = 1,
  UNLOCK_FROM_CONTRACT = 2,
}

export enum GENESIS_FLAG {
  FALSE = 0,
  TRUE = 1,
}

export function getHeaderLen(): number {
  return TOKEN_HEADER_LEN
}

export function getTokenAmount(script: Buffer): BN {
  if (script.length < TOKEN_AMOUNT_OFFSET) return BN.Zero
  return BN.fromBuffer(
    script.slice(
      script.length - TOKEN_AMOUNT_OFFSET,
      script.length - TOKEN_AMOUNT_OFFSET + TOKEN_AMOUNT_LEN
    ),
    { endian: 'little' }
  )
}

export function getTokenID(script: Buffer) {
  return mvc.crypto.Hash.sha256ripemd160(
    script.slice(script.length - GENESIS_HASH_OFFSET, script.length - proto.getHeaderLen())
  )
}

export function getSensibleID(script0: Buffer) {
  if (script0.length < GENESISTX_ID_OFFSET) return { txid: '', index: 0 }
  let script = Buffer.from(script0)
  let sensibleIDBuf = script.slice(
    script.length - GENESISTX_ID_OFFSET,
    script.length - GENESISTX_ID_OFFSET + SENSIBLE_ID_LEN
  )
  let txid = sensibleIDBuf.slice(0, 32).reverse().toString('hex') //reverse会改变原对象
  let index = sensibleIDBuf.readUIntLE(32, 4)
  let sensibleID = { txid, index }
  return sensibleID
}

export function getGenesisHash(script: Buffer) {
  return script
    .slice(
      script.length - GENESIS_HASH_OFFSET,
      // script.length - GENESIS_HASH_OFFSET + GENESISTX_ID_OFFSET
      script.length - GENESIS_HASH_OFFSET + GENESIS_HASH_LEN
    )
    .toString('hex')
}

export function getTokenAddress(script: Buffer): string {
  if (script.length < TOKEN_ADDRESS_OFFSET) return ''
  return script
    .slice(
      script.length - TOKEN_ADDRESS_OFFSET,
      script.length - TOKEN_ADDRESS_OFFSET + TOKEN_ADDRESS_LEN
    )
    .toString('hex')
}

export function getDecimalNum(script: Buffer): number {
  if (script.length < DECIMAL_NUM_OFFSET) return 0
  return script.readUIntLE(script.length - DECIMAL_NUM_OFFSET, DECIMAL_NUM_LEN)
}

export function getTokenSymbol(script: Buffer): string {
  if (script.length < TOKEN_SYMBOL_OFFSET) return ''

  let buf = script.slice(
    script.length - TOKEN_SYMBOL_OFFSET,
    script.length - TOKEN_SYMBOL_OFFSET + TOKEN_SYMBOL_LEN
  )
  return buf.toString()
}

export function getTokenName(script: Buffer): string {
  if (script.length < TOKEN_NAME_OFFSET) return ''

  let buf = script.slice(
    script.length - TOKEN_NAME_OFFSET,
    script.length - TOKEN_NAME_OFFSET + TOKEN_NAME_LEN
  )
  return buf.toString()
}

export function getContractCode(script: Buffer): Buffer {
  return script.slice(0, script.length - DATA_LEN)
}

export function getContractCodeHash(script: Buffer) {
  return mvc.crypto.Hash.sha256ripemd160(getContractCode(script))
}

export function getDataPart(script: Buffer): Buffer {
  return script.slice(script.length - TOKEN_HEADER_LEN, script.length)
}

export function getNewTokenScript(scriptBuf: Buffer, address: Buffer, tokenAmount: BN): Buffer {
  const amountBuf = tokenAmount.toBuffer({ endian: 'little', size: 8 })
  const firstBuf = scriptBuf.slice(0, scriptBuf.length - TOKEN_ADDRESS_OFFSET)
  const newScript = Buffer.concat([
    firstBuf,
    address,
    amountBuf,
    scriptBuf.slice(scriptBuf.length - GENESIS_HASH_OFFSET, scriptBuf.length),
  ])
  return newScript
}

export const getTxIdBuf = function (txid: string) {
  const buf = Buffer.from(txid, 'hex').reverse()
  return buf
}

export const getUInt32Buf = function (index: number) {
  const buf = Buffer.alloc(4, 0)
  buf.writeUInt32LE(index)
  return buf
}

export const genGenesisTxid = function (txid: string, index: number) {
  return Buffer.concat([getTxIdBuf(txid), getUInt32Buf(index)]).toString('hex')
}

export function newDataPart({
  tokenName,
  tokenSymbol,
  decimalNum,
  tokenAddress,
  tokenAmount,
  genesisHash,
  sensibleID,
  protoVersion,
  protoType,
}: FormatedDataPart): Buffer {
  const tokenNameBuf = Buffer.alloc(TOKEN_NAME_LEN, 0)
  if (tokenName) {
    tokenNameBuf.write(tokenName)
  }

  const tokenSymbolBuf = Buffer.alloc(TOKEN_SYMBOL_LEN, 0)
  if (tokenSymbol) {
    tokenSymbolBuf.write(tokenSymbol)
  }

  const decimalBuf = Buffer.alloc(DECIMAL_NUM_LEN, 0)
  if (decimalNum) {
    decimalBuf.writeUInt8(decimalNum)
  }

  let tokenAmountBuf = Buffer.alloc(TOKEN_AMOUNT_LEN, 0)
  if (tokenAmount) {
    tokenAmountBuf = tokenAmount
      .toBuffer({ endian: 'little', size: TOKEN_AMOUNT_LEN })
      .slice(0, TOKEN_AMOUNT_LEN)
  }

  const genesisHashBuf = Buffer.alloc(GENESIS_HASH_LEN, 0)
  if (genesisHash) {
    genesisHashBuf.write(genesisHash, 'hex')
  }

  // TODO 同样是36位,只是换了个名字叫 genesis txid
  let sensibleIDBuf = Buffer.alloc(SENSIBLE_ID_LEN, 0)
  if (sensibleID) {
    const txidBuf = Buffer.from(sensibleID.txid, 'hex').reverse()
    const indexBuf = Buffer.alloc(4, 0)
    indexBuf.writeUInt32LE(sensibleID.index)
    sensibleIDBuf = Buffer.concat([txidBuf, indexBuf])
  }

  const protoTypeBuf = Buffer.alloc(proto.PROTO_TYPE_LEN, 0)
  if (protoType) {
    protoTypeBuf.writeUInt32LE(protoType)
  }

  const protoVersionBuf = Buffer.alloc(proto.PROTO_VERSION_LEN)
  if (protoVersion) {
    protoVersionBuf.writeUInt32LE(protoVersion)
  }

  let tokenAddressBuf = Buffer.alloc(TOKEN_ADDRESS_LEN, 0)
  if (tokenAddress) {
    tokenAddressBuf = Buffer.from(tokenAddress, 'hex')
  }
  const buf = Buffer.concat([
    // 新版结构变化
    tokenNameBuf,
    tokenSymbolBuf,
    decimalBuf,
    tokenAddressBuf, // 就是 issuer 的 hashBuffer
    tokenAmountBuf,
    genesisHashBuf,
    sensibleIDBuf, // 就是genesisTxidBuf
    protoVersionBuf,
    protoTypeBuf,
    proto.PROTO_FLAG,

    // 旧版做法
    // tokenNameBuf,
    // tokenSymbolBuf,
    // genesisFlagBuf,
    // decimalBuf,
    // tokenAddressBuf,
    // tokenAmountBuf,
    // genesisHashBuf,
    // rabinPubKeyHashArrayHashBuf,
    // sensibleIDBuf,
    // protoVersionBuf,
    // protoTypeBuf,
    // proto.PROTO_FLAG,
  ])

  return buildScriptData(buf)
}

export function parseDataPart(scriptBuf: Buffer): FormatedDataPart {
  let tokenName = getTokenName(scriptBuf)
  let tokenSymbol = getTokenSymbol(scriptBuf)
  let decimalNum = getDecimalNum(scriptBuf)
  let tokenAddress = getTokenAddress(scriptBuf)
  let tokenAmount = getTokenAmount(scriptBuf)
  let genesisHash = getGenesisHash(scriptBuf)
  let sensibleID = getSensibleID(scriptBuf)
  let protoVersion = proto.getProtoVersion(scriptBuf)
  let protoType = proto.getProtoType(scriptBuf)
  return {
    tokenName,
    tokenSymbol,
    decimalNum,
    tokenAddress,
    tokenAmount,
    genesisHash,
    sensibleID,
    protoVersion,
    protoType,
  }
}

export function updateScript(scriptBuf: Buffer, dataPartObj: FormatedDataPart): Buffer {
  const firstBuf = scriptBuf.slice(0, scriptBuf.length - TOKEN_HEADER_LEN)
  const dataPart = newDataPart(dataPartObj)
  return Buffer.concat([firstBuf, dataPart])
}

export function getQueryCodehash(script: Buffer): string {
  return toHex(getContractCodeHash(script))
}

export function getQueryGenesis(script: Buffer): string {
  return toHex(getTokenID(script))
}

export function getQuerySensibleID(script0: Buffer): string {
  let script = Buffer.from(script0)
  let sensibleIDBuf = script.slice(
    script.length - GENESISTX_ID_OFFSET,
    script.length - GENESISTX_ID_OFFSET + SENSIBLE_ID_LEN
  )
  return toHex(sensibleIDBuf)
}
