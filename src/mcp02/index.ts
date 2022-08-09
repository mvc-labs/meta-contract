import { Bytes, Int, PubKey, Ripemd160, Sig, toHex, buildTypeClasses } from '../scryptlib'
import { CodeError, ErrCode } from '../common/error'
import { API_TARGET, API_NET, mvc, Api } from '..'
import { FEEB } from './constants'
import * as BN from '../bn.js'
import * as TokenUtil from '../common/tokenUtil'
import * as $ from '../common/argumentCheck'
import { Prevouts } from '../common/Prevouts'
import { TxComposer } from '../tx-composer'
import { TokenFactory } from './contract-factory/token'
import { ContractUtil } from './contractUtil'
import {
  getTxInputProof,
  getTxOutputProof,
  getUInt32Buf,
  loadDescription,
} from './deployments/common'
const jsonDescr = loadDescription('../contract-desc/txUtil_desc.json')
const { TxInputProof, TxOutputProof } = buildTypeClasses(jsonDescr)

import {
  CONTRACT_TYPE,
  P2PKH_UNLOCK_SIZE,
  PLACE_HOLDER_PUBKEY,
  PLACE_HOLDER_SIG,
} from '../common/utils'
import { TokenGenesisFactory } from './contract-factory/tokenGenesis'
import {
  TokenTransferCheckFactory,
  TOKEN_TRANSFER_TYPE,
} from './contract-factory/tokenTransferCheck'
import * as ftProto from './contract-proto/token.proto'
import { DustCalculator } from '../common/DustCalculator'
import { SizeTransaction } from '../common/SizeTransaction'
import { getEmptyTxOutputProof } from './deployments/common'
const Signature = mvc.crypto.Signature
const _ = mvc.deps._
export const sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID

ContractUtil.init()

function checkParamGenesis(genesis) {
  $.checkArgument(_.isString(genesis), 'Invalid Argument: genesis should be a string')
  $.checkArgument(genesis.length == 40, `Invalid Argument: genesis.length must be 40`)
}

function checkParamCodehash(codehash) {
  $.checkArgument(_.isString(codehash), 'Invalid Argument: codehash should be a string')
  $.checkArgument(codehash.length == 40, `Invalid Argument: codehash.length must be 40`)
  $.checkArgument(
    codehash == ContractUtil.tokenCodeHash,
    `a valid codehash should be ${ContractUtil.tokenCodeHash}, but the provided is ${codehash} `
  )
}

type Utxo = {
  txId: string
  outputIndex: number
  satoshis: number
  address: mvc.Address
}

type GenesisOptions = {
  tokenName: string
  tokenSymbol: string
  decimalNum: number
  genesisWif: string
}

type ParamUtxo = {
  txId: string
  outputIndex: number
  satoshis: number
  wif?: string
  address?: string | mvc.Address
}

type Purse = {
  privateKey: mvc.PrivateKey
  address: mvc.Address
}

type Mcp02Options = {
  network?: API_NET
  apiTarget?: API_TARGET
  purse?: string
  feeb?: number
  dustLimitFactor?: number
  dustAmount?: number
}

type TokenReceiver = {
  address: string
  amount: string
}

type ParamFtUtxo = {
  txId: string
  outputIndex: number
  tokenAddress: string
  tokenAmount: string
  wif?: string
}

type FtUtxo = {
  txId: string
  outputIndex: number
  satoshis?: number
  lockingScript?: mvc.Script

  tokenAddress?: mvc.Address
  tokenAmount?: BN

  satotxInfo?: {
    txId?: string
    outputIndex?: number
    txHex?: string
    preTxId?: string
    preOutputIndex?: number
    preTxHex?: string
  }

  preTokenAddress?: mvc.Address
  preTokenAmount?: BN
  preLockingScript?: mvc.Script

  prevTokenTx?: any
  prevTokenInputIndex?: any
  prevTokenOutputIndex?: any

  publicKey?: mvc.PublicKey
}

export class FtManager {
  private network: API_NET
  private _api: Api
  private zeroAddress: mvc.Address
  private purse: Purse
  private feeb: number
  private dustCalculator?: DustCalculator
  transferCheckCodeHashArray: Bytes[]
  unlockContractCodeHashArray: Bytes[]

  get api() {
    return this._api
  }

  constructor({
    network = API_NET.MAIN,
    apiTarget = API_TARGET.MVC,
    purse,
    feeb = FEEB,
    dustLimitFactor = 300,
    dustAmount,
  }: Mcp02Options) {
    // 初始化API
    this.network = network
    this._api = new Api(network, apiTarget)

    // 初始化钱包
    if (purse) {
      const privateKey = mvc.PrivateKey.fromWIF(purse)
      const address = privateKey.toAddress(network)
      this.purse = {
        privateKey,
        address,
      }
    }

    // 初始化零地址
    this.zeroAddress = new mvc.Address('1111111111111111111114oLvT2')
    this.dustCalculator = new DustCalculator(dustLimitFactor, dustAmount)
    this.transferCheckCodeHashArray = ContractUtil.transferCheckCodeHashArray
    this.unlockContractCodeHashArray = ContractUtil.unlockContractCodeHashArray

    // 初始化费率
    this.feeb = feeb
  }

