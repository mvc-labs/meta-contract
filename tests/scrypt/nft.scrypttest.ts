import { mvc } from 'mvc-scryptlib'
import NftProto = require('../deployments/nftProto')

import {
  initContractHash,
  transferNft,
  createNftGenesisContract,
  unlockNftFromContract,
  genesisTxId,
  genesisOutputIndex,
  defaultSensibleID as sensibleID,
  sellNftForToken,
} from './nftUtils'

describe('Test nft contract unlock In Javascript', () => {
  before(() => {
    initContractHash()
  })

  it('should success when transfer nft', () => {
    transferNft(1, 0)
  })

  it('should failed when transfer nft more than one output', () => {
    transferNft(10, 5, { replicateNft: true, expected: false })
  })

  it('should success when unlock from first genesis', () => {
    transferNft(10, 5, { prevTxId: genesisTxId, prevOutputIndex: genesisOutputIndex })
  })

  it('should success when unlock from genesis', () => {
    const genesis = createNftGenesisContract(10, 5, sensibleID)
    const newGenesisScriptBuf = NftProto.getNewGenesisScript(
      genesis.lockingScript.toBuffer(),
      sensibleID,
      BigInt(0)
    )
    const genesisHash = mvc.crypto.Hash.sha256ripemd160(newGenesisScriptBuf)

    transferNft(10, 5, {
      genesisHash,
      prevScriptBuf: genesis.lockingScript.toBuffer(),
      genesisScriptHex: genesis.lockingScript.toBuffer().toString('hex'),
    })
  })

  it('should success when unlockFromContract', () => {
    unlockNftFromContract(2, 1)
  })

  it('should failed when not output nft', () => {
    unlockNftFromContract(2, 1, { noNftOutput: true, checkExpected: false })
  })

  it('should success when burn nft', () => {
    unlockNftFromContract(1, 0, { burn: true, noNftOutput: true })
  })

  it('should failed when steal from burn', () => {
    unlockNftFromContract(1, 0, { burn: true, checkExpected: false })
  })

  it('st1: should success when sell nft for token', () => {
    sellNftForToken(1, 0)
  })
})
