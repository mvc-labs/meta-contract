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
import { inputSatoshis, dummyTxId } from '../scrypt_helper'

import { privateKey } from '../../privateKey'

import ProtoHeader = require('../deployments/protoheader')
import TokenProto = require('../deployments/tokenProto')
import Common = require('../deployments/common')
import { TokenGenesisFactory } from '../../src/mcp02/contract-factory/tokenGenesis'
import { TxComposer } from '../../src/tx-composer'
import { Api, API_NET, API_TARGET } from '../../src'

const genContract = Common.genContract
const addInput = Common.addInput
const addOutput = Common.addOutput

const USE_DESC = false
const USE_RELEASE = false
const Genesis = genContract('token/tokenGenesis', USE_DESC, USE_RELEASE)
const Token = genContract('token/token', USE_DESC, USE_RELEASE)
const TxUtil = genContract('txUtil', false, false)

const jsonDescr = Common.loadDescription('./fixture/autoGen/txUtil_desc.json')
const { TxInputProof } = buildTypeClasses(jsonDescr)

const issuerPrivKey = privateKey
const issuerPubKey = privateKey.publicKey
const issuerAddress = privateKey.toAddress()
const tokenVersion = Common.getUInt32Buf(1)
const tokenType = Common.getUInt32Buf(1)
const PROTO_FLAG = ProtoHeader.PROTO_FLAG
const address1 = privateKey.toAddress()
const tokenValue = 1000000
const buffValue = Buffer.alloc(8, 0)
buffValue.writeBigUInt64LE(BigInt(tokenValue))
const transferCheckCodeHash = new Bytes(Buffer.alloc(20, 0).toString('hex'))
const transferCheckCodeHashArray = [
  transferCheckCodeHash,
  transferCheckCodeHash,
  transferCheckCodeHash,
  transferCheckCodeHash,
  transferCheckCodeHash,
]
const unlockContractCodeHashArray = transferCheckCodeHashArray

const sigtype = Common.SIG_HASH_ALL

const TOKEN_NAME = Buffer.alloc(TokenProto.TOKEN_NAME_LEN, 0)
TOKEN_NAME.write('test token name')
const TOKEN_SYMBOL = Buffer.alloc(TokenProto.TOKEN_SYMBOLE_LEN, 0)
TOKEN_SYMBOL.write('test')
const DECIMAL_NUM = Buffer.from('08', 'hex')

let genesisTxidBuf, genesisHash, genesisTx, prevGenesisTx

function createGenesis(sID: Buffer) {
  const genesis = new Genesis()
  const contractData = Buffer.concat([
    TOKEN_NAME,
    TOKEN_SYMBOL,
    DECIMAL_NUM,
    issuerAddress.hashBuffer, // address
    Buffer.alloc(8, 0), // token value
    Buffer.alloc(20, 0), // genesisHash
    sID, // genesisTxidBuf
    tokenVersion,
    tokenType, // type
    PROTO_FLAG,
  ])
  genesis.setDataPart(Common.buildScriptData(contractData).toString('hex'))

  return genesis
}

function unlockGenesis(
  tx: mvc.Transaction,
  genesis,
  tokenScript,
  genesisTx: mvc.Transaction,
  prevInputIndex: number,
  prevGenesisTx: mvc.Transaction,
  prevOutputIndex: number,
  changeAddress: mvc.Address,
  changeSatoshis: number,
  expected = true
) {
  const inputIndex = 0
  let preimage = getPreimage(tx, genesis.lockingScript, inputSatoshis, inputIndex, sigtype)
  let sig = signTx(tx, issuerPrivKey, genesis.lockingScript, inputSatoshis, inputIndex)

  // get input proof
  const [inputProofInfo, txHeader] = Common.getTxInputProof(genesisTx, prevInputIndex)
  const inputProof = new TxInputProof(inputProofInfo)

  // get prev output proof
  const prevOutputProof = Common.getTxOutputProof(prevGenesisTx, prevOutputIndex)

  const txContext = {
    tx: tx,
    inputIndex: inputIndex,
    inputSatoshis: inputSatoshis,
  }

  let result = genesis
    .unlock(
      new SigHashPreimage(toHex(preimage)),
      new PubKey(toHex(issuerPubKey)),
      new Sig(toHex(sig)),
      new Bytes(tokenScript.toHex()),
      // genesisTx input proof
      txHeader,
      prevInputIndex,
      inputProof,
      // prev genesis tx output proof
      prevOutputProof.txHeader,
      prevOutputProof.hashProof,
      prevOutputProof.satoshiBytes,
      // output
      inputSatoshis, // genesisSatoshis
      inputSatoshis, // tokenSatoshis
      new Ripemd160(changeAddress.hashBuffer.toString('hex')),
      changeSatoshis,
      new Bytes('') //opReturnScript
    )
    .verify(txContext)
  console.log({ result })

  if (expected === false) {
    expect(result.success, result.error).to.be.false
  } else {
    expect(result.success, result.error).to.be.true
  }
}

function createToken(genesis, contractData: Buffer, options: any = {}) {
  const tx = new mvc.Transaction()
  tx.version = Common.TX_VERSION
  if (options.wrongVersion) {
    tx.version = 1
  }

  const genesisScript = genesis.lockingScript
  const scriptBuf = genesisScript.toBuffer()
  const newScriptBuf = TokenProto.getNewGenesisScript(scriptBuf, genesisTxidBuf)

  let prevouts = []

  // input
  // genesis
  addInput(tx, genesisTx.id, 0, genesis.lockingScript, inputSatoshis, prevouts)

  // bsv
  addInput(
    tx,
    dummyTxId,
    0,
    mvc.Script.buildPublicKeyHashOut(issuerAddress),
    inputSatoshis,
    prevouts
  )

  // output
  // genesis
  addOutput(tx, mvc.Script.fromBuffer(newScriptBuf), inputSatoshis)

  // token
  const token = new Token(transferCheckCodeHashArray, unlockContractCodeHashArray)
  token.setDataPart(Common.buildScriptData(contractData).toString('hex'))
  const tokenScript = token.lockingScript
  addOutput(tx, tokenScript, inputSatoshis)

  const prevInputIndex = 0
  const prevOutputIndex = 0

  unlockGenesis(
    tx,
    genesis,
    tokenScript,
    genesisTx,
    prevInputIndex,
    prevGenesisTx,
    prevOutputIndex,
    address1,
    0,
    options.expected
  )

  return tx
}

describe('Test genesis contract unlock In Javascript', () => {
  before(async () => {
    let genesis = createGenesis(Buffer.alloc(36, 0))
    const genesisScript = genesis.lockingScript
    const scriptBuf = genesisScript.toBuffer()
    // console.log('old', scriptBuf.toString('hex'))
    // console.log('--------------------------------')
    // let genesisContract = TokenGenesisFactory.createContract()

    // genesisContract.setFormatedDataPart({
    //   tokenName: 'test token name',
    //   tokenSymbol: 'test',
    //   decimalNum: 8,
    //   tokenAddress: issuerAddress.hashBuffer,
    // })
    // console.log('new', genesisContract.lockingScript.toBuffer().toString('hex'))

    // create prevGenesisTx
    prevGenesisTx = new mvc.Transaction()
    prevGenesisTx.version = Common.TX_VERSION
    let prevouts = []
    addInput(
      prevGenesisTx,
      dummyTxId,
      0,
      mvc.Script.buildPublicKeyHashOut(issuerAddress),
      inputSatoshis,
      prevouts
    )

    addOutput(prevGenesisTx, mvc.Script.buildPublicKeyHashOut(issuerAddress), inputSatoshis)

    // create genesisTx
    genesisTx = new mvc.Transaction()
    genesisTx.version = Common.TX_VERSION
    addInput(
      genesisTx,
      prevGenesisTx.id,
      0,
      prevGenesisTx.outputs[0].script,
      inputSatoshis,
      prevouts
    )
    addOutput(genesisTx, genesis.lockingScript, inputSatoshis)

    genesisTxidBuf = Buffer.from(Common.genGenesisTxid(genesisTx.id, 0), 'hex')

    const newScriptBuf = TokenProto.getNewGenesisScript(scriptBuf, genesisTxidBuf)
    genesisHash = Common.getScriptHashBuf(newScriptBuf)

    let contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      address1.hashBuffer,
      buffValue,
      genesisHash,
      genesisTxidBuf,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
    ])

    let tx = createToken(genesis, contractData)

    prevGenesisTx = genesisTx
    genesisTx = tx
  })

  it('g1: should succeed when issue token', () => {
    // add genesis output
    let contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      address1.hashBuffer,
      buffValue,
      genesisHash,
      genesisTxidBuf,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
    ])
    // issue again
    const genesis = createGenesis(genesisTxidBuf)
    let tx = createToken(genesis, contractData)

    prevGenesisTx = genesisTx
    genesisTx = tx
    // issue again to test Backtrace.verify
    createToken(genesis, contractData)
  })

  it('g2: should failed when add wrong data length', () => {
    const contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
      address1.hashBuffer,
      buffValue,
      genesisHash,
      genesisTxidBuf,
      Buffer.alloc(1, 0),
    ])
    const genesis = createGenesis(genesisTxidBuf)
    createToken(genesis, contractData, { expected: false })
  })

  it('g3: should failed when get wrong tokenID', () => {
    const contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
      address1.hashBuffer,
      buffValue,
      genesisHash,
      Buffer.alloc(genesisTxidBuf.length, 0), // script code hash
    ])
    const genesis = createGenesis(genesisTxidBuf)
    createToken(genesis, contractData, { expected: false })
  })

  it('g4: should failed when get wrong genesisHash', () => {
    const contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
      address1.hashBuffer,
      buffValue,
      Buffer.alloc(20, 0), // genesisHash
      genesisTxidBuf,
    ])
    const genesis = createGenesis(genesisTxidBuf)
    createToken(genesis, contractData, { expected: false })
  })

  it('g5: should failed when get wrong tx version', () => {
    let contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      address1.hashBuffer,
      buffValue,
      genesisHash,
      genesisTxidBuf,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
    ])
    const genesis = createGenesis(genesisTxidBuf)
    createToken(genesis, contractData, { wrongVersion: true, expected: false })
  })
})
