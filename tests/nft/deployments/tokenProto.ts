import ProtoHeader = require('./protoheader')
import { mvc } from 'mvc-scryptlib'

export const PROTO_TYPE = 1
export const PROTO_VERSION = 1

// <op_pushdata> + <type specific data> + <proto header> + <data_len(4 bytes)> + <version(1 bytes)>
// <token type specific data> = <name(40 bytes)> + <symbol(20 bytes)> + <decimal(1 bytes)> + <address(20 bytes)> + <token amount(8 bytes)> + <genesisHash(20 bytes)> + <genesisTxid(36 bytes)>

export const TOKEN_DECIMAL_LEN = 1;
export const TOKEN_SYMBOLE_LEN = 20;
export const TOKEN_NAME_LEN = 40;

export const OP_PUSH_LEN = 2;
export const GENESISTX_ID_OFFSET = ProtoHeader.PROTO_HEADER_OFFSET + ProtoHeader.GENESIS_TXID_LEN;
export const GENESIS_HASH_OFFSET = GENESISTX_ID_OFFSET + ProtoHeader.HASH_LEN;
export const TOKEN_AMOUNT_OFFSET = GENESIS_HASH_OFFSET + ProtoHeader.AMOUNT_LEN;
export const TOKEN_ADDRESS_OFFSET = TOKEN_AMOUNT_OFFSET + ProtoHeader.ADDRESS_LEN;
export const TOKEN_DECIMAL_OFFSET = TOKEN_ADDRESS_OFFSET + TOKEN_DECIMAL_LEN;
export const TOKEN_SYMBOLE_OFFSET = TOKEN_DECIMAL_OFFSET + TOKEN_SYMBOLE_LEN;
export const TOKEN_NAME_OFFSET = TOKEN_SYMBOLE_OFFSET + TOKEN_NAME_LEN;

export const RAW_DATA_LEN = TOKEN_NAME_OFFSET
export const DATA_LEN = RAW_DATA_LEN + OP_PUSH_LEN;

export const OP_TRANSFER = 1
export const OP_UNLOCK_FROM_CONTRACT = 2

export function getTokenAmount(script: Buffer) {
    return script.readBigUInt64LE(script.length - TOKEN_AMOUNT_OFFSET)
}

export function getTokenID (script: Buffer) {
    return mvc.crypto.Hash.sha256ripemd160(script.subarray(script.length - GENESIS_HASH_OFFSET, script.length - GENESISTX_ID_OFFSET + ProtoHeader.GENESIS_TXID_LEN))
}

export function getGenesisTxid(script: Buffer) {
    return script.subarray(script.length - GENESISTX_ID_OFFSET, script.length - GENESISTX_ID_OFFSET + ProtoHeader.GENESIS_TXID_LEN);
}

export function getGenesisHash(script: Buffer) {
    return script.subarray(script.length - GENESIS_HASH_OFFSET, script.length - GENESISTX_ID_OFFSET)
}

export function getTokenAddress(script: Buffer) {
    return script.subarray(script.length - TOKEN_ADDRESS_OFFSET, script.length - TOKEN_AMOUNT_OFFSET);
}

export function getScriptCode(script: Buffer) {
    return script.subarray(0, script.length - DATA_LEN)
}

export function getScriptData(script: Buffer) {
    return script.subarray(script.length - DATA_LEN, script.length)
}

export function getScriptCodeHash(script: Buffer) {
    return mvc.crypto.Hash.sha256ripemd160(getScriptCode(script))
}

export function getNewTokenScript(scriptBuf: Buffer, address: Buffer, tokenAmount: bigint) {
    const amountBuf = Buffer.alloc(8, 0)
    amountBuf.writeBigUInt64LE(tokenAmount)
    const firstBuf = scriptBuf.subarray(0, scriptBuf.length - TOKEN_ADDRESS_OFFSET)
    const newScript = Buffer.concat([
        firstBuf,
        address,
        amountBuf,
        scriptBuf.subarray(scriptBuf.length - GENESIS_HASH_OFFSET, scriptBuf.length)
    ])
    return newScript
}

export function getNewGenesisScript(scriptBuf: Buffer, genesisTxid: Buffer) {
    const newScript = Buffer.concat([
        scriptBuf.subarray(0, scriptBuf.length - GENESISTX_ID_OFFSET),
        genesisTxid,
        scriptBuf.subarray(scriptBuf.length - GENESISTX_ID_OFFSET + ProtoHeader.GENESIS_TXID_LEN, scriptBuf.length)
    ])
    return newScript
}