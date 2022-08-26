import { Buffer } from 'buffer'
import { expect } from 'chai'

import {
  mvc,
  getPreimage,
  toHex,
  SigHashPreimage,
  signTx,
  PubKey,
  Sig,
  Bytes,
  Ripemd160,
  buildTypeClasses,
} from 'mvc-scryptlib'
import { inputSatoshis, dummyTxId } from '../../../scrypt_helper'

import { privateKey, privateKey2 } from '../../../privateKey'
import TokenProto = require('../../deployments/tokenProto')

import Common = require('../../deployments/common')
import ProtoHeader = require('../../deployments/protoheader')
import NftProto = require('../../deployments/nftProto')

const addOutput = Common.addOutput
const genContract = Common.genContract

const address1 = privateKey.toAddress()
const address2 = privateKey2.toAddress()

const OP_RETURN = Buffer.from('6a', 'hex')

const issuerPrivKey = privateKey
const issuerAddress = issuerPrivKey.toAddress()

// init contract
const USE_DESC = false
const USE_RELEASE = false
const Genesis = genContract('nft/nftGenesis', USE_DESC, USE_RELEASE)
const Nft = genContract('nft/nft', USE_DESC, USE_RELEASE)
const UnlockContractCheck = genContract('nft/nftUnlockContractCheck', USE_DESC, USE_RELEASE)
const NftSell = genContract('nft/nftSell', USE_DESC, USE_RELEASE)
const NftSellForToken = genContract('nft/nftSellForToken', USE_DESC, USE_RELEASE)
const TokenBuyForNft = genContract('nft/tokenBuyForNft', USE_DESC, USE_RELEASE)
const Token = genContract('token/token', false, false)
const TxUtil = genContract('txUtil', false, false)

const jsonDescr = Common.loadDescription('./fixture/autoGen/txUtil_desc.json')
const { TxInputProof, TxOutputProof } = buildTypeClasses(jsonDescr)

const addInput = Common.addInput

const nftType = Common.getUInt32Buf(NftProto.PROTO_TYPE)
const nftVersion = Common.getUInt32Buf(NftProto.PROTO_VERSION)
const PROTO_FLAG = ProtoHeader.PROTO_FLAG
const metaidOutpoint = Buffer.alloc(36, 0)
export const genesisTxId = dummyTxId
export const genesisOutputIndex = 119
export const defaultSensibleID = Buffer.concat([
  Common.getTxIdBuf(genesisTxId),
  Common.getUInt32Buf(genesisOutputIndex),
])

export function createInputTx(
  lockingScript,
  prevTx: mvc.Transaction | undefined,
  outputSatoshis: number = inputSatoshis
) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  if (prevTx) {
    addInput(tx, prevTx.id, 0, prevTx.outputs[0].script, inputSatoshis, [])
  } else {
    addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address1), inputSatoshis, [], true)
  }
  tx.addOutput(
    new mvc.Transaction.Output({
      script: lockingScript,
      satoshis: outputSatoshis,
    })
  )
  return tx
}

let unlockContractCodeHashArray
export function initContractHash() {
  const unlockContract = new UnlockContractCheck()
  const code = Buffer.concat([unlockContract.lockingScript.toBuffer(), OP_RETURN])
  const hash = Buffer.from(mvc.crypto.Hash.sha256ripemd160(code)).toString('hex')
  const unlockContractCodeHash = new Bytes(hash)
  unlockContractCodeHashArray = [
    unlockContractCodeHash,
    unlockContractCodeHash,
    unlockContractCodeHash,
    unlockContractCodeHash,
    unlockContractCodeHash,
  ]
}

export function createNftGenesisContract(
  totalSupply: number,
  tokenIndex: number,
  sensibleID: Buffer
) {
  const genesis = new Genesis()
  const data = Common.buildScriptData(
    Buffer.concat([
      Buffer.alloc(36, 0), // metaidOutpoint
      issuerAddress.hashBuffer, // address
      Common.getUInt64Buf(totalSupply),
      Common.getUInt64Buf(tokenIndex),
      Buffer.alloc(20, 0), // genesisHash
      sensibleID, // sensibleID
      nftVersion,
      nftType,
      PROTO_FLAG,
    ])
  )
  genesis.setDataPart(data.toString('hex'))
  return genesis
}

export function createNftContract(
  totalSupply: number,
  tokenIndex: number,
  genesisHash: Buffer,
  addressBuf: Buffer,
  sensID: any = defaultSensibleID
) {
  const nft = new Nft(unlockContractCodeHashArray)
  const data = Common.buildScriptData(
    Buffer.concat([
      metaidOutpoint,
      addressBuf,
      Common.getUInt64Buf(totalSupply),
      Common.getUInt64Buf(tokenIndex),
      genesisHash,
      sensID,
      nftVersion,
      nftType,
      PROTO_FLAG,
    ])
  )
  nft.setDataPart(data.toString('hex'))
  return nft
}

export function unlockNft(
  tx: mvc.Transaction,
  prevouts: Buffer,
  nft,
  inputIndex: number,
  // nft
  nftTx: mvc.Transaction,
  prevNftInputIndex: number,
  prevNftTx: mvc.Transaction,
  genesisScriptBuf: Buffer,
  // amountCheck
  unlockCheckHashIndex: number,
  unlockCheckInputIndex: number,
  unlockCheckTx: mvc.Transaction | null,
  unlockCheckScript: Buffer,
  // contract
  contractInputIndex: number,
  contractTx: mvc.Transaction | null,
  // sig
  pubKeyHex: string,
  sigHex: string,
  // output
  receiverAddress: mvc.Address,
  changeAddress: mvc.Address,
  changeSatoshis: number,
  op: number,
  expected: boolean = true
) {
  const input = tx.inputs[inputIndex]
  let output = <mvc.Transaction.Output>input.output
  const nftOutputSatoshis = output.satoshis
  const inputSatoshis = output.satoshis

  const preimage = getPreimage(
    tx,
    nft.lockingScript,
    inputSatoshis,
    inputIndex,
    Common.SIG_HASH_ALL
  )

  const inputRes = Common.getTxInputProof(nftTx, prevNftInputIndex)
  const nftTxInputProof = new TxInputProof(inputRes[0])
  const nftTxHeader = inputRes[1]
  const prevNftOutputIndex = nftTx.inputs[prevNftInputIndex].outputIndex
  const prevNftTxProof = new TxOutputProof(Common.getTxOutputProof(prevNftTx, prevNftOutputIndex))

  let prevNftAddress = Buffer.alloc(20, 0)
  const prevNftScriptBuf = prevNftTx.outputs[prevNftOutputIndex].script.toBuffer()
  if (prevNftScriptBuf.length > NftProto.DATA_LEN) {
    prevNftAddress = NftProto.getNftAddress(prevNftScriptBuf)
  }

  let contractTxProof = new TxOutputProof(Common.getEmptyTxOutputProof())
  if (contractTx) {
    const contractOutputIndex = tx.inputs[contractInputIndex].outputIndex
    contractTxProof = new TxOutputProof(Common.getTxOutputProof(contractTx, contractOutputIndex))
  }

  let unlockCheckTxProof = new TxOutputProof(Common.getEmptyTxOutputProof())
  if (unlockCheckTx) {
    const unlockCheckOutputIndex = tx.inputs[unlockCheckInputIndex].outputIndex
    unlockCheckTxProof = new TxOutputProof(
      Common.getTxOutputProof(unlockCheckTx, unlockCheckOutputIndex)
    )
  }

  const txContext = {
    tx: tx,
    inputIndex: inputIndex,
    inputSatoshis: inputSatoshis,
  }

  const result = nft
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      new Bytes(prevouts.toString('hex')),
      // nft
      prevNftInputIndex,
      new Bytes(prevNftAddress.toString('hex')),
      nftTxHeader,
      nftTxInputProof,
      prevNftTxProof,
      new Bytes(genesisScriptBuf.toString('hex')),
      // contract
      contractInputIndex,
      contractTxProof,
      // unlockCheck
      unlockCheckHashIndex,
      unlockCheckInputIndex,
      unlockCheckTxProof,
      new Bytes(unlockCheckScript.toString('hex')),
      // sig
      new PubKey(pubKeyHex),
      new Sig(toHex(sigHex)),
      // output
      new Bytes(receiverAddress.hashBuffer.toString('hex')), // receiver
      nftOutputSatoshis, // nftOutputSatoshis
      new Bytes(''), // opReturnScript
      new Ripemd160(changeAddress.hashBuffer.toString('hex')), // change address
      changeSatoshis, // change satoshis
      op // op
    )
    .verify(txContext)

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

