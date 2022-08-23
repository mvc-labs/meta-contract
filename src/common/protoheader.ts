export const PROTO_FLAG = Buffer.from('metacontract') // 12
export const PROTO_FLAG_LEN = PROTO_FLAG.length // 12
export const PROTO_TYPE_LEN = 4
export const PROTO_TYPE_OFFSET = PROTO_FLAG_LEN + PROTO_TYPE_LEN // 12 + 4 = 16
export const PROTO_VERSION_LEN = 4
export const PROTO_VERSION_OFFSET = PROTO_TYPE_OFFSET + PROTO_VERSION_LEN // 16 + 4 = 20
export const PROTO_SURFIX = 5
export const HEADER_LEN = PROTO_VERSION_OFFSET + PROTO_SURFIX // 20 + 5 = 25

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
  return script.slice(script.length - PROTO_FLAG_LEN, script.length)
}

export function getProtoType(script: Buffer) {
  if (script.length < PROTO_TYPE_OFFSET) return 0
  return script.readUIntLE(script.length - PROTO_TYPE_OFFSET, PROTO_TYPE_LEN)
}

export function getProtoVersioin(script: Buffer) {
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
