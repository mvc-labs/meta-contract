export const PROTO_SUFFIX = 5
export const PROTO_FLAG = Buffer.from('metacontract') // 12
export const PROTO_FLAG_LEN = PROTO_FLAG.length // 12
export const PROTO_FLAG_OFFSET = PROTO_FLAG_LEN + PROTO_SUFFIX // 12 + 5 = 17
export const PROTO_TYPE_LEN = 4
export const PROTO_TYPE_OFFSET = PROTO_FLAG_OFFSET + PROTO_TYPE_LEN // 17 + 4 = 21
export const PROTO_VERSION_LEN = 4
export const PROTO_VERSION_OFFSET = PROTO_TYPE_OFFSET + PROTO_VERSION_LEN // 21 + 4 = 25
export const HEADER_LEN = PROTO_VERSION_OFFSET // 25

export enum PROTO_TYPE {
  FT = 1,
  UNIQUE = 2,
  NFT = 3,
  NFT_SELL = 0x00010001,
}

export function getHeaderLen() {
  return HEADER_LEN
}

export function getFlag(script: Buffer) {
  return script.slice(script.length - PROTO_FLAG_OFFSET, script.length - PROTO_SUFFIX)
}

export function getProtoType(script: Buffer) {
  if (script.length < PROTO_TYPE_OFFSET) return 0
  return script.readUIntLE(script.length - PROTO_TYPE_OFFSET, PROTO_TYPE_LEN)
}

export function getProtoVersion(script: Buffer) {
  if (script.length < PROTO_VERSION_OFFSET) return 0
  return script.readUIntLE(script.length - PROTO_VERSION_OFFSET, PROTO_VERSION_LEN)
}

export function hasProtoFlag(script: Buffer) {
  const flag = getFlag(script)
  if (flag.compare(PROTO_FLAG) === 0) {
    return true
  }
  return false
}