export function transferNft(totalSupply: number, tokenIndex: number, options: any = {}) {
  const genesisHash = options.genesisHash || Buffer.alloc(20, 0)
  const nft = createNftContract(totalSupply, tokenIndex, genesisHash, address1.hashBuffer)

  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  // input
  let prevouts = []
  const prevNftTx = createInputTx(nft.lockingScript, undefined)
  const nftTx = createInputTx(nft.lockingScript, prevNftTx)
  const prevNftInputIndex = 0
  addInput(tx, nftTx.id, 0, nft.lockingScript, inputSatoshis, prevouts)

  addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address1), inputSatoshis, prevouts)

  const prevoutsBuf = Buffer.concat(prevouts)

  // output
  const nft2 = createNftContract(totalSupply, tokenIndex, genesisHash, address2.hashBuffer)
  addOutput(tx, nft2.lockingScript, inputSatoshis)

  if (options.replicateNft) {
    addOutput(tx, nft2.lockingScript, inputSatoshis)
  }
  const changeSatoshis = inputSatoshis
  addOutput(tx, mvc.Script.buildPublicKeyHashOut(address1), changeSatoshis)

  const genesisScriptBuf = Buffer.alloc(0)

  // unlock nft
  const pubKeyHex = toHex(privateKey.publicKey)
  const sigHex = toHex(
    signTx(tx, privateKey, nft.lockingScript, inputSatoshis, 0, Common.SIG_HASH_ALL)
  )
  unlockNft(
    tx,
    prevoutsBuf,
    nft,
    0,
    nftTx,
    prevNftInputIndex,
    prevNftTx,
    genesisScriptBuf,
    0,
    0,
    null,
    Buffer.alloc(0),
    0,
    null,
    pubKeyHex,
    sigHex,
    address2,
    address1,
    changeSatoshis,
    NftProto.OP_TRANSFER,
    options.expected
  )
}

export function createNftSellTx(
  senderAddress: mvc.Address,
  sellSatoshis: number,
  nftCodeHash: string,
  nftID: string
) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address1), inputSatoshis, [])
  const nftSell = new NftSell(
    new Ripemd160(senderAddress.hashBuffer.toString('hex')),
    sellSatoshis,
    new Bytes(nftCodeHash),
    new Bytes(nftID)
  )
  const data = Common.buildScriptData(Buffer.alloc(0))
  nftSell.setDataPart(data.toString('hex'))
  const sellScript = nftSell.lockingScript
  tx.addOutput(
    new mvc.Transaction.Output({
      script: sellScript,
      satoshis: inputSatoshis,
    })
  )

  return { nftSell, nftSellTx: tx }
}

export function createNftSellForTokenTx(
  senderAddress: mvc.Address,
  tokenAmount: bigint,
  tokenID: string,
  tokenCodeHash: string
) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address1), inputSatoshis, [])
  const nftSellForToken = new NftSellForToken(
    new Ripemd160(senderAddress.hashBuffer.toString('hex')),
    tokenAmount,
    new Bytes(tokenID),
    new Bytes(tokenCodeHash)
  )
  const data = Common.buildScriptData(Buffer.alloc(0))
  nftSellForToken.setDataPart(data.toString('hex'))
  const sellScript = nftSellForToken.lockingScript
  tx.addOutput(
    new mvc.Transaction.Output({
      script: sellScript,
      satoshis: inputSatoshis,
    })
  )

  return { nftSellForToken, nftSellForTokenTx: tx }
}

export function createTokenBuyForNftTx(
  senderAddress: mvc.Address,
  nftID: string,
  nftCodeHash: string
) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address1), inputSatoshis, [])
  const tokenBuyForNft = new TokenBuyForNft(
    new Ripemd160(senderAddress.hashBuffer.toString('hex')),
    new Bytes(nftID),
    new Bytes(nftCodeHash)
  )
  const data = Common.buildScriptData(Buffer.alloc(0))
  tokenBuyForNft.setDataPart(data.toString('hex'))
  tx.addOutput(
    new mvc.Transaction.Output({
      script: tokenBuyForNft.lockingScript,
      satoshis: inputSatoshis,
    })
  )

  return { tokenBuyForNft, tokenBuyForNftTx: tx }
}

export function createUnlockContractCheck(nftCodeHash: string, nftID: string) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address1), inputSatoshis, [])
  const unlockCheck = new UnlockContractCheck()
  const data = Common.buildScriptData(Buffer.from(nftCodeHash + nftID, 'hex'))
  unlockCheck.setDataPart(data.toString('hex'))

  const sellScript = unlockCheck.lockingScript
  tx.addOutput(
    new mvc.Transaction.Output({
      script: sellScript,
      satoshis: inputSatoshis,
    })
  )

  return { unlockCheck, unlockCheckTx: tx }
}

export function unlockUnlockContractCheck(
  tx: mvc.Transaction,
  prevoutsBuf: Buffer,
  inputIndex: number,
  unlockContractCheck,
  nftInputIndex: number,
  nftTx: mvc.Transaction,
  // output
  txNftOutputIndex: number,
  expected: boolean = true
) {
  const input = tx.inputs[inputIndex]
  let output = <mvc.Transaction.Output>input.output
  const inputSatoshis = output.satoshis

  const nOutputs = tx.outputs.length
  const preimage = getPreimage(
    tx,
    unlockContractCheck.lockingScript.subScript(0),
    inputSatoshis,
    inputIndex
  )

  const nftTxOutputIndex = tx.inputs[nftInputIndex].outputIndex
  const nftScriptBuf = nftTx.outputs[nftTxOutputIndex].script.toBuffer()
  const nftTxOutputProof = Common.getTxOutputProof(nftTx, nftTxOutputIndex)

  let nftOutputSatoshis = 0
  let txNftOutputAddress = Buffer.alloc(20, 0)
  if (txNftOutputIndex >= 0) {
    output = tx.outputs[txNftOutputIndex]
    nftOutputSatoshis = output.satoshis
    txNftOutputAddress = NftProto.getNftAddress(output.script.toBuffer())
  }

  let otherOutputArray = Buffer.alloc(0)
  for (let i = 0; i < nOutputs; i++) {
    if (i !== txNftOutputIndex) {
      const output = tx.outputs[i].toBufferWriter().toBuffer()
      otherOutputArray = Buffer.concat([
        otherOutputArray,
        Common.getUInt32Buf(output.length),
        output,
      ])
    }
  }

  const txContext = {
    tx: tx,
    inputIndex,
    inputSatoshis,
  }

  const result = unlockContractCheck
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      new Bytes(prevoutsBuf.toString('hex')),
      // nft
      nftInputIndex,
      new Bytes(nftScriptBuf.toString('hex')),
      nftTxOutputProof.txHeader,
      nftTxOutputProof.hashProof,
      nftTxOutputProof.satoshiBytes,
      // output
      nOutputs,
      txNftOutputIndex,
      new Bytes(txNftOutputAddress.toString('hex')),
      nftOutputSatoshis,
      new Bytes(otherOutputArray.toString('hex'))
    )
    .verify(txContext)

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

export function unlockNftSell(nftSell, tx, inputIndex: number, expected: boolean = true) {
  const sigtype = Common.SIG_HASH_SINGLE
  const preimage = getPreimage(
    tx,
    nftSell.lockingScript.subScript(0),
    inputSatoshis,
    inputIndex,
    sigtype
  )

  const txContext = {
    tx: tx,
    inputIndex,
    inputSatoshis,
  }
  const result = nftSell
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      new Bytes(''),
      new PubKey(Buffer.alloc(33, 0).toString('hex')),
      new Sig(Buffer.alloc(72, 0).toString('hex')),
      0,
      1
    )
    .verify(txContext)

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

export function unlockNftSellForToken(
  tx: mvc.Transaction,
  prevoutsBuf: Buffer,
  inputIndex: number,
  nftSell,
  tokenTx: mvc.Transaction,
  tokenInputIndex: number,
  expected: boolean = true
) {
  const sigtype = Common.SIG_HASH_SINGLE
  const preimage = getPreimage(tx, nftSell.lockingScript, inputSatoshis, inputIndex, sigtype)

  const tokenOutputIndex = tx.inputs[tokenInputIndex].outputIndex
  let output = tokenTx.outputs[tokenOutputIndex]
  const tokenScriptBuf = output.script.toBuffer()
  const tokenOutputSatoshis = output.satoshis
  const tokenTxProof = Common.getTxOutputProof(tokenTx, tokenOutputIndex)

  const txContext = {
    tx: tx,
    inputIndex,
    inputSatoshis,
  }
  const result = nftSell
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      new Bytes(prevoutsBuf.toString('hex')),
      // token
      new Bytes(tokenScriptBuf.toString('hex')),
      tokenTxProof.txHeader,
      tokenTxProof.hashProof,
      tokenTxProof.satoshiBytes,
      // nft
      new Bytes(''),
      // sig
      new PubKey(Buffer.alloc(33, 0).toString('hex')),
      new Sig(Buffer.alloc(72, 0).toString('hex')),
      // otuput
      tokenOutputSatoshis,
      0, //nftOutputSatoshis,
      1
    )
    .verify(txContext)

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

export function unlockTokenBuyForNft(
  tx: mvc.Transaction,
  prevoutsBuf: Buffer,
  inputIndex: number,
  tokenBuy,
  nftTx: mvc.Transaction,
  nftInputIndex: number,
  expected: boolean = true
) {
  const sigtype = Common.SIG_HASH_SINGLE
  const preimage = getPreimage(
    tx,
    tokenBuy.lockingScript.subScript(0),
    inputSatoshis,
    inputIndex,
    sigtype
  )

  const nftOutputIndex = tx.inputs[nftInputIndex].outputIndex
  let output = nftTx.outputs[nftOutputIndex]
  const nftOutputSatoshis = output.satoshis
  const nftScriptBuf = output.script.toBuffer()
  const nftTxProof = Common.getTxOutputProof(nftTx, nftOutputIndex)

  const txContext = {
    tx: tx,
    inputIndex,
    inputSatoshis,
  }
  const result = tokenBuy
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      new Bytes(prevoutsBuf.toString('hex')),
      // nft
      new Bytes(nftScriptBuf.toString('hex')),
      nftTxProof.txHeader,
      nftTxProof.hashProof,
      nftTxProof.satoshiBytes,
      // token
      new Bytes(''),
      // sig
      new PubKey(Buffer.alloc(33, 0).toString('hex')),
      new Sig(Buffer.alloc(72, 0).toString('hex')),
      // output
      0,
      nftOutputSatoshis,
      1
    )
    .verify(txContext)

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

export function unlockNftFromContract(totalSupply: number, tokenIndex: number, options: any = {}) {
  const genesisHash = options.genesisHash || Buffer.alloc(20, 0)
  let nft = createNftContract(totalSupply, tokenIndex, genesisHash, address1.hashBuffer)

  const nftCodeHash = NftProto.getScriptCodeHash(nft.lockingScript.toBuffer()).toString('hex')
  const nftID = NftProto.getNftID(nft.lockingScript.toBuffer()).toString('hex')

  const sellSatoshis = inputSatoshis

  const { nftSell, nftSellTx } = createNftSellTx(address1, sellSatoshis, nftCodeHash, nftID)
  let lockContractHash = mvc.crypto.Hash.sha256ripemd160(nftSell.lockingScript.toBuffer())
  if (options.burn) {
    lockContractHash = NftProto.BURN_ADDRESS
  }
  nft = createNftContract(totalSupply, tokenIndex, genesisHash, lockContractHash)

  let prevouts = []
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION

  // input
  if (!options.burn) {
    addInput(tx, nftSellTx.id, 0, nftSell.lockingScript, nftSellTx.outputs[0].satoshis, prevouts)
  }
  const nftSellInputIndex = 0

  const nftInputIndex = tx.inputs.length
  const prevNftTx = createInputTx(nft.lockingScript, undefined)
  const nftTx = createInputTx(nft.lockingScript, prevNftTx)
  const prevNftInputIndex = 0
  addInput(tx, nftTx.id, 0, nft.lockingScript, inputSatoshis, prevouts)

  addInput(tx, dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address2), inputSatoshis, prevouts)

  const unlockCheckInputIndex = tx.inputs.length
  const unlockCheckHashIndex = 0
  const { unlockCheck, unlockCheckTx } = createUnlockContractCheck(nftCodeHash, nftID)
  const unlockCheckScript = unlockCheck.lockingScript.toBuffer()
  addInput(tx, unlockCheckTx.id, 0, unlockCheck.lockingScript.subScript(0), inputSatoshis, prevouts)

  const prevoutsBuf = Buffer.concat(prevouts)

  // output
  addOutput(tx, mvc.Script.buildPublicKeyHashOut(address1), sellSatoshis)
  const nft2 = createNftContract(totalSupply, tokenIndex, genesisHash, address2.hashBuffer)
  let txNftOutputIndex = -1
  if (options.noNftOutput !== true) {
    addOutput(tx, nft2.lockingScript, inputSatoshis)
    txNftOutputIndex = 1
  }
  // change mvc(optional)

  const genesisScriptBuf = Buffer.alloc(0)
  // unlock
  const pubKeyHex = Buffer.alloc(33, 0).toString('hex')
  const sigHex = Buffer.alloc(72, 0).toString('hex')
  unlockNft(
    tx,
    prevoutsBuf,
    nft,
    nftInputIndex,
    nftTx,
    prevNftInputIndex,
    prevNftTx,
    genesisScriptBuf,
    unlockCheckHashIndex,
    unlockCheckInputIndex,
    unlockCheckTx,
    unlockCheckScript,
    nftSellInputIndex,
    nftSellTx,
    pubKeyHex,
    sigHex,
    address2,
    address2,
    0,
    NftProto.OP_UNLOCK_FROM_CONTRACT,
    options.expected
  )

  unlockUnlockContractCheck(
    tx,
    prevoutsBuf,
    unlockCheckInputIndex,
    unlockCheck,
    nftInputIndex,
    nftTx,
    txNftOutputIndex,
    options.checkExpected
  )

  if (!options.burn) {
    unlockNftSell(nftSell, tx, nftSellInputIndex, true)
  }
}

export function unlockGenesis(
  tx: mvc.Transaction,
  genesis,
  inputIndex: number,
  pubKeyHex: string,
  sigHex: string,
  genesisTx,
  prevGenesisInputIndex,
  prevGenesisTx,
  nftScriptBuf: Buffer,
  changeAddress: mvc.Address,
  changeSatoshis: number,
  nftSatoshis: number,
  expected: boolean = true
) {
  const input = tx.inputs[inputIndex]
  let output = <mvc.Transaction.Output>input.output
  const inputSatoshis = output.satoshis
  const genesisSatoshis = inputSatoshis
  const preimage = getPreimage(tx, genesis.lockingScript, inputSatoshis, inputIndex)

  const inputProofRes = Common.getTxInputProof(genesisTx, prevGenesisInputIndex)
  const genesisTxInputProof = new TxInputProof(inputProofRes[0])
  const genesisTxHeader = inputProofRes[1]

  const prevGenesisOutputIndex = genesisTx.inputs[prevGenesisInputIndex].outputIndex
  const prevGenesisTxProof = Common.getTxOutputProof(prevGenesisTx, prevGenesisOutputIndex)

  const txContext = {
    tx: tx,
    inputIndex,
    inputSatoshis,
  }

  // unlock
  const result = genesis
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      // sig
      new PubKey(pubKeyHex),
      new Sig(sigHex),
      // genesisTx
      genesisTxHeader,
      prevGenesisInputIndex,
      genesisTxInputProof,
      // prev genesis tx output proof
      prevGenesisTxProof.txHeader,
      prevGenesisTxProof.hashProof,
      prevGenesisTxProof.satoshiBytes,
      // output
      new Bytes(nftScriptBuf.toString('hex')),
      genesisSatoshis,
      nftSatoshis,
      new Ripemd160(changeAddress.hashBuffer.toString('hex')),
      changeSatoshis,
      new Bytes('')
    )
    .verify(txContext)

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

export function issueNft(totalSupply: number, tokenIndex: number, options: any = {}) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION

  let prevouts = []
  let sensibleIDBuf = Buffer.from(Common.genGenesisTxid(dummyTxId, 0), 'hex')

  let genesis = createNftGenesisContract(totalSupply, tokenIndex, sensibleIDBuf)
  let prevGenesisTx
  if (tokenIndex === 0) {
    prevGenesisTx = new mvc.Transaction()
    prevGenesisTx.version = Common.TX_VERSION
    addInput(
      prevGenesisTx,
      dummyTxId,
      0,
      mvc.Script.buildPublicKeyHashOut(address1),
      inputSatoshis,
      [],
      true
    )
    prevGenesisTx.addOutput(
      new mvc.Transaction.Output({
        script: mvc.Script.buildPublicKeyHashOut(issuerAddress),
        satoshis: inputSatoshis,
      })
    )
    genesis = createNftGenesisContract(totalSupply, tokenIndex, Buffer.alloc(36, 0))
  } else {
    const prevGenesis = createNftGenesisContract(totalSupply, tokenIndex - 1, sensibleIDBuf)
    prevGenesisTx = createInputTx(prevGenesis.lockingScript, undefined)
  }
  const prevGenesisInputIndex = 0
  const genesisTx = createInputTx(genesis.lockingScript, prevGenesisTx)
  if (tokenIndex === 0) {
    sensibleIDBuf = Buffer.from(Common.genGenesisTxid(genesisTx.id, 0), 'hex')
  }
  addInput(tx, genesisTx.id, 0, genesis.lockingScript, inputSatoshis, prevouts)

  // output
  if (tokenIndex < totalSupply - 1) {
    const genesis2 = createNftGenesisContract(totalSupply, tokenIndex + 1, sensibleIDBuf)
    addOutput(tx, genesis2.lockingScript, inputSatoshis)
  }

  const newGenesisScriptBuf = NftProto.getNewGenesisScript(
    genesis.lockingScript.toBuffer(),
    sensibleIDBuf,
    BigInt(0)
  )
  const genesisHash = mvc.crypto.Hash.sha256ripemd160(newGenesisScriptBuf)
  const nft = createNftContract(
    totalSupply,
    tokenIndex,
    genesisHash,
    address1.hashBuffer,
    sensibleIDBuf
  )
  addOutput(tx, nft.lockingScript, inputSatoshis)

  // unlock
  const pubKeyHex = toHex(issuerPrivKey.publicKey)
  const sigHex = toHex(
    signTx(tx, issuerPrivKey, genesis.lockingScript, inputSatoshis, 0, Common.SIG_HASH_ALL)
  )
  unlockGenesis(
    tx,
    genesis,
    0,
    pubKeyHex,
    sigHex,
    genesisTx,
    prevGenesisInputIndex,
    prevGenesisTx,
    nft.lockingScript.toBuffer(),
    issuerAddress,
    0,
    inputSatoshis,
    options.expected
  )
}

function createTokenContract(addressBuf: Buffer, amount: bigint) {
  const genesisHash = Buffer.alloc(20, 0).toString('hex')
  const tokenSensibleID = Buffer.concat([
    Buffer.from([...Buffer.from(dummyTxId, 'hex')].reverse()),
    Common.getUInt32Buf(11),
  ]).toString('hex')
  const tokenType = Common.getUInt32Buf(TokenProto.PROTO_TYPE)
  const tokenVersion = Common.getUInt32Buf(TokenProto.PROTO_VERSION)
  const transferCheckCodeHash = new Bytes(Buffer.alloc(20, 0).toString('hex'))
  const transferCheckCodeHashArray = [
    transferCheckCodeHash,
    transferCheckCodeHash,
    transferCheckCodeHash,
    transferCheckCodeHash,
    transferCheckCodeHash,
  ]
  const token = new Token(transferCheckCodeHashArray, unlockContractCodeHashArray)
  const data = Common.buildScriptData(
    Buffer.concat([
      addressBuf,
      Common.getUInt64Buf(amount),
      Buffer.from(genesisHash, 'hex'),
      Buffer.from(tokenSensibleID, 'hex'),
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
    ])
  )
  token.setDataPart(data.toString('hex'))
  return token
}

export function sellNftForToken(totalSupply: number, tokenIndex: number, options: any = {}) {
  /*const sellerAddress = address1
    const buyerAddress = address2
    const genesisHash = options.genesisHash || Buffer.alloc(20, 0)
    const tokenAmount = BigInt(10000)

    let nft = createNftContract(totalSupply, tokenIndex, genesisHash, sellerAddress.hashBuffer)

    const nftCodeHash = NftProto.getContractCodeHash(nft.lockingScript.toBuffer()).toString('hex')
    const nftID = NftProto.getNftID(nft.lockingScript.toBuffer()).toString('hex')

    const token = createTokenContract(buyerAddress.hashBuffer, tokenAmount)
    const tokenID = TokenProto.getTokenID(token.lockingScript.toBuffer()).toString('hex')
    const tokenCodeHash = TokenProto.getScriptCodeHash(token.lockingScript.toBuffer()).toString('hex')

    const {nftSellForToken, nftSellForTokenTx} = createNftSellForTokenTx(address1, tokenAmount, tokenID, tokenCodeHash)
    let lockContractHash = mvc.crypto.Hash.sha256ripemd160(nftSellForToken.lockingScript.toBuffer())
    nft = createNftContract(totalSupply, tokenIndex, genesisHash, lockContractHash)
    const {unlockCheck, unlockCheckTx} = createUnlockContractCheck(nftCodeHash, nftID)

    let prevouts = []
    const tx = new mvc.Transaction()
    tx.version = Common.TX_VERSION

    // input
    // nftSellForToken
    addInput(tx, nftSellForToken.id, 0, nftSellForToken.lockingScript, inputSatoshis, prevouts)

    // tokenBuyForNft
    const {tokenBuyForNft, tokenBuyForNftTx} = createTokenBuyForNftTx(buyerAddress, nftID, nftCodeHash)
    addInput(tx, tokenBuyForNft.id, 0, tokenBuyForNft.lockingScript, inputSatoshis, prevouts)

    // nft
    const nftInputIndex = tx.inputs.length
    addInput(tx, nft.lockingScript, 0, prevouts)

    // token
    addInput(tx, token.lockingScript, 0, prevouts)

    // nftCheck
    const checkInputIndex = tx.inputs.length
    addInput(tx, nftUnlockContractCheck.lockingScript, 0, prevouts, nftUnlockContractCheckTx.id)

    // tokenCheck
    let script = token.lockingScript
    addInput(tx, script, 0, prevouts)

    // mvc
    addInput(tx, mvc.Script.buildPublicKeyHashOut(address2), 0, prevouts)

    const prevoutsBuf = Buffer.concat(prevouts)

    // output

    // token
    let scriptBuf = TokenProto.getNewTokenScript(token.lockingScript.toBuffer(), sellerAddress.hashBuffer, tokenAmount)
    addOutput(tx, mvc.Script.fromBuffer(scriptBuf), inputSatoshis)

    // nft
    const nft2 = createNftContract(totalSupply, tokenIndex, genesisHash, address2.hashBuffer)
    addOutput(tx, nft2.lockingScript, inputSatoshis)
    const nftOutputIndex = 1

    // change mvc(optional)

    // unlock
    const preimage = getPreimage(tx, nft.lockingScript.toASM(), inputSatoshis, nftInputIndex)

    const txContext = {
        tx: tx,
        inputIndex: nftInputIndex,
        inputSatoshis,
    }

    const prevNftAddress = address2.hashBuffer
    scriptBuf = NftProto.getNewNftScript(nft.lockingScript.toBuffer(), prevNftAddress)
    const [rabinMsg, rabinPaddingArray, rabinSigArray] = Common.createRabinMsg(options.prevTxId || dummyTxId, options.prevOutputIndex || 0, inputSatoshis, scriptBuf, dummyTxId)

    const result = nft.unlock(
        new SigHashPreimage(toHex(preimage)),
        new Bytes(prevoutsBuf.toString('hex')),
        new Bytes(rabinMsg.toString('hex')),
        rabinPaddingArray,
        rabinSigArray,
        rabinPubKeyIndexArray,
        Common.rabinPubKeyVerifyArray,
        new Bytes(Common.rabinPubKeyHashArray.toString('hex')),
        new Bytes(prevNftAddress.toString('hex')),
        new Bytes(''),
        new PubKey(Buffer.alloc(33, 0).toString('hex')),
        new Sig(Buffer.alloc(72, 0).toString('hex')),
        new Bytes(''), // receiver
        0, // nftOutputSatoshis
        new Bytes(''), // opReturnScript
        new Ripemd160(Buffer.alloc(20, 0).toString('hex')), // change address
        0, // change satoshis
        checkInputIndex, // checkInputIndex
        new Bytes(nftUnlockContractCheckTx.toString('hex')), // checkScriptTx
        0, // lockContractInputIndex,
        new Bytes(nftSellTx.toString('hex')), // lockContractTx
        2, // op
    ).verify(txContext)

    if (options.expected === false) {
        expect(result.success, result.error).to.be.false
    } else {
        expect(result.success, result.error).to.be.true
    }

    unlockUnlockContractCheck(nftUnlockContractCheck, checkInputIndex, tx, nftInputIndex, nft.lockingScript.toBuffer(), prevoutsBuf, nftOutputIndex, address2.hashBuffer, inputSatoshis, options.checkExpected)

    unlockNftSellForToken(nftSellContract, tx, 0, prevoutsBuf, token.lockingScript)

    unlockTokenBuyForNft(tokenBuyForNft, tx, 1, prevoutsBuf, nft.lockingScript)*/
}
