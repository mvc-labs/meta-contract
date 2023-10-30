import { NftManager } from './mcp01'
import { FtManager } from './mcp02'

import * as mvc from './mvc'
export const BN = mvc.crypto.BN
export { mvc }

export { Net } from './net'
export { API_NET, API_TARGET, Api } from './api'
export { OutputType, TxDecoder } from './tx-decoder'
export { TxComposer } from './tx-composer'
export { Wallet } from './wallet'

// 兼容
const SensibleNFT = NftManager
const SensibleFT = FtManager
export { SensibleNFT, SensibleFT, NftManager, FtManager }
