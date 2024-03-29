import * as BN from '../../bn.js'
import * as mvc from '../../mvc'
import { ContractAdapter } from '../../common/ContractAdapter'
import {
  dummyAddress,
  dummyPadding,
  dummyPayload,
  dummyPk,
  dummyRabinPubKey,
  dummyRabinPubKeyHashArray,
  dummySigBE,
  dummyTx,
} from '../../common/dummy'
import { PROTO_TYPE } from '../../common/protoheader'
import { PLACE_HOLDER_SIG } from '../../common/utils'
import {
  buildContractClass,
  Bytes,
  FunctionCall,
  getPreimage,
  Int,
  PubKey,
  Ripemd160,
  Sig,
  SigHashPreimage,
  toHex,
} from '../../scryptlib'
import * as ftProto from '../contract-proto/token.proto'
import { TokenFactory } from './token'
const genesisTokenIDTxid = '0000000000000000000000000000000000000000000000000000000000000000'
export class TokenGenesis extends ContractAdapter {
  private constuctParams: {
    // pubKey: mvc.PublicKey
  }
  private _formatedDataPart: ftProto.FormatedDataPart

  // constructor(constuctParams: { pubKey: mvc.PublicKey }) {
  constructor(constuctParams: {}) {
    let desc = require('../contract-desc/tokenGenesis_desc.json')
    let ClassObj = buildContractClass(desc)
    let contract = new ClassObj()
    super(contract)

    this.constuctParams = constuctParams
    this._formatedDataPart = {}
  }

  clone() {
    let contract = new TokenGenesis(this.constuctParams)
    contract.setFormatedDataPart(this.getFormatedDataPart())
    return contract
  }

  public setFormatedDataPart(dataPart: ftProto.FormatedDataPart): void {
    this._formatedDataPart = Object.assign({}, this._formatedDataPart, dataPart)
    this._formatedDataPart.genesisHash = ''
    this._formatedDataPart.protoVersion = ftProto.PROTO_VERSION
    this._formatedDataPart.protoType = PROTO_TYPE.FT
    super.setDataPart(toHex(ftProto.newDataPart(this._formatedDataPart)))
  }

  public getFormatedDataPart() {
    return this._formatedDataPart
  }

  public setFormatedDataPartFromLockingScript(script: mvc.Script) {
    let dataPart = ftProto.parseDataPart(script.toBuffer())
    this.setFormatedDataPart(dataPart)
  }

  public isFirstGenesis() {
    return this.getFormatedDataPart().sensibleID.txid == genesisTokenIDTxid
  }

  public unlock({
    txPreimage,
    pubKey,
    sig,
    tokenScript,

    // GenesisTx Input Proof
    genesisTxHeader,
    prevInputIndex,
    genesisTxInputProof,

    // Prev GenesisTx Output Proof
    prevGenesisTxHeader,
    prevTxOutputHashProof,
    prevTxOutputSatoshiBytes,

    genesisSatoshis,
    tokenSatoshis,
    changeAddress,
    changeSatoshis,
    opReturnScript,
  }: {
    txPreimage: SigHashPreimage
    pubKey: PubKey
    sig: Sig
    tokenScript: Bytes

    genesisTxHeader: Bytes
    prevInputIndex: number
    genesisTxInputProof: Bytes

    prevGenesisTxHeader: Bytes
    prevTxOutputHashProof: Bytes
    prevTxOutputSatoshiBytes: Bytes

    genesisSatoshis: number
    tokenSatoshis: number
    changeAddress: Ripemd160
    changeSatoshis: number
    opReturnScript: Bytes
  }) {
    return this._contract.unlock(
      txPreimage,
      pubKey,
      sig,
      tokenScript,

      genesisTxHeader,
      prevInputIndex,
      genesisTxInputProof,

      prevGenesisTxHeader,
      prevTxOutputHashProof,
      prevTxOutputSatoshiBytes,

      genesisSatoshis,
      tokenSatoshis,
      changeAddress,
      changeSatoshis,
      opReturnScript
    ) as FunctionCall
  }
}

export class TokenGenesisFactory {
  public static lockingScriptSize: number

  public static getLockingScriptSize() {
    return this.lockingScriptSize
  }

  /**
   * create genesis contract
   * @param {Object} issuerPubKey issuer public key used to unlocking genesis contract
   * @param {string} tokenName the token name
   * @param {string} tokenSymbol the token symbol
   * @param {number} decimalNum the token amount decimal number
   * @returns
   */
  public static createContract() {
    return new TokenGenesis({})
  }

  public static getDummyInstance() {
    let contract = this.createContract()
    // contract.setFormatedDataPart({}) // TODO:
    contract.setDataPart('')
    return contract
  }
  public static calLockingScriptSize() {
    let contract = this.getDummyInstance()
    let size = contract.lockingScript.toBuffer().length
    return size
  }

  public static calUnlockingScriptSize(opreturnData) {
    let opreturnScriptHex = ''
    if (opreturnData) {
      let script = mvc.Script.buildSafeDataOut(opreturnData)
      opreturnScriptHex = script.toHex()
    }
    let contract = this.getDummyInstance()
    let tokenContract = TokenFactory.getDummyInstance()
    // const preimage = getPreimage(dummyTx, contract.lockingScript.toASM(), 1) // TODO: fix dummy

    return 10000

    // let unlockResult = contract.unlock({
    //   txPreimage: new SigHashPreimage(toHex(preimage)),
    //   sig: new Sig(toHex(sig)),
    //   rabinMsg: new Bytes(toHex(rabinMsg)),
    //   rabinPaddingArray,
    //   rabinSigArray,
    //   rabinPubKeyIndexArray,
    //   rabinPubKeyVerifyArray,
    //   rabinPubKeyHashArray: new Bytes(toHex(dummyRabinPubKeyHashArray)),
    //   genesisSatoshis: 1000,
    //   tokenScript: new Bytes(tokenContract.lockingScript.toHex()),
    //   tokenSatoshis: 1000,
    //   changeAddress: new Ripemd160(toHex(dummyAddress.hashBuffer)),
    //   changeSatoshis: 1000,
    //   opReturnScript: new Bytes(opreturnScriptHex),
    // })
    // return (unlockResult.toScript() as mvc.Script).toBuffer().length
  }
}
