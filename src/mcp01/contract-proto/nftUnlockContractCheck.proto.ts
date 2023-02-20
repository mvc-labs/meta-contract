import { buildScriptData } from '../../common/tokenUtil'
import BN = require('../../bn.js')
const NFT_ID_LEN = 36
const NFT_CODE_HASH_LEN = 20
const DATA_VERSION_LEN = 5
const NFT_ID_OFFSET = DATA_VERSION_LEN + NFT_ID_LEN
const NFT_CODE_HASH_OFFSET = NFT_ID_OFFSET + NFT_CODE_HASH_LEN
export function getNftID(script: Buffer) {
  return script.slice(script.length - NFT_ID_OFFSET, script.length - NFT_ID_OFFSET + NFT_ID_LEN)
}

export function getNftCodehHash(script: Buffer) {
  return script.slice(
    script.length - NFT_CODE_HASH_OFFSET,
    script.length - NFT_CODE_HASH_OFFSET + NFT_CODE_HASH_LEN
  )
}

export type FormatedDataPart = {
  nftID: Buffer
  nftCodeHash: Buffer
}

export function newDataPart(dataPart: FormatedDataPart): Buffer {
  const buf = Buffer.concat([dataPart.nftCodeHash, dataPart.nftID])
  return buildScriptData(buf)
}

export function parseDataPart(scriptBuf: Buffer): FormatedDataPart {
  let nftID = getNftID(scriptBuf)
  let nftCodeHash = getNftCodehHash(scriptBuf)
  return {
    nftID,
    nftCodeHash,
  }
}
