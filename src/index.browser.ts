/**
 * When we browserify the source, buffer in elliptic/node_modules/bn.js is null.
 * Add the code to fix that.
 */
if (typeof globalThis.window !== 'undefined') {
  var window: any = globalThis.window
  if (typeof window.Buffer == 'undefined') {
    const Buffer = require('buffer/index').Buffer
    window.Buffer = Buffer
  }
}

// export { SensibleNFT } from './bcp01'
// export { SensibleFT } from './bcp02'
export { BN } from './bn.js'
export * as mvc from './mvc'
export { Net } from './net'
export { API_NET, API_TARGET, Api } from './api'
export { OutputType, TxDecoder } from './tx-decoder'
export { TxComposer } from './tx-composer'
export { Wallet } from './wallet'

// // 兼容
import { NftManager } from './mcp01'
import { FtManager } from './mcp02'
const SensibleNFT = NftManager
const SensibleFT = FtManager
export { SensibleNFT, SensibleFT, NftManager, FtManager }
