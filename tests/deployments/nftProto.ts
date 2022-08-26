import { mvc } from 'mvc-scryptlib'
import ProtoHeader = require('./protoheader')

export const PROTO_TYPE = 3
export const PROTO_VERSION = 1
export const BURN_ADDRESS = Buffer.alloc(20, 0)

export const OP_TRANSFER = 1
export const OP_UNLOCK_FROM_CONTRACT = 2

// <type specific data> + <proto header>
//<nft type specific data> = <metaid_outpoint(36 bytes)>  + <address(20 bytes)> + <totalSupply(8 bytes) + <tokenIndex(8 bytes)> + <genesisHash<20 bytes>) + <sensibleID(36 bytes)>
const METAID_OUTPOINT_LEN = 36

const OP_PUSH_LEN = 2;
const SENSIBLE_ID_OFFSET = ProtoHeader.PROTO_HEADER_OFFSET + ProtoHeader.GENESIS_TXID_LEN
const GENESIS_HASH_OFFSET = SENSIBLE_ID_OFFSET + ProtoHeader.HASH_LEN
const TOKEN_INDEX_OFFSET = GENESIS_HASH_OFFSET + ProtoHeader.AMOUNT_LEN
const TOTAL_SUPPLY_OFFSET = TOKEN_INDEX_OFFSET + ProtoHeader.AMOUNT_LEN
const NFT_ADDRESS_OFFSET = TOTAL_SUPPLY_OFFSET + ProtoHeader.ADDRESS_LEN
const METAID_OUTPOINT_OFFSET = NFT_ADDRESS_OFFSET + METAID_OUTPOINT_LEN

export const RAW_DATA_LEN = METAID_OUTPOINT_OFFSET
export const DATA_LEN = METAID_OUTPOINT_OFFSET + OP_PUSH_LEN

export function getSensibleID(script: Buffer) {
    return script.subarray(script.length - SENSIBLE_ID_OFFSET, script.length - SENSIBLE_ID_OFFSET + ProtoHeader.GENESIS_TXID_LEN)
}

export function getGenesisHash(script: Buffer) {
    return script.subarray(script.length - GENESIS_HASH_OFFSET, script.length - GENESIS_HASH_OFFSET + ProtoHeader.HASH_LEN)
}

export function getTokenIndex(script: Buffer) {
    return script.readBigUInt64LE(script.length - TOKEN_INDEX_OFFSET)
}

export function getNftID(script: Buffer) {
    return mvc.crypto.Hash.sha256ripemd160(script.subarray(script.length - TOKEN_INDEX_OFFSET, script.length - SENSIBLE_ID_OFFSET + ProtoHeader.GENESIS_TXID_LEN))
}

export function getTotalSupply(script: Buffer) {
    return script.readBigUInt64LE(script.length - TOTAL_SUPPLY_OFFSET)
}

export function getNftAddress(script: Buffer) {
    return script.subarray(script.length - NFT_ADDRESS_OFFSET, script.length - NFT_ADDRESS_OFFSET + ProtoHeader.ADDRESS_LEN)
}

export function getScriptCode(script: Buffer) {
    // contract code include op_return
    return script.subarray(0, script.length - DATA_LEN)
}

export function getScriptCodeHash(script: Buffer) {
    return mvc.crypto.Hash.sha256ripemd160(getScriptCode(script))
}

export function getNewNftScript(script: Buffer, addressBuf: Buffer) {
    return Buffer.concat([
        script.subarray(0, script.length - NFT_ADDRESS_OFFSET),
        addressBuf,
        script.subarray(script.length - NFT_ADDRESS_OFFSET + ProtoHeader.ADDRESS_LEN, script.length)
    ])
}

export function getNewGenesisScript(script: Buffer, sensibleID: Buffer, tokenIndex: bigint) {
    const indexBuf = Buffer.alloc(8, 0)
    indexBuf.writeBigUInt64LE(tokenIndex)
    return Buffer.concat([
        script.subarray(0, script.length - TOKEN_INDEX_OFFSET),
        indexBuf,
        script.subarray(script.length - GENESIS_HASH_OFFSET, script.length - SENSIBLE_ID_OFFSET),
        sensibleID,
        script.subarray(script.length - SENSIBLE_ID_OFFSET + ProtoHeader.GENESIS_TXID_LEN, script.length)
    ])
}
