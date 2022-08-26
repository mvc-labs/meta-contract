
export const PROTO_FLAG = Buffer.from('metacontract')
export const PROTO_FLAG_LEN = PROTO_FLAG.length
export const HEADER_LEN = 20

export const HASH_ID_LEN = 20
export const HASH_LEN = 20
export const GENESIS_TXID_LEN = 36
export const AMOUNT_LEN = 8
export const ADDRESS_LEN = 20
export const GENESIS_FLAG_LEN = 1
export const DATA_VERSION_LEN = 5
export const UNIQUE_ID_LEN = 20
export const BLOCK_NUM_LEN = 4

export const BURN_ADDRESS = Buffer.alloc(20, 0)

export const PROTO_HEADER_OFFSET = DATA_VERSION_LEN + HEADER_LEN

export const NULL_GENESISTX_ID = '000000000000000000000000000000000000000000000000000000000000000000000000';