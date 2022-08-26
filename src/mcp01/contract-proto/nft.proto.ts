import * as mvc from '../../mvc'
import * as proto from '../../common/protoheader'
import * as Utils from '../../common/utils'
import { toHex } from '../../scryptlib'
import BN = require('../../bn.js')
import { buildScriptData } from '../../common/tokenUtil'
export type MetaidOutpoint = {
  txid: string
  index: number
}
export type SensibleID = {
  txid: string
  index: number
}
export type FormatedDataPart = {
  metaidOutpoint?: MetaidOutpoint
  nftAddress?: string
  totalSupply?: BN
  tokenIndex?: BN
  genesisHash?: string
  sensibleID?: SensibleID
  protoVersion?: number
  protoType?: proto.PROTO_TYPE
}
export enum NFT_OP_TYPE {
  TRANSFER = 1,
  UNLOCK_FROM_CONTRACT = 2,
}
export const PROTO_VERSION = 1

// <type specific data> + <proto header>
// <proto header> = <type(4 bytes)> + <'sensible'(8 bytes)>
//<nft type specific data> = <metaid_outpoint(36 bytes)> + <address(20 bytes)> + <totalSupply(8 bytes) + <tokenIndex(8 bytes)> + <genesisHash<20 bytes>) + + <sensibleID(36 bytes)>
const SENSIBLE_ID_LEN = 36
const GENESIS_HASH_LEN = 20
const TOKEN_INDEX_LEN = 8
const NFT_ID_LEN = 20
const TOTAL_SUPPLY_LEN = 8
const NFT_ADDRESS_LEN = 20
const METAID_OUTPOINT_LEN = 36

const SENSIBLE_ID_OFFSET = SENSIBLE_ID_LEN + proto.getHeaderLen()
const GENESIS_HASH_OFFSET = SENSIBLE_ID_OFFSET + GENESIS_HASH_LEN
const TOKEN_INDEX_OFFSET = GENESIS_HASH_OFFSET + TOKEN_INDEX_LEN
const TOTAL_SUPPLY_OFFSET = TOKEN_INDEX_OFFSET + TOTAL_SUPPLY_LEN
const NFT_ADDRESS_OFFSET = TOTAL_SUPPLY_OFFSET + NFT_ADDRESS_LEN
const METAID_OUTPOINT_OFFSET = NFT_ADDRESS_OFFSET + METAID_OUTPOINT_LEN

const DATA_LEN = METAID_OUTPOINT_OFFSET
// const OP_PUSH_LEN = 2
// const DATA_LEN = METAID_OUTPOINT_OFFSET + OP_PUSH_LEN

export const GENESIS_TOKEN_ID = Buffer.alloc(NFT_ID_LEN, 0)
export const EMPTY_ADDRESS = Buffer.alloc(NFT_ADDRESS_LEN, 0)

export function getGenesisHash(script: Buffer) {
  return script
    .slice(
      script.length - GENESIS_HASH_OFFSET,
      script.length - GENESIS_HASH_OFFSET + GENESIS_HASH_LEN
    )
    .toString('hex')
}

export function getTokenIndex(script: Buffer): BN {
  if (script.length < TOKEN_INDEX_OFFSET) return BN.Zero
  return BN.fromBuffer(
    script.slice(
      script.length - TOKEN_INDEX_OFFSET,
      script.length - TOKEN_INDEX_OFFSET + TOKEN_INDEX_LEN
    ),
    { endian: 'little' }
  )
}

export function getNftID(script: Buffer) {
  return mvc.crypto.Hash.sha256ripemd160(
    script.slice(script.length - TOKEN_INDEX_OFFSET, script.length - proto.getHeaderLen())
  )
}

export function getTotalSupply(script: Buffer): BN {
  if (script.length < TOTAL_SUPPLY_OFFSET) return BN.Zero
  return BN.fromBuffer(
    script.slice(
      script.length - TOTAL_SUPPLY_OFFSET,
      script.length - TOTAL_SUPPLY_OFFSET + TOTAL_SUPPLY_LEN
    ),
    { endian: 'little' }
  )
}

export function getNftAddress(script: Buffer) {
  if (script.length < NFT_ADDRESS_OFFSET) return ''
  return script
    .slice(script.length - NFT_ADDRESS_OFFSET, script.length - NFT_ADDRESS_OFFSET + NFT_ADDRESS_LEN)
    .toString('hex')
}

export function getContractCode(script: Buffer) {
  return script.slice(0, script.length - DATA_LEN - Utils.getVarPushdataHeader(DATA_LEN).length)
}

export function getContractCodeHash(script: Buffer) {
  return mvc.crypto.Hash.sha256ripemd160(getContractCode(script))
}

export function getMetaidOutpoint(script0: Buffer) {
  if (script0.length < METAID_OUTPOINT_OFFSET) return { txid: '', index: 0 }
  let script = Buffer.from(script0)
  let metaidOutpointBuf = script.slice(
    script.length - METAID_OUTPOINT_OFFSET,
    script.length - METAID_OUTPOINT_OFFSET + METAID_OUTPOINT_LEN
  )
  let txid = metaidOutpointBuf.slice(0, 32).reverse().toString('hex') //reverse会改变原对象
  let index = metaidOutpointBuf.readUIntLE(32, 4)
  let outpoint = { txid, index }
  return outpoint
}

export function getSensibleID(script0: Buffer) {
  if (script0.length < SENSIBLE_ID_OFFSET) return { txid: '', index: 0 }
  let script = Buffer.from(script0)
  let sensibleIDBuf = script.slice(
    script.length - SENSIBLE_ID_OFFSET,
    script.length - SENSIBLE_ID_OFFSET + SENSIBLE_ID_LEN
  )
  let txid = sensibleIDBuf.slice(0, 32).reverse().toString('hex') //reverse会改变原对象
  let index = sensibleIDBuf.readUIntLE(32, 4)
  let outpoint = { txid, index }
  return outpoint
}

export function newDataPart({
  metaidOutpoint,
  nftAddress,
  totalSupply,
  tokenIndex,
  genesisHash,
  sensibleID,
  protoVersion,
  protoType,
}: FormatedDataPart): Buffer {
  let metaidOutpointBuf = Buffer.alloc(METAID_OUTPOINT_LEN, 0)
  if (metaidOutpoint && metaidOutpoint.txid) {
    const txidBuf = Buffer.from(metaidOutpoint.txid, 'hex').reverse()
    const indexBuf = Buffer.alloc(4, 0)
    indexBuf.writeUInt32LE(metaidOutpoint.index)
    metaidOutpointBuf = Buffer.concat([txidBuf, indexBuf])
  }

  let nftAddressBuf = Buffer.alloc(NFT_ADDRESS_LEN, 0)
  if (nftAddress) {
    // nftAddressBuf.write(nftAddress, 'hex')
    nftAddressBuf = Buffer.from(nftAddress, 'hex')
  }

  let totalSupplyBuf = Buffer.alloc(TOTAL_SUPPLY_LEN, 0)
  if (totalSupply) {
    totalSupplyBuf = totalSupply
      .toBuffer({ endian: 'little', size: TOTAL_SUPPLY_LEN })
      .slice(0, TOTAL_SUPPLY_LEN)
  }

  let tokenIndexBuf = Buffer.alloc(TOKEN_INDEX_LEN, 0)
  if (tokenIndex) {
    tokenIndexBuf = tokenIndex.toBuffer({
      endian: 'little',
      size: TOKEN_INDEX_LEN,
    })
  }

  const genesisHashBuf = Buffer.alloc(GENESIS_HASH_LEN, 0)
  if (genesisHash) {
    genesisHashBuf.write(genesisHash, 'hex')
  }

  let sensibleIDBuf = Buffer.alloc(SENSIBLE_ID_LEN, 0)
  if (sensibleID) {
    const txidBuf = Buffer.from(sensibleID.txid, 'hex').reverse()
    const indexBuf = Buffer.alloc(4, 0)
    indexBuf.writeUInt32LE(sensibleID.index)
    sensibleIDBuf = Buffer.concat([txidBuf, indexBuf])
  }

  const protoVersionBuf = Buffer.alloc(proto.PROTO_VERSION_LEN)
  if (protoVersion) {
    protoVersionBuf.writeUInt32LE(protoVersion)
  }

  const protoTypeBuf = Buffer.alloc(proto.PROTO_TYPE_LEN, 0)
  if (protoType) {
    protoTypeBuf.writeUInt32LE(protoType)
  }

  const buf = Buffer.concat([
    metaidOutpointBuf,
    nftAddressBuf,
    totalSupplyBuf,
    tokenIndexBuf,
    genesisHashBuf,
    sensibleIDBuf,
    protoVersionBuf,
    protoTypeBuf,
    proto.PROTO_FLAG,
  ])

  return buildScriptData(buf)
}

export function parseDataPart(scriptBuf: Buffer): FormatedDataPart {
  let metaidOutpoint = getMetaidOutpoint(scriptBuf)
  let nftAddress = getNftAddress(scriptBuf)
  let totalSupply = getTotalSupply(scriptBuf)
  let tokenIndex = getTokenIndex(scriptBuf)
  let genesisHash = getGenesisHash(scriptBuf)
  let sensibleID = getSensibleID(scriptBuf)
  let protoVersion = proto.getProtoVersioin(scriptBuf)
  let protoType = proto.getProtoType(scriptBuf)

  return {
    metaidOutpoint,
    nftAddress,
    totalSupply,
    tokenIndex,
    genesisHash,
    sensibleID,
    protoVersion,
    protoType,
  }
}

export function updateScript(scriptBuf: Buffer, dataPartObj: FormatedDataPart): Buffer {
  const firstBuf = scriptBuf.slice(0, scriptBuf.length - DATA_LEN)
  const dataPart = newDataPart(dataPartObj)
  return Buffer.concat([firstBuf, dataPart])
}

export function getQueryCodehash(script: Buffer): string {
  return toHex(getContractCodeHash(script))
}

export function getQueryGenesis(script: Buffer): string {
  return toHex(
    mvc.crypto.Hash.sha256ripemd160(
      script.slice(script.length - GENESIS_HASH_OFFSET, script.length - proto.getHeaderLen())
    )
  )
}

export function getQuerySensibleID(script0: Buffer) {
  let script = Buffer.from(script0)
  let sensibleIDBuf = script.slice(
    script.length - SENSIBLE_ID_OFFSET,
    script.length - SENSIBLE_ID_OFFSET + SENSIBLE_ID_LEN
  )
  return toHex(sensibleIDBuf)
}
