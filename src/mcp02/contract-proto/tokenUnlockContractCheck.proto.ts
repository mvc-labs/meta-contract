import * as BN from '../../bn.js'
import * as mvc from '../../mvc'
import * as TokenUtil from '../../common/tokenUtil'

const NFT_ID_LEN = 36
const NFT_CODE_HASH_LEN = 20
const NFT_ID_OFFSET = 0 + NFT_ID_LEN
const NFT_CODE_HASH_OFFSET = NFT_ID_OFFSET + NFT_CODE_HASH_LEN
// opreturn + inputTokenIndexArray + nSenders(4 bytes) + receiverTokenAmountArray + receiverArray + nReceivers(4 bytes) + tokenCodeHash + tokenID

export type FormatedDataPart = {
  inputTokenIndexArray?: number[]
  nSender?: number
  receiverTokenAmountArray?: BN[]
  receiverArray?: mvc.Address[]
  nReceivers?: number
  tokenCodeHash?: string
  tokenID?: string
}

export function newDataPart(dataPart: FormatedDataPart): Buffer {
  let inputTokenIndexArrayBuf = Buffer.alloc(0)
  dataPart.inputTokenIndexArray.forEach((tokenIndex) => {
    inputTokenIndexArrayBuf = Buffer.concat([
      inputTokenIndexArrayBuf,
      TokenUtil.getUInt32Buf(tokenIndex),
    ])
  })

  let receiverArrayBuf = Buffer.alloc(0)
  dataPart.receiverArray.map((address) => {
    receiverArrayBuf = Buffer.concat([receiverArrayBuf, address.hashBuffer])
  })
  let nSenderBuf = TokenUtil.getUInt32Buf(dataPart.nSender)
  let nReceiversBuf = TokenUtil.getUInt32Buf(dataPart.nReceivers)
  let tokenCodeHashBuf = Buffer.from(dataPart.tokenCodeHash, 'hex')
  let tokenIDBuf = Buffer.from(dataPart.tokenID, 'hex')

  const buf = Buffer.concat([
    inputTokenIndexArrayBuf,
    nSenderBuf,
    receiverArrayBuf,
    nReceiversBuf,
    tokenCodeHashBuf,
    tokenIDBuf,
  ])

  return TokenUtil.buildScriptData(buf)
}