  /**
   * Get codehash and genesis from genesis tx.
   * @param genesisTx genesis tx
   * @param genesisOutputIndex (Optional) outputIndex - default value is 0.
   * @returns
   */
  public getCodehashAndGensisByTx(genesisTx: mvc.Transaction, genesisOutputIndex: number = 0) {
    //calculate genesis/codehash
    let genesis: string, codehash: string, sensibleId: string
    let genesisTxId = genesisTx.id
    let genesisLockingScriptBuf = genesisTx.outputs[genesisOutputIndex].script.toBuffer()
    const dataPartObj: any = ftProto.parseDataPart(genesisLockingScriptBuf)
    // dataPartObj.sensibleID = {
    //   txid: genesisTxId,
    //   index: genesisOutputIndex,
    // }
    dataPartObj.address = this.purse.address
    genesisLockingScriptBuf = ftProto.updateScript(genesisLockingScriptBuf, dataPartObj)

    let tokenContract = TokenFactory.createContract(
      this.transferCheckCodeHashArray,
      this.unlockContractCodeHashArray
    )

    tokenContract.setFormatedDataPart({
      // rabinPubKeyHashArrayHash: toHex(this.rabinPubKeyHashArrayHash),
      // sensibleID: {
      //   txid: genesisTxId,
      //   index: genesisOutputIndex,
      // },
      genesisHash: toHex(TokenUtil.getScriptHashBuf(genesisLockingScriptBuf)),
    })

    let scriptBuf = tokenContract.lockingScript.toBuffer()
    genesis = ftProto.getQueryGenesis(scriptBuf)
    codehash = tokenContract.getCodeHash()
    // sensibleId = toHex(TokenUtil.getOutpointBuf(genesisTxId, genesisOutputIndex))

    return { codehash, genesis }
  }

  /**
   * Create a transaction for genesis
   * @param tokenName token name, limited to 20 bytes
   * @param tokenSymbol the token symbol, limited to 10 bytes
   * @param decimalNum the decimal number, range 0-255
   * @param utxos (Optional) specify mvc utxos
   * @param changeAddress (Optional) specify mvc changeAddress
   * @param opreturnData (Optional) append an opReturn output
   * @param genesisWif the private key of the token genesiser
   * @param noBroadcast (Optional) whether not to broadcast the transaction, the default is false
   * @returns
   */
  public async genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    changeAddress,
    opreturnData,
    noBroadcast = false,
  }: {
    tokenName: string
    tokenSymbol: string
    decimalNum: number
    utxos?: ParamUtxo[]
    changeAddress?: string | mvc.Address
    opreturnData?: any
    noBroadcast?: boolean
  }) {
    // TODO 检查必要参数
    // validate params
    $.checkArgument(
      _.isString(tokenName) && Buffer.from(tokenName).length <= 20,
      `tokenName should be a string and not be larger than 20 bytes`
    )

    $.checkArgument(
      _.isString(tokenSymbol) && Buffer.from(tokenSymbol).length <= 10,
      'tokenSymbol should be a string and not be larger than 10 bytes'
    )

    $.checkArgument(
      _.isNumber(decimalNum) && decimalNum >= 0 && decimalNum <= 255,
      'decimalNum should be a number and must be between 0 and 255'
    )

    let utxoInfo = await this._pretreatUtxos(utxos)
    if (changeAddress) {
      changeAddress = new mvc.Address(changeAddress, this.network)
    } else {
      changeAddress = utxoInfo.utxos[0].address
    }

    let { txComposer } = await this._genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress: changeAddress as mvc.Address,
      opreturnData,
    })

    let txHex = txComposer.getRawHex()
    if (!noBroadcast) {
      await this.api.broadcast(txHex)
    }

    let { codehash, genesis } = this.getCodehashAndGensisByTx(txComposer.getTx())
    return {
      txHex,
      txid: txComposer.getTxId(),
      tx: txComposer.getTx(),
      codehash,
      genesis,
    }
  }

  public async issue(options: {
    genesis: string
    codehash: string
    sensibleId: string
    genesisWif: string
    receiverAddress: string | mvc.Address
    tokenAmount: string | BN
    allowIncreaseIssues: boolean
    utxos?: ParamUtxo[]
    changeAddress?: string | mvc.Address
    opreturnData?: any
    noBroadcast?: boolean
  }) {
    return this.mint(options)
  }

  public async mint({
    genesis,
    codehash,
    sensibleId,
    genesisWif,
    receiverAddress,
    tokenAmount,
    allowIncreaseIssues = true,
    utxos,
    changeAddress,
    opreturnData,
    noBroadcast = false,
  }: {
    genesis: string
    codehash: string
    sensibleId: string
    genesisWif: string
    receiverAddress: string | mvc.Address
    tokenAmount: string | BN
    allowIncreaseIssues: boolean
    utxos?: ParamUtxo[]
    changeAddress?: string | mvc.Address
    opreturnData?: any
    noBroadcast?: boolean
  }) {
    checkParamGenesis(genesis)
    checkParamCodehash(codehash)
    $.checkArgument(sensibleId, 'sensibleId is required')
    $.checkArgument(genesisWif, 'genesisWif is required')
    $.checkArgument(receiverAddress, 'receiverAddress is required')
    $.checkArgument(tokenAmount, 'tokenAmount is required')

    let utxoInfo = await this._pretreatUtxos(utxos)
    if (changeAddress) {
      changeAddress = new mvc.Address(changeAddress, this.network)
    } else {
      changeAddress = utxoInfo.utxos[0].address
    }
    let genesisPrivateKey = new mvc.PrivateKey(genesisWif)
    let genesisPublicKey = genesisPrivateKey.toPublicKey()
    receiverAddress = new mvc.Address(receiverAddress, this.network)
    tokenAmount = new BN(tokenAmount.toString())
  }

  private async _mint({
    genesis,
    codehash,
    sensibleId,
    receiverAddress,
    tokenAmount,
    allowIncreaseIssues = true,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    opreturnData,
    genesisPrivateKey,
    genesisPublicKey,
  }: {
    genesis: string
    codehash: string
    sensibleId: string
    receiverAddress: mvc.Address
    tokenAmount: BN
    allowIncreaseIssues: boolean
    utxos?: Utxo[]
    utxoPrivateKeys?: mvc.PrivateKey[]
    changeAddress?: mvc.Address
    opreturnData?: any
    noBroadcast?: boolean
    genesisPrivateKey?: mvc.PrivateKey
    genesisPublicKey: mvc.PublicKey
  }) {}

  public async merge() {}

  private async _pretreatUtxos(
    paramUtxos?: ParamUtxo[]
  ): Promise<{ utxos: Utxo[]; utxoPrivateKeys: mvc.PrivateKey[] }> {
    let utxoPrivateKeys = []
    let utxos: Utxo[] = []

    //If utxos are not provided, use purse to fetch utxos
    if (!paramUtxos) {
      if (!this.purse)
        throw new CodeError(ErrCode.EC_INVALID_ARGUMENT, 'Utxos or Purse must be provided.')
      paramUtxos = await this.api.getUnspents(this.purse.address.toString())
      paramUtxos.forEach((v) => {
        utxoPrivateKeys.push(this.purse.privateKey)
      })
    } else {
      paramUtxos.forEach((v) => {
        if (v.wif) {
          let privateKey = new mvc.PrivateKey(v.wif)
          utxoPrivateKeys.push(privateKey)
          v.address = privateKey.toAddress(this.network).toString() //Compatible with the old version, only wif is provided but no address is provided
        }
      })
    }
    paramUtxos.forEach((v) => {
      utxos.push({
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
        address: new mvc.Address(v.address, this.network),
      })
    })

    if (utxos.length == 0) throw new CodeError(ErrCode.EC_INSUFFICIENT_BSV, 'Insufficient balance.')
    return { utxos, utxoPrivateKeys }
  }

  /**
   * Estimate the cost of genesis
   * @param opreturnData
   * @param utxoMaxCount Maximum number of BSV UTXOs supported
   * @returns
   */
  public async getGenesisEstimateFee({
    opreturnData,
    utxoMaxCount = 10,
  }: {
    opreturnData?: any
    utxoMaxCount?: number
  }) {
    const p2pkhInputNum = utxoMaxCount
    const sizeOfTokenGenesis = TokenGenesisFactory.getLockingScriptSize()
    let stx = new SizeTransaction(this.feeb, this.dustCalculator)
    for (let i = 0; i < p2pkhInputNum; i++) {
      stx.addP2PKHInput()
    }
    stx.addOutput(sizeOfTokenGenesis)
    if (opreturnData) {
      stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
    }
    stx.addP2PKHOutput()
    return stx.getFee()
  }

  private async _genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    opreturnData,
  }: {
    tokenName: string
    tokenSymbol: string
    decimalNum: number
    utxos?: Utxo[]
    utxoPrivateKeys?: mvc.PrivateKey[]
    changeAddress?: mvc.Address
    opreturnData?: any
  }) {
    //create genesis contract
    let genesisContract = TokenGenesisFactory.createContract()
    genesisContract.setFormatedDataPart({
      tokenName,
      tokenSymbol,
      decimalNum,
      address: this.purse.address,
    })
    let estimateSatoshis = await this.getGenesisEstimateFee({
      opreturnData,
      utxoMaxCount: utxos.length,
    })
    const balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
    if (balance < estimateSatoshis) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_BSV,
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
      )
    }
    const txComposer = new TxComposer()
    const p2pkhInputIndexs = utxos.map((utxo) => {
      const inputIndex = txComposer.appendP2PKHInput(utxo)
      txComposer.addSigHashInfo({
        inputIndex,
        address: utxo.address.toString(),
        sighashType,
        contractType: CONTRACT_TYPE.P2PKH,
      })
      return inputIndex
    })

    const genesisOutputIndex = txComposer.appendOutput({
      lockingScript: genesisContract.lockingScript,
      satoshis: this.getDustThreshold(genesisContract.lockingScript.toBuffer().length),
    })

    //If there is opReturn, add it to the second output
    if (opreturnData) {
      txComposer.appendOpReturnOutput(opreturnData)
    }

    txComposer.appendChangeOutput(changeAddress, this.feeb)
    if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
      p2pkhInputIndexs.forEach((inputIndex) => {
        let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        txComposer.unlockP2PKHInput(privateKey, inputIndex)
      })
    }

    this._checkTxFeeRate(txComposer)

    return { txComposer }
  }

  public async transfer({
    codehash,
    genesis,
    receivers,

    senderWif,
    ftUtxos,
    ftChangeAddress,

    utxos,
    changeAddress,

    middleChangeAddress,
    middlePrivateKey,

    minUtxoSet = true,
    isMerge,
    opreturnData,
    noBroadcast = false,
  }: {
    codehash: string
    genesis: string
    receivers?: TokenReceiver[]

    senderWif?: string
    ftUtxos?: ParamFtUtxo[]
    ftChangeAddress?: string | mvc.Address

    utxos?: ParamUtxo[]
    changeAddress?: string | mvc.Address

    middleChangeAddress?: string | mvc.Address
    middlePrivateKey?: string | mvc.PrivateKey

    minUtxoSet?: boolean
    isMerge?: boolean
    opreturnData?: any
    noBroadcast?: boolean
  }): Promise<{
    tx: mvc.Transaction
    txHex: string
    txid: string
    routeCheckTx: mvc.Transaction
    routeCheckTxHex: string
  }> {
    // checkParamGenesis(genesis)
    // checkParamCodehash(codehash)
    // checkParamReceivers(receivers)

    let senderPrivateKey: mvc.PrivateKey
    let senderPublicKey: mvc.PublicKey
    if (senderWif) {
      senderPrivateKey = new mvc.PrivateKey(senderWif)
    }

    let utxoInfo = await this._pretreatUtxos(utxos)
    if (changeAddress) {
      changeAddress = new mvc.Address(changeAddress, this.network)
    } else {
      changeAddress = utxoInfo.utxos[0].address as mvc.Address
    }

    if (middleChangeAddress) {
      middleChangeAddress = new mvc.Address(middleChangeAddress, this.network)
      middlePrivateKey = new mvc.PrivateKey(middlePrivateKey)
    } else {
      middleChangeAddress = utxoInfo.utxos[0].address as mvc.Address
      middlePrivateKey = utxoInfo.utxoPrivateKeys[0]
    }

    let ftUtxoInfo = await this._pretreatFtUtxos(
      ftUtxos,
      codehash,
      genesis,
      senderPrivateKey,
      senderPublicKey
    )
    if (ftChangeAddress) {
      ftChangeAddress = new mvc.Address(ftChangeAddress, this.network)
    } else {
      ftChangeAddress = ftUtxoInfo.ftUtxos[0].tokenAddress as mvc.Address
    }

    let { txComposer, transferCheckTxComposer } = await this._transfer({
      codehash,
      genesis,
      receivers,
      ftUtxos: ftUtxoInfo.ftUtxos,
      ftPrivateKeys: ftUtxoInfo.ftUtxoPrivateKeys,
      ftChangeAddress,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
      opreturnData,
      isMerge,
      middleChangeAddress,
      middlePrivateKey,
      minUtxoSet,
    })
    let routeCheckTxHex = transferCheckTxComposer.getRawHex()
    let txHex = txComposer.getRawHex()

    if (!noBroadcast) {
      await this.api.broadcast(routeCheckTxHex)
      await this.api.broadcast(txHex)
    }

    return {
      tx: txComposer.getTx(),
      txHex,
      routeCheckTx: transferCheckTxComposer.getTx(),
      routeCheckTxHex,
      txid: txComposer.getTxId(),
    }
  }

  private async _pretreatFtUtxos(
    paramFtUtxos: ParamFtUtxo[],
    codehash?: string,
    genesis?: string,
    senderPrivateKey?: mvc.PrivateKey,
    senderPublicKey?: mvc.PublicKey
  ): Promise<{ ftUtxos: FtUtxo[]; ftUtxoPrivateKeys: mvc.PrivateKey[] }> {
    let ftUtxos: FtUtxo[] = []
    let ftUtxoPrivateKeys = []

    let publicKeys = []
    if (!paramFtUtxos) {
      if (senderPrivateKey) {
        senderPublicKey = senderPrivateKey.toPublicKey()
      }
      if (!senderPublicKey)
        throw new CodeError(
          ErrCode.EC_INVALID_ARGUMENT,
          'ftUtxos or senderPublicKey or senderPrivateKey must be provided.'
        )

      paramFtUtxos = await this.api.getFungibleTokenUnspents(
        codehash,
        genesis,
        senderPublicKey.toAddress(this.network).toString(),
        20
      )

      paramFtUtxos.forEach((v) => {
        if (senderPrivateKey) {
          ftUtxoPrivateKeys.push(senderPrivateKey)
        }
        publicKeys.push(senderPublicKey)
      })
    } else {
      paramFtUtxos.forEach((v) => {
        if (v.wif) {
          let privateKey = new mvc.PrivateKey(v.wif)
          ftUtxoPrivateKeys.push(privateKey)
          publicKeys.push(privateKey.toPublicKey())
        }
      })
    }

    paramFtUtxos.forEach((v, index) => {
      ftUtxos.push({
        txId: v.txId,
        outputIndex: v.outputIndex,
        tokenAddress: new mvc.Address(v.tokenAddress, this.network),
        tokenAmount: new BN(v.tokenAmount.toString()),
        publicKey: publicKeys[index],
      })
    })

    if (ftUtxos.length == 0) throw new CodeError(ErrCode.EC_INSUFFICIENT_FT, 'Insufficient token.')

    return { ftUtxos, ftUtxoPrivateKeys }
  }

  private async _prepareTransferTokens({
    codehash,
    genesis,
    receivers,
    ftUtxos,
    ftChangeAddress,
    isMerge,
    minUtxoSet,
  }: {
    codehash: string
    genesis: string
    receivers?: TokenReceiver[]
    ftUtxos: FtUtxo[]
    ftChangeAddress: mvc.Address
    isMerge?: boolean
    minUtxoSet: boolean
  }) {
    let mergeUtxos: FtUtxo[] = []
    let mergeTokenAmountSum: BN = BN.Zero
    if (isMerge) {
      mergeUtxos = ftUtxos.slice(0, 20)
      mergeTokenAmountSum = mergeUtxos.reduce((pre, cur) => cur.tokenAmount.add(pre), BN.Zero)
      receivers = [
        {
          address: ftChangeAddress.toString(),
          amount: mergeTokenAmountSum.toString(),
        },
      ]
    }

    let tokenOutputArray = receivers.map((v) => ({
      address: new mvc.Address(v.address, this.network),
      tokenAmount: new BN(v.amount.toString()),
    }))

    let outputTokenAmountSum = tokenOutputArray.reduce(
      (pre, cur) => cur.tokenAmount.add(pre),
      BN.Zero
    )

    let inputTokenAmountSum = BN.Zero
    let _ftUtxos = []
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i]
      _ftUtxos.push(ftUtxo)
      inputTokenAmountSum = ftUtxo.tokenAmount.add(inputTokenAmountSum)
      if (minUtxoSet && inputTokenAmountSum.gte(outputTokenAmountSum)) {
        break
      }
    }

    if (isMerge) {
      _ftUtxos = mergeUtxos
      inputTokenAmountSum = mergeTokenAmountSum
      if (mergeTokenAmountSum.eq(BN.Zero)) {
        throw new CodeError(ErrCode.EC_INNER_ERROR, 'No utxos to merge.')
      }
    }

    //Decide whether to change the token
    let changeTokenAmount = inputTokenAmountSum.sub(outputTokenAmountSum)
    if (changeTokenAmount.gt(BN.Zero)) {
      tokenOutputArray.push({
        address: ftChangeAddress,
        tokenAmount: changeTokenAmount,
      })
    }

    if (inputTokenAmountSum.lt(outputTokenAmountSum)) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_FT,
        `Insufficient token. Need ${outputTokenAmountSum} But only ${inputTokenAmountSum}`
      )
    }

    ftUtxos = _ftUtxos
    await this.perfectFtUtxosInfo(ftUtxos, codehash, genesis)

    let tokenInputArray = ftUtxos

    //Choose a transfer plan
    let inputLength = tokenInputArray.length
    let outputLength = tokenOutputArray.length
    // let tokenTransferType = TokenTransferCheckFactory.getOptimumType(inputLength, outputLength)
    // if (tokenTransferType == TOKEN_TRANSFER_TYPE.UNSUPPORT) {
    //   throw new CodeError(
    //     ErrCode.EC_TOO_MANY_FT_UTXOS,
    //     'Too many token-utxos, should merge them to continue.'
    //   )
    // }
    let tokenTransferType = TOKEN_TRANSFER_TYPE.IN_3_OUT_3

    return {
      tokenInputArray,
      tokenOutputArray,
      tokenTransferType,
    }
  }

  private async perfectFtUtxosInfo(
    ftUtxos: FtUtxo[],
    codehash: string,
    genesis: string
  ): Promise<FtUtxo[]> {
    //Cache txHex to prevent redundant queries
    let cachedHexs: {
      [txid: string]: { waitingRes?: Promise<string>; hex?: string }
    } = {}

    //Get txHex
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i]
      if (!cachedHexs[ftUtxo.txId]) {
        cachedHexs[ftUtxo.txId] = {
          waitingRes: this.api.getRawTxData(ftUtxo.txId), //async request
        }
      }
    }
    for (let id in cachedHexs) {
      //Wait for all async requests to complete
      if (cachedHexs[id].waitingRes && !cachedHexs[id].hex) {
        cachedHexs[id].hex = await cachedHexs[id].waitingRes
      }
    }
    ftUtxos.forEach((v) => {
      v.satotxInfo = v.satotxInfo || {}
      v.satotxInfo.txHex = cachedHexs[v.txId].hex
      v.satotxInfo.txId = v.txId
      v.satotxInfo.outputIndex = v.outputIndex
    })

    //Get preTxHex
    let curDataPartObj: ftProto.FormatedDataPart
    for (let i = 0; i < ftUtxos.length; i++) {
      let ftUtxo = ftUtxos[i]
      const tx = new mvc.Transaction(ftUtxo.satotxInfo.txHex)
      if (!curDataPartObj) {
        let tokenScript = tx.outputs[ftUtxo.outputIndex].script
        curDataPartObj = ftProto.parseDataPart(tokenScript.toBuffer())
      }
      //Find a valid preTx
      let input = tx.inputs.find((input) => {
        let script = new mvc.Script(input.script)
        if (script.chunks.length > 0) {
          const lockingScriptBuf = TokenUtil.getLockingScriptFromPreimage(script.chunks[0].buf)
          if (lockingScriptBuf) {
            if (ftProto.getQueryGenesis(lockingScriptBuf) == genesis) {
              return true
            }
            let dataPartObj = ftProto.parseDataPart(lockingScriptBuf)
            dataPartObj.sensibleID = curDataPartObj.sensibleID
            const newScriptBuf = ftProto.updateScript(lockingScriptBuf, dataPartObj)

            let genesisHash = toHex(mvc.crypto.Hash.sha256ripemd160(newScriptBuf))
            if (genesisHash == curDataPartObj.genesisHash) {
              return true
            }
          }
        }
      })
      if (!input)
        throw new CodeError(ErrCode.EC_INNER_ERROR, 'There is no valid preTx of the ftUtxo. ')
      let preTxId = input.prevTxId.toString('hex')
      let preOutputIndex = input.outputIndex
      ftUtxo.satotxInfo.preTxId = preTxId
      ftUtxo.satotxInfo.preOutputIndex = preOutputIndex

      ftUtxo.satoshis = tx.outputs[ftUtxo.outputIndex].satoshis
      ftUtxo.lockingScript = tx.outputs[ftUtxo.outputIndex].script

      // 新增字段 prevTokenInputIndex, prevTokenOutputIndex
      ftUtxo.prevTokenOutputIndex = input.outputIndex
      ftUtxo.prevTokenInputIndex = input.sequenceNumber // ??

      if (!cachedHexs[preTxId]) {
        cachedHexs[preTxId] = {
          waitingRes: this.api.getRawTxData(preTxId),
        }
      }
    }
    for (let id in cachedHexs) {
      //Wait for all async requests to complete
      if (cachedHexs[id].waitingRes && !cachedHexs[id].hex) {
        cachedHexs[id].hex = await cachedHexs[id].waitingRes
      }
    }
    ftUtxos.forEach((v) => {
      v.satotxInfo.preTxHex = cachedHexs[v.satotxInfo.preTxId].hex

      const preTx = new mvc.Transaction(v.satotxInfo.preTxHex)
      let dataPartObj = ftProto.parseDataPart(
        preTx.outputs[v.satotxInfo.preOutputIndex].script.toBuffer()
      )
      v.preTokenAmount = new BN(dataPartObj.tokenAmount.toString())
      if (dataPartObj.tokenAddress == '0000000000000000000000000000000000000000') {
        v.preTokenAddress = this.zeroAddress
      } else {
        v.preTokenAddress = mvc.Address.fromPublicKeyHash(
          Buffer.from(dataPartObj.tokenAddress, 'hex'),
          this.network
        )
      }
      v.preLockingScript = preTx.outputs[v.satotxInfo.preOutputIndex].script

      // 新增字段 prevTokenTx,
      v.prevTokenTx = preTx
    })

    // ftUtxos.forEach((v) => {
    //   v.preTokenAmount = new BN(v.preTokenAmount.toString())
    // })

    return ftUtxos
  }

  private async _transfer({
    codehash,
    genesis,

    receivers,

    ftUtxos,
    ftPrivateKeys,
    ftChangeAddress,

    utxos,
    utxoPrivateKeys,
    changeAddress,

    middlePrivateKey,
    middleChangeAddress,

    isMerge,
    opreturnData,
    minUtxoSet,
  }: {
    codehash: string
    genesis: string

    receivers?: TokenReceiver[]

    ftUtxos: FtUtxo[]
    ftPrivateKeys: mvc.PrivateKey[]
    ftChangeAddress: mvc.Address

    utxos: Utxo[]
    utxoPrivateKeys: mvc.PrivateKey[]
    changeAddress: mvc.Address

    middlePrivateKey?: mvc.PrivateKey
    middleChangeAddress: mvc.Address

    isMerge?: boolean
    opreturnData?: any
    minUtxoSet: boolean
  }) {
    if (utxos.length > 3) {
      throw new CodeError(
        ErrCode.EC_UTXOS_MORE_THAN_3,
        'Bsv utxos should be no more than 3 in the transfer operation, please merge it first '
      )
    }

    if (!middleChangeAddress) {
      middleChangeAddress = utxos[0].address
      middlePrivateKey = utxoPrivateKeys[0]
    }

    let { tokenInputArray, tokenOutputArray, tokenTransferType } =
      await this._prepareTransferTokens({
        codehash,
        genesis,
        receivers,
        ftUtxos,
        ftChangeAddress,
        isMerge,
        minUtxoSet,
      })

    let estimateSatoshis = this._calTransferEstimateFee({
      p2pkhInputNum: utxos.length,
      tokenInputArray,
      tokenOutputArray,
      tokenTransferType,
      opreturnData,
    })

    const balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
    if (balance < estimateSatoshis) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_BSV,
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
      )
    }

    ftUtxos = tokenInputArray
    const defaultFtUtxo = tokenInputArray[0]
    const ftUtxoTx = new mvc.Transaction(defaultFtUtxo.satotxInfo.txHex)
    const tokenLockingScript = ftUtxoTx.outputs[defaultFtUtxo.outputIndex].script

    //create routeCheck contract
    let tokenTransferCheckContract = TokenTransferCheckFactory.createContract(tokenTransferType)

    tokenTransferCheckContract.setFormatedDataPart({
      nSenders: tokenInputArray.length,
      receiverTokenAmountArray: tokenOutputArray.map((v) => v.tokenAmount),

      receiverArray: tokenOutputArray.map((v) => v.address),
      nReceivers: tokenOutputArray.length,
      tokenCodeHash: toHex(ftProto.getContractCodeHash(tokenLockingScript.toBuffer())),
      tokenID: toHex(ftProto.getTokenID(tokenLockingScript.toBuffer())),
    })

    const transferCheckTxComposer = new TxComposer()

    //tx addInput utxo
    const transferCheck_p2pkhInputIndexs = utxos.map((utxo) => {
      const inputIndex = transferCheckTxComposer.appendP2PKHInput(utxo as any)
      transferCheckTxComposer.addSigHashInfo({
        inputIndex,
        address: utxo.address.toString(),
        sighashType,
        contractType: CONTRACT_TYPE.P2PKH,
      })
      return inputIndex
    })

    const transferCheckOutputIndex = transferCheckTxComposer.appendOutput({
      lockingScript: tokenTransferCheckContract.lockingScript,
      satoshis: this.getDustThreshold(tokenTransferCheckContract.lockingScript.toBuffer().length),
    })

    let changeOutputIndex = transferCheckTxComposer.appendChangeOutput(
      middleChangeAddress,
      this.feeb
    )

    let unsignSigPlaceHolderSize = 0
    if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
      transferCheck_p2pkhInputIndexs.forEach((inputIndex) => {
        let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        transferCheckTxComposer.unlockP2PKHInput(privateKey, inputIndex)
      })
    } else {
      //To supplement the size calculation when unsigned
      transferCheck_p2pkhInputIndexs.forEach((v) => {
        unsignSigPlaceHolderSize += P2PKH_UNLOCK_SIZE
      })
      //Each ftUtxo need to unlock with the size
      unsignSigPlaceHolderSize = unsignSigPlaceHolderSize * ftUtxos.length
    }

    utxos = [
      {
        txId: transferCheckTxComposer.getTxId(),
        satoshis: transferCheckTxComposer.getOutput(changeOutputIndex).satoshis,
        outputIndex: changeOutputIndex,
        address: middleChangeAddress,
      },
    ]
    utxoPrivateKeys = utxos.map((v) => middlePrivateKey).filter((v) => v)

    let transferCheckUtxo = {
      txId: transferCheckTxComposer.getTxId(),
      outputIndex: transferCheckOutputIndex,
      satoshis: transferCheckTxComposer.getOutput(transferCheckOutputIndex).satoshis,
      lockingScript: transferCheckTxComposer.getOutput(transferCheckOutputIndex).script,
    }

    let transferCheckTx = transferCheckTxComposer.getTx()

    const txComposer = new TxComposer()
    let prevouts = new Prevouts()

    let inputTokenScript: mvc.Script
    let inputTokenAmountArray = Buffer.alloc(0)
    let inputTokenAddressArray = Buffer.alloc(0)

    const ftUtxoInputIndexs = ftUtxos.map((ftUtxo) => {
      const inputIndex = txComposer.appendInput(ftUtxo)
      prevouts.addVout(ftUtxo.txId, ftUtxo.outputIndex)
      txComposer.addSigHashInfo({
        inputIndex,
        address: ftUtxo.tokenAddress.toString(),
        sighashType,
        contractType: CONTRACT_TYPE.BCP02_TOKEN,
      })
      inputTokenScript = ftUtxo.lockingScript
      inputTokenAddressArray = Buffer.concat([
        inputTokenAddressArray,
        ftUtxo.tokenAddress.hashBuffer,
      ])

      inputTokenAmountArray = Buffer.concat([
        inputTokenAmountArray,
        ftUtxo.tokenAmount.toBuffer({
          endian: 'little',
          size: 8,
        }),
      ])
      return inputIndex
    })

    //tx addInput utxo
    const p2pkhInputIndexs = utxos.map((utxo) => {
      const inputIndex = txComposer.appendP2PKHInput(utxo as any)
      prevouts.addVout(utxo.txId, utxo.outputIndex)
      txComposer.addSigHashInfo({
        inputIndex,
        address: utxo.address.toString(),
        sighashType,
        contractType: CONTRACT_TYPE.P2PKH,
      })
      return inputIndex
    })

    //添加routeCheck为最后一个输入
    const transferCheckInputIndex = txComposer.appendInput(transferCheckUtxo)
    prevouts.addVout(transferCheckUtxo.txId, transferCheckUtxo.outputIndex)

    let recervierArray = Buffer.alloc(0)
    let receiverTokenAmountArray = Buffer.alloc(0)
    let outputSatoshiArray = Buffer.alloc(0)
    const tokenOutputLen = tokenOutputArray.length

    for (let i = 0; i < tokenOutputLen; i++) {
      const tokenOutput = tokenOutputArray[i]
      const address = tokenOutput.address
      const outputTokenAmount = tokenOutput.tokenAmount

      const lockingScriptBuf = ftProto.getNewTokenScript(
        inputTokenScript.toBuffer(),
        address.hashBuffer,
        outputTokenAmount
      )
      let outputIndex = txComposer.appendOutput({
        lockingScript: mvc.Script.fromBuffer(lockingScriptBuf),
        satoshis: this.getDustThreshold(lockingScriptBuf.length),
      })
      recervierArray = Buffer.concat([recervierArray, address.hashBuffer])
      const tokenBuf = outputTokenAmount.toBuffer({
        endian: 'little',
        size: 8,
      })
      receiverTokenAmountArray = Buffer.concat([receiverTokenAmountArray, tokenBuf])
      const satoshiBuf = BN.fromNumber(txComposer.getOutput(outputIndex).satoshis).toBuffer({
        endian: 'little',
        size: 8,
      })
      outputSatoshiArray = Buffer.concat([outputSatoshiArray, satoshiBuf])
    }

    //tx addOutput OpReturn
    let opreturnScriptHex = ''
    if (opreturnData) {
      const opreturnOutputIndex = txComposer.appendOpReturnOutput(opreturnData)
      opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
    }

    //The first round of calculations get the exact size of the final transaction, and then change again
    //Due to the change, the script needs to be unlocked again in the second round
    //let the fee to be exact in the second round
    for (let c = 0; c < 2; c++) {
      txComposer.clearChangeOutput()
      const changeOutputIndex = txComposer.appendChangeOutput(
        changeAddress,
        this.feeb,
        unsignSigPlaceHolderSize
      )

      let tokenTxHeaderArray = Buffer.alloc(0)
      let tokenTxHashProofArray = Buffer.alloc(0)
      let tokenSatoshiBytesArray = Buffer.alloc(0)

      ftUtxoInputIndexs.forEach((inputIndex, idx) => {
        let ftUtxo = ftUtxos[idx]
        let senderPrivateKey = ftPrivateKeys[idx]

        let dataPartObj = ftProto.parseDataPart(ftUtxo.lockingScript.toBuffer())
        const dataPart = ftProto.newDataPart(dataPartObj)

        const tokenContract = TokenFactory.createContract(
          this.transferCheckCodeHashArray,
          this.unlockContractCodeHashArray
        )
        const amountCheckTx = transferCheckTxComposer.getTx()
        const amountCheckOutputIndex = 0
        const amountCheckTxOutputProofInfo = new TxOutputProof(
          getTxOutputProof(amountCheckTx, amountCheckOutputIndex)
        )
        const amountCheckScriptBuf = amountCheckTx.outputs[amountCheckOutputIndex].script.toBuffer()

        const prevTokenInputIndex = ftUtxo.prevTokenInputIndex // ???
        const prevTokenAddress = new Bytes(toHex(ftUtxo.preTokenAddress.hashBuffer))
        // const prevTokenAddress = new Bytes(TokenProto.getTokenAddress(scriptBuf).toString('hex'))
        const prevTokenAmount = new Int(ftUtxo.preTokenAmount.toString(10))
        // const prevTokenAmount = TokenProto.getTokenAmount(scriptBuf)

        const tokenTx = new mvc.Transaction(ftUtxo.satotxInfo.txHex)
        const inputRes = getTxInputProof(tokenTx, prevTokenInputIndex)
        const tokenTxInputProof = new TxInputProof(inputRes[0])
        const tokenTxHeader = inputRes[1]
        const prevTokenTxOutputProof = new TxOutputProof(
          getTxOutputProof(ftUtxo.prevTokenTx, ftUtxo.prevTokenOutputIndex)
        )

        const tokenTxOutputProof = getTxOutputProof(tokenTx, ftUtxo.outputIndex)
        tokenTxHeaderArray = Buffer.concat([
          tokenTxHeaderArray,
          Buffer.from(tokenTxOutputProof.txHeader.toHex(), 'hex'),
        ])
        const hashProofBuf = Buffer.from(tokenTxOutputProof.hashProof.toHex(), 'hex')
        tokenTxHashProofArray = Buffer.concat([
          tokenTxHashProofArray,
          getUInt32Buf(hashProofBuf.length),
          hashProofBuf,
        ])
        tokenSatoshiBytesArray = Buffer.concat([
          tokenSatoshiBytesArray,
          Buffer.from(tokenTxOutputProof.satoshiBytes.toHex(), 'hex'),
        ])

        // unlockFromContract
        const contractTxOutputProof = new TxOutputProof(getEmptyTxOutputProof())

        tokenContract.setDataPart(toHex(dataPart))
        const unlockingContract = tokenContract.unlock({
          txPreimage: txComposer.getInputPreimage(inputIndex),
          prevouts: new Bytes(prevouts.toHex()),

          tokenInputIndex: inputIndex,
          amountCheckHashIndex: 0,
          amountCheckInputIndex: txComposer.getTx().inputs.length - 1,
          amountCheckTxOutputProofInfo,
          amountCheckScript: new Bytes(amountCheckScriptBuf.toString('hex')),

          prevTokenInputIndex,
          prevTokenAddress,
          prevTokenAmount,
          tokenTxHeader,
          tokenTxInputProof,
          prevTokenTxOutputProof,

          senderPubKey: new PubKey(
            ftUtxo.publicKey ? toHex(ftUtxo.publicKey.toBuffer()) : PLACE_HOLDER_PUBKEY
          ),
          senderSig: new Sig(
            senderPrivateKey
              ? toHex(txComposer.getTxFormatSig(senderPrivateKey, inputIndex))
              : PLACE_HOLDER_SIG
          ),

          contractInputIndex: transferCheckInputIndex,
          contractTxOutputProof,

          // checkInputIndex: transferCheckInputIndex,
          // checkScriptTx: new Bytes(transferCheckTx.serialize(true)),
          // nReceivers: tokenOutputLen,

          operation: ftProto.OP_TRANSFER,
        })
        // if (this.debug && senderPrivateKey) {
        //   let txContext = {
        //     tx: txComposer.getTx(),
        //     inputIndex: inputIndex,
        //     inputSatoshis: txComposer.getInput(inputIndex).output.satoshis,
        //   }
        //   let ret = unlockingContract.verify(txContext)
        //   if (ret.success == false) throw ret
        // }

        txComposer.getInput(inputIndex).setScript(unlockingContract.toScript() as mvc.Script)
      })

      const tokenOutputSatoshis = txComposer.getOutput(0).satoshis

      let unlockingContract = tokenTransferCheckContract.unlock({
        txPreimage: txComposer.getInputPreimage(transferCheckInputIndex),
        prevouts: new Bytes(prevouts.toHex()),
        tokenScript: new Bytes(inputTokenScript.toHex()),

        tokenTxHeaderArray: new Bytes(tokenTxHeaderArray.toString('hex')),
        tokenTxHashProofArray: new Bytes(tokenTxHashProofArray.toString('hex')),
        tokenSatoshiBytesArray: new Bytes(tokenSatoshiBytesArray.toString('hex')),

        inputTokenAddressArray: new Bytes(toHex(inputTokenAddressArray)),
        inputTokenAmountArray: new Bytes(toHex(inputTokenAmountArray)),
        // receiverSatoshiArray: new Bytes(toHex(outputSatoshiArray)),

        tokenOutputSatoshis,

        // same
        changeSatoshis: new Int(
          changeOutputIndex != -1 ? txComposer.getOutput(changeOutputIndex).satoshis : 0
        ),
        changeAddress: new Ripemd160(toHex(changeAddress.hashBuffer)),
        opReturnScript: new Bytes(opreturnScriptHex),
      })

      // if (this.debug) {
      //   let txContext = {
      //     tx: txComposer.getTx(),
      //     inputIndex: transferCheckInputIndex,
      //     inputSatoshis: txComposer.getInput(transferCheckInputIndex).output.satoshis,
      //   }
      //   let ret = unlockingContract.verify(txContext)
      //   if (ret.success == false) throw ret
      // }

      txComposer
        .getInput(transferCheckInputIndex)
        .setScript(unlockingContract.toScript() as mvc.Script)
    }

    if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
      p2pkhInputIndexs.forEach((inputIndex) => {
        let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        txComposer.unlockP2PKHInput(privateKey, inputIndex)
      })
    }
    this._checkTxFeeRate(txComposer)

    // return { transferCheckTxComposer, txComposer }
    return { txComposer: undefined, transferCheckTxComposer: undefined }
  }

  private _calTransferEstimateFee({
    p2pkhInputNum = 10,
    tokenInputArray,
    tokenOutputArray,
    tokenTransferType,
    opreturnData,
  }: {
    p2pkhInputNum: number
    tokenInputArray: FtUtxo[]
    tokenOutputArray: { address: mvc.Address; tokenAmount: BN }[]
    tokenTransferType: TOKEN_TRANSFER_TYPE
    opreturnData: any
  }) {
    let inputTokenNum = tokenInputArray.length
    let outputTokenNum = tokenOutputArray.length
    let dummyTransferCheckContract = TokenTransferCheckFactory.getDummyInstance(tokenTransferType)
    let routeCheckLockingSize = TokenTransferCheckFactory.getLockingScriptSize(tokenTransferType)
    let routeCheckUnlockingSize = TokenTransferCheckFactory.calUnlockingScriptSize(
      tokenTransferType,
      p2pkhInputNum,
      inputTokenNum,
      outputTokenNum,
      opreturnData
    )
    let tokenUnlockingSize = TokenFactory.calUnlockingScriptSize(
      dummyTransferCheckContract,
      p2pkhInputNum,
      inputTokenNum,
      outputTokenNum
    )

    let tokenLockingSize = TokenFactory.getLockingScriptSize()

    let stx1 = new SizeTransaction(this.feeb, this.dustCalculator)
    for (let i = 0; i < p2pkhInputNum; i++) {
      stx1.addP2PKHInput()
    }
    stx1.addOutput(routeCheckLockingSize)
    stx1.addP2PKHOutput()

    let stx = new SizeTransaction(this.feeb, this.dustCalculator)
    for (let i = 0; i < inputTokenNum; i++) {
      stx.addInput(tokenUnlockingSize, tokenInputArray[i].satoshis)
    }
    for (let i = 0; i < p2pkhInputNum; i++) {
      stx.addP2PKHInput()
    }
    stx.addInput(
      routeCheckUnlockingSize,
      this.dustCalculator.getDustThreshold(routeCheckLockingSize)
    )

    for (let i = 0; i < outputTokenNum; i++) {
      stx.addOutput(tokenLockingSize)
    }
    if (opreturnData) {
      stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
    }
    stx.addP2PKHOutput()
    return stx1.getFee() + stx.getFee()
  }

  private getDustThreshold(size: number) {
    return this.dustCalculator.getDustThreshold(size)
  }

  private _checkTxFeeRate(txComposer: TxComposer) {
    //Determine whether the final fee is sufficient
    let feeRate = txComposer.getFeeRate()
    if (feeRate < this.feeb) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_BSV,
        `Insufficient balance.The fee rate should not be less than ${this.feeb}, but in the end it is ${feeRate}.`
      )
    }
  }
}
