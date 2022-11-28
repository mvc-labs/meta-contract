import { DustCalculator } from '../common/DustCalculator'
import { sighashType, TxComposer } from '../tx-composer'
import * as mvc from '../mvc'
import { BN, API_NET, Api, API_TARGET } from '..'
import { NftGenesis, NftGenesisFactory } from './contract-factory/nftGenesis'
import {
  addChangeOutput,
  addContractInput,
  addContractOutput,
  addOpreturnOutput,
  addP2PKHInputs,
  checkFeeRate,
  getLatestGenesisInfo,
  getNftInfo,
  prepareUtxos,
  unlockP2PKHInputs,
} from '../helpers/transactionHelpers'
import { NftFactory } from './contract-factory/nft'
import {
  buildTypeClasses,
  Bytes,
  getPreimage,
  Int,
  PubKey,
  Ripemd160,
  Sig,
  SigHashPreimage,
  signTx,
  toHex,
} from '../scryptlib'
import { Address, Transaction } from '../mvc'
import * as TokenUtil from '../common/tokenUtil'
import * as nftProto from './contract-proto/nft.proto'

import { ContractUtil } from './contractUtil'
import {
  CONTRACT_TYPE,
  P2PKH_UNLOCK_SIZE,
  PLACE_HOLDER_PUBKEY,
  PLACE_HOLDER_SIG,
} from '../common/utils'
import { Prevouts } from '../common/Prevouts'
import { CodeError, ErrCode } from '../common/error'
import { NonFungibleTokenUnspent } from '../api'
import { SizeTransaction } from '../common/SizeTransaction'
import { PROTO_TYPE } from '../common/protoheader'
import {
  createNftGenesisContract,
  createNftMintContract,
  rebuildNftLockingScript,
  getGenesisIdentifiers,
} from '../helpers/contractHelpers'
import { createGenesisTxInputProof, createPrevGenesisTxOutputProof } from '../helpers/proofHelpers'
ContractUtil.init()

const jsonDescr = require('./contract-desc/txUtil_desc.json')
const { TxInputProof, TxOutputProof } = buildTypeClasses(jsonDescr)

type Purse = {
  privateKey: mvc.PrivateKey
  address: mvc.Address
}

type Utxo = {
  txId: string
  outputIndex: number
  satoshis: number
  address: mvc.Address
}

export type NftUtxo = {
  txId: string
  outputIndex: number
  satoshis?: number
  lockingScript?: mvc.Script

  satotxInfo?: {
    txId: string
    outputIndex: number
    txHex: string
    preTxId: string
    preOutputIndex: number
    preTxHex: string
    preTx?: Transaction
    txInputsCount?: number
    preNftInputIndex?: number
  }

  nftAddress?: mvc.Address
  preNftAddress?: mvc.Address
  preLockingScript?: mvc.Script

  publicKey?: mvc.PublicKey
  inputIndex?: number
}

export class NftManager {
  private dustCalculator: DustCalculator
  private network: API_NET
  private purse: Purse
  private feeb: number
  private _api: Api
  private unlockContractCodeHashArray: Bytes[]

  get api() {
    return this._api
  }

  get sensibleApi() {
    return this._api
  }

  constructor({
    purse,
    network = API_NET.MAIN,
    apiTarget = API_TARGET.MVC,
    feeb = 0.5,
  }: {
    purse: string
    network: API_NET
    apiTarget: API_TARGET
    feeb?: number
  }) {
    this.dustCalculator = new DustCalculator(300, null)
    this.network = network
    this._api = new Api(network, apiTarget)
    this.unlockContractCodeHashArray = ContractUtil.unlockContractCodeHashArray

    if (feeb) this.feeb = feeb

    if (purse) {
      const privateKey = mvc.PrivateKey.fromWIF(purse)
      const address = privateKey.toAddress(this.network)
      this.purse = {
        privateKey,
        address,
      }
    }
  }

  public async genesis({
    totalSupply,
    opreturnData,
    noBroadcast = false,
    calcFee = false,
  }: {
    totalSupply: string
    opreturnData?: string
    noBroadcast?: boolean
    calcFee?: boolean
  }) {
    const { utxos, utxoPrivateKeys } = await prepareUtxos(this.purse, this.api, this.network)

    const { txComposer, genesisContract } = await this.createGenesisTx({
      totalSupply,
      utxos,
      utxoPrivateKeys,
      opreturnData,
    })

    if (calcFee) {
      const unlockSize =
        txComposer.tx.inputs.filter((v) => v.output.script.isPublicKeyHashOut()).length *
        P2PKH_UNLOCK_SIZE
      let fee = Math.ceil(
        (txComposer.tx.toBuffer().length + unlockSize + mvc.Transaction.CHANGE_OUTPUT_MAX_SIZE) *
          this.feeb
      )

      return { fee }
    }

    let txHex = txComposer.getRawHex()
    let txid
    if (!noBroadcast) {
      txid = await this.api.broadcast(txHex)
    }

    let { codehash, genesis, sensibleId } = getGenesisIdentifiers({
      genesisTx: txComposer.getTx(),
      purse: this.purse,
      unlockContractCodeHashArray: this.unlockContractCodeHashArray,
      type: 'nft',
    })

    return {
      codehash,
      genesis,
      sensibleId,
      tx: txComposer.tx,
      txid: txComposer.tx.id,
      txHex,
      genesisContract,
      broadcastStatus: noBroadcast ? 'pending' : txid ? 'success' : 'fail',
    }
  }

  private async createGenesisTx({
    totalSupply,
    utxos,
    utxoPrivateKeys,
    opreturnData,
  }: {
    totalSupply: string
    utxos: Utxo[]
    utxoPrivateKeys: mvc.PrivateKey[]
    opreturnData?: string
  }) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    // 构建合约
    const genesisContract = createNftGenesisContract({ totalSupply, address: this.purse.address })

    // 添加付钱输入、添加创世输出、添加找零输出、解锁输入
    const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)
    addContractOutput({
      txComposer,
      contract: genesisContract,
      dustCalculator: this.dustCalculator,
    })

    //  添加opreturn输出
    if (opreturnData) {
      addOpreturnOutput(txComposer, opreturnData)
    }

    addChangeOutput(txComposer, changeAddress, this.feeb)
    unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)

    // 检查最终费率
    checkFeeRate(txComposer, this.feeb)

    return { txComposer, genesisContract }
  }

  public async issue(options: any) {
    return this.mint(options)
  }

  public async mint({
    sensibleId,
    metaTxId,
    metaOutputIndex,
    opreturnData,
    noBroadcast = false,
    calcFee = false,
  }: {
    sensibleId: string
    metaTxId: string
    metaOutputIndex: number
    opreturnData?: string
    noBroadcast?: boolean
    calcFee?: boolean
  }) {
    const { utxos, utxoPrivateKeys } = await prepareUtxos(this.purse, this.api, this.network)

    const genesisPrivateKey = this.purse.privateKey
    const genesisPublicKey = genesisPrivateKey.toPublicKey()
    const receiverAddress = this.purse.address
    const changeAddress = this.purse.address

    if (calcFee) {
      return await this.createMintTx({
        utxos,
        utxoPrivateKeys,
        sensibleId,
        metaTxId,
        metaOutputIndex,
        opreturnData,
        receiverAddress,
        calcFee,
      })
    }

    const { txComposer } = await this.createMintTx({
      utxos,
      utxoPrivateKeys,
      sensibleId,
      metaTxId,
      metaOutputIndex,
      opreturnData,
      receiverAddress,
    })

    let txHex = txComposer.getRawHex()
    if (!noBroadcast) {
      await this.api.broadcast(txHex)
    }

    return { txHex, txid: txComposer.getTxId(), tx: txComposer.getTx() }
  }

  public async transfer({
    genesis,
    codehash,
    tokenIndex,
    senderWif,
    receiverAddress,
    opreturnData,
    noBroadcast = false,
  }: {
    genesis: string
    codehash: string
    tokenIndex: string
    senderWif: string
    receiverAddress: string | mvc.Address
    opreturnData?: any
    noBroadcast?: boolean
  }) {
    const { utxos, utxoPrivateKeys } = await prepareUtxos(this.purse, this.api, this.network)
    const changeAddress = this.purse.address
    const nftPrivateKey = this.purse.privateKey
    let { nftUtxo } = await getNftInfo({
      tokenIndex,
      codehash,
      genesis,
      api: this.api,
      network: this.network,
    })
    nftUtxo.publicKey = this.purse.privateKey.toPublicKey()
    receiverAddress = new mvc.Address(receiverAddress, this.network)
    const { txComposer } = await this.createTransferTx({
      utxos,
      utxoPrivateKeys,
      genesis,
      codehash,
      tokenIndex,
      receiverAddress,
      opreturnData,
    })

    // let { txComposer } = await this._transfer({
    //   genesis,
    //   codehash,
    //   nftUtxo,
    //   nftPrivateKey,
    //   receiverAddress,
    //   opreturnData,
    //   utxos,
    //   utxoPrivateKeys,
    //   changeAddress,
    // })

    let txHex = txComposer.getRawHex()
    if (!noBroadcast) {
      await this.api.broadcast(txHex)
    }

    return { txHex, txid: txComposer.getTxId(), tx: txComposer.getTx() }
  }

  private async pretreatNftUtxo(nftUtxo, codehash: string, genesis: string) {
    let txHex = await this.api.getRawTxData(nftUtxo.txId)
    const tx = new mvc.Transaction(txHex)
    let tokenScript = tx.outputs[nftUtxo.outputIndex].script

    let curDataPartObj = nftProto.parseDataPart(tokenScript.toBuffer())
    let input = tx.inputs.find((input) => {
      let script = new mvc.Script(input.script)
      if (script.chunks.length > 0) {
        const lockingScriptBuf = TokenUtil.getLockingScriptFromPreimage(script.chunks[0].buf)
        if (lockingScriptBuf) {
          return true // TODO:
          if (nftProto.getQueryGenesis(lockingScriptBuf) == genesis) {
            return true
          }

          let dataPartObj = nftProto.parseDataPart(lockingScriptBuf)
          dataPartObj.sensibleID = curDataPartObj.sensibleID
          dataPartObj.tokenIndex = BN.Zero
          const newScriptBuf = nftProto.updateScript(lockingScriptBuf, dataPartObj)

          let genesisHash = toHex(mvc.crypto.Hash.sha256ripemd160(newScriptBuf))

          if (genesisHash == curDataPartObj.genesisHash) {
            return true
          }
        }
      }
    })
    if (!input) throw new CodeError(ErrCode.EC_INNER_ERROR, 'invalid nftUtxo')
    let preTxId = input.prevTxId.toString('hex')
    let preOutputIndex = input.outputIndex
    let preTxHex = await this.api.getRawTxData(preTxId)
    const preTx = new mvc.Transaction(preTxHex)

    nftUtxo.satotxInfo = {
      txId: nftUtxo.txId,
      outputIndex: nftUtxo.outputIndex,
      txHex,
      preTxId,
      preNftInputIndex: 0,
      preOutputIndex,
      preTxHex,
      txInputsCount: tx.inputs.length,
      preTx,
    }

    nftUtxo.preLockingScript = preTx.outputs[preOutputIndex].script
    nftUtxo.lockingScript = tx.outputs[nftUtxo.outputIndex].script
    nftUtxo.satoshis = tx.outputs[nftUtxo.outputIndex].satoshis
    nftUtxo.preNftAddress = mvc.Address.fromPublicKeyHash(
      Buffer.from(nftProto.getNftAddress(preTx.outputs[preOutputIndex].script.toBuffer()), 'hex'),
      this.network
    )

    return nftUtxo
  }

  private async createTransferTx({
    utxos,
    utxoPrivateKeys,
    genesis,
    codehash,
    tokenIndex,
    opreturnData = null,
    receiverAddress,
  }) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    // prevouts
    let prevouts = new Prevouts()

    // 第一步：找回nft Utxo并验证，放入第一个输入
    // 1.1 找回nft Utxo
    let { nftUtxo } = await getNftInfo({
      tokenIndex,
      codehash,
      genesis,
      api: this.api,
      network: this.network,
    })

    // 1.2 验证nft Utxo
    nftUtxo = await this.pretreatNftUtxo(nftUtxo, codehash, genesis)

    // 1.3 确保余额充足
    const genesisScript = new Bytes(nftUtxo.preLockingScript.toHex())
    let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
    let estimateSatoshis = await this._calTransferEstimateFee({
      nftUtxoSatoshis: nftUtxo.satoshis,
      genesisScript,
      opreturnData,
      utxoMaxCount: utxos.length,
    })
    if (balance < estimateSatoshis) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_BSV,
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}. 余额不足，需要${estimateSatoshis}，但是只有${balance}。`
      )
    }

    // 1.4 构造nft输入
    const nftInput = nftUtxo
    const nftAddress = this.purse.address.toString()
    const nftInputIndex = addContractInput(
      txComposer,
      nftInput,
      nftAddress,
      CONTRACT_TYPE.BCP01_NFT_GENESIS
    )

    // 1.5 prevouts添加nft utxo
    prevouts.addVout(nftInput.txId, nftInput.outputIndex)

    // 第二步：付钱
    // 2.1 添加付钱输入
    const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)

    // 2.2 prevouts添加付钱utxo
    utxos.forEach((utxo) => {
      prevouts.addVout(utxo.txId, utxo.outputIndex)
    })

    // 第三步：添加nft输出
    // 3.1 构造nft脚本
    const lockingScriptBuf = rebuildNftLockingScript(nftUtxo, receiverAddress)

    // 3.2 添加nft输出
    const nftOutputIndex = addContractOutput({
      txComposer,
      lockingScript: mvc.Script.fromBuffer(lockingScriptBuf),
      dustCalculator: this.dustCalculator,
    })

    // 第五步：如果有opreturn，添加opreturn输出
    let opreturnScriptHex = ''
    if (opreturnData) {
      const opreturnOutputIndex = addOpreturnOutput(txComposer, opreturnData)
      opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
    }

    // 第六步：解锁nft合约，并找零
    this.unlockNftAndChange({
      txComposer,
      nftUtxo,
      nftInputIndex,
      codehash,
      prevouts,
      genesisScript,
      nftOutputIndex,
      receiverAddress,
      changeAddress,
      opreturnScriptHex,
    })

    // 第七步：解锁付钱输入
    unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)

    // 第八步：检查最终费率
    checkFeeRate(txComposer, this.feeb)

    return { txComposer }
  }

  private async createMintTx({
    utxos,
    utxoPrivateKeys,
    sensibleId,
    metaTxId,
    metaOutputIndex,
    opreturnData,
    receiverAddress,
    calcFee = false,
  }: {
    utxos: Utxo[]
    utxoPrivateKeys: mvc.PrivateKey[]
    sensibleId: string
    metaTxId: string
    metaOutputIndex: number
    opreturnData: string
    receiverAddress: mvc.Address
    calcFee?: boolean
  }) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    // 输入：第一个为上一个创世，后面是付钱的utxo
    // 输出：第一个为更新的创世，第二个是nft，后面是找零

    // 第一步：找回创世utxo，放入第一个输入
    // 1.1 找回创世utxo
    const { genesisContract, genesisUtxo, genesisTxId, genesisOutputIndex } =
      (await getLatestGenesisInfo({
        sensibleId,
        api: this.api,
        address: this.purse.address,
        type: 'nft',
      })) as {
        genesisContract: NftGenesis
        genesisUtxo: Utxo
        genesisTxId: string
        genesisOutputIndex: number
      }

    // 1.2 确保余额充足
    let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
    let estimateSatoshis = await this._calIssueEstimateFee({
      genesisUtxoSatoshis: genesisUtxo.satoshis,
      opreturnData,
      utxoMaxCount: utxos.length,
    })

    if (calcFee) {
      return {
        fee: estimateSatoshis,
        txid: txComposer.getTxId,
        txHex: txComposer.getRawHex(),
        tx: txComposer.getTx(),
      }
    }

    if (balance < estimateSatoshis) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_BSV,
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}. 余额不足，需要${estimateSatoshis}，但是只有${balance}。`
      )
    }

    // 1.3 构造创世输入
    const genesisAddress = this.purse.address.toString() // TODO: 他人创世
    const genesisInputIndex = addContractInput(
      txComposer,
      genesisUtxo,
      genesisAddress,
      CONTRACT_TYPE.BCP01_NFT_GENESIS
    )

    // 第二步：添加付钱输入
    const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)

    // 第三步：复制创世合约，添加创世输出
    // TODO: 到头
    const sensibleID = {
      txid: genesisTxId,
      index: genesisOutputIndex,
    }
    const nextGenesisContract = this.updateGenesisContract(genesisContract, sensibleID)
    const nextGenesisOutputIndex = addContractOutput({
      txComposer,
      contract: nextGenesisContract,
      dustCalculator: this.dustCalculator,
    })

    // 第四步：创建铸造合约，添加铸造输出
    const genesisHash = this.getGenesisHash(genesisContract, sensibleID)
    console.log({ genesisHash })
    const mintContract = createNftMintContract({
      genesisHash,
      genesisContract,
      metaTxId,
      metaOutputIndex,
      sensibleID,
      receiverAddress,
      unlockContractCodeHashArray: this.unlockContractCodeHashArray,
    })
    const mintOutputIndex = addContractOutput({
      txComposer,
      contract: mintContract,
      dustCalculator: this.dustCalculator,
    })

    // 第五步：如果有opreturn，添加opreturn输出
    let opreturnScriptHex = ''
    if (opreturnData) {
      const opreturnOutputIndex = addOpreturnOutput(txComposer, opreturnData)
      opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
    }

    // 第六步：添加找零输出，解锁创世合约输入
    this.unlockGenesisAndChange(
      txComposer,
      genesisUtxo,
      genesisContract,
      genesisInputIndex,
      nextGenesisOutputIndex,
      mintOutputIndex,
      changeAddress,
      opreturnScriptHex
    )

    // 第七步：解锁付钱输入
    unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)

    // 第八步：检查最终费率
    checkFeeRate(txComposer, this.feeb)

    const tokenIndex = mintContract.getFormatedDataPart().tokenIndex.toString(10)
    return {
      txComposer,
      tokenIndex,
    }
  }

  // 获取初始创世合约的哈希值供铸造合约使用
  private getGenesisHash(genesisContract: NftGenesis, sensibleID: any) {
    let originDataPart = genesisContract.getFormatedDataPart()
    genesisContract.setFormatedDataPart({
      sensibleID,
      tokenIndex: BN.Zero,
    })
    let genesisHash = genesisContract.getScriptHash()

    // 恢复原始数据
    genesisContract.setFormatedDataPart(originDataPart)

    return genesisHash
  }

  // 复制更新创世合约
  private updateGenesisContract(genesisContract, sensibleID: any) {
    const genesisDataPart = genesisContract.getFormatedDataPart()
    if (genesisDataPart.tokenIndex.lt(genesisDataPart.totalSupply.sub(BN.One))) {
      // genesisDataPart.tokenIndex = genesisDataPart.tokenIndex.add(BN.One)
      // genesisDataPart.sensibleID = sensibleID

      let nextGenesisContract = genesisContract.clone()
      nextGenesisContract.setFormatedDataPart(genesisDataPart)
      nextGenesisContract.setFormatedDataPart({
        tokenIndex: genesisDataPart.tokenIndex.add(BN.One),
        sensibleID,
      })

      return nextGenesisContract
    }
  }

  // 解锁创世合约并找零
  private unlockGenesisAndChange(
    txComposer: TxComposer,
    genesisUtxo: any,
    genesisContract: NftGenesis,
    genesisInputIndex: number,
    nextGenesisOutputIndex: number,
    nftOutputIndex: number,
    changeAddress: Address,
    opreturnScriptHex: string
  ) {
    const genesisPrivateKey = mvc.PrivateKey.fromWIF(this.purse.privateKey.toWIF())
    const genesisPublicKey = genesisPrivateKey.toPublicKey()
    const pubKey = new PubKey(toHex(genesisPublicKey))

    const { genesisTxHeader, prevInputIndex, genesisTxInputProof } =
      createGenesisTxInputProof(genesisUtxo)

    const { prevGenesisTxHeader, prevTxOutputHashProof, prevTxOutputSatoshiBytes } =
      createPrevGenesisTxOutputProof(genesisUtxo)

    for (let c = 0; c < 2; c++) {
      txComposer.clearChangeOutput()
      const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)
      const txPreimage = txComposer.getInputPreimage(genesisInputIndex)
      const sig = new Sig(
        genesisPrivateKey
          ? toHex(txComposer.getTxFormatSig(genesisPrivateKey, genesisInputIndex))
          : PLACE_HOLDER_SIG
      )

      let unlockResult = genesisContract.unlock({
        txPreimage,
        pubKey,
        sig,

        // GenesisTx Input Proof
        genesisTxHeader,
        prevInputIndex,
        genesisTxInputProof,

        prevGenesisTxHeader,
        prevTxOutputHashProof,
        prevTxOutputSatoshiBytes,

        nftScript: new Bytes(txComposer.getOutput(nftOutputIndex).script.toHex()),
        genesisSatoshis: txComposer.getOutput(nextGenesisOutputIndex).satoshis,
        nftSatoshis: txComposer.getOutput(nftOutputIndex).satoshis,
        changeAddress: new Ripemd160(changeAddress.hashBuffer.toString('hex')),
        changeSatoshis:
          changeOutputIndex != -1 ? txComposer.getOutput(changeOutputIndex).satoshis : 0,
        opReturnScript: new Bytes(opreturnScriptHex),
      })

      let ret = unlockResult.verify({
        tx: txComposer.getTx(),
        inputIndex: 0,
        // inputSatoshis: txComposer.getInput(genesisInputIndex).output.satoshis,
        inputSatoshis: txComposer.getOutput(nextGenesisOutputIndex).satoshis,
      })
      if (ret.success == false) console.log(ret)

      txComposer.getInput(genesisInputIndex).setScript(unlockResult.toScript() as mvc.Script)
    }
  }

  // 解锁NFT合约并找零
  private unlockNftAndChange({
    txComposer,
    nftUtxo,
    nftInputIndex,
    codehash,
    prevouts,
    genesisScript,
    nftOutputIndex,
    receiverAddress,
    changeAddress,
    opreturnScriptHex,
  }: {
    txComposer: TxComposer
    nftUtxo: any
    nftInputIndex: number
    codehash: string
    prevouts: any
    genesisScript: any
    nftOutputIndex: number
    receiverAddress: Address
    changeAddress: Address
    opreturnScriptHex: string
  }) {
    const nftPrivateKey = this.purse.privateKey
    const senderPubkey = nftPrivateKey.toPublicKey()

    for (let c = 0; c < 2; c++) {
      txComposer.clearChangeOutput()
      const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)

      const nftContract = NftFactory.createContract(this.unlockContractCodeHashArray, codehash)
      let dataPartObj = nftProto.parseDataPart(nftUtxo.lockingScript.toBuffer())
      nftContract.setFormatedDataPart(dataPartObj)

      // 准备数据
      const prevNftInputIndex = nftUtxo.satotxInfo.preNftInputIndex
      const nftTx = new mvc.Transaction(nftUtxo.satotxInfo.txHex)
      const inputRes = TokenUtil.getTxInputProof(nftTx, prevNftInputIndex)
      const nftTxInputProof = new TxInputProof(inputRes[0])
      const nftTxHeader = inputRes[1] as Bytes

      const prevNftTxProof = new TxOutputProof(
        TokenUtil.getTxOutputProof(nftUtxo.satotxInfo.preTx, nftUtxo.satotxInfo.preOutputIndex)
      )

      const contractInputIndex = 0
      const contractTxProof = new TxOutputProof(TokenUtil.getEmptyTxOutputProof())

      const amountCheckOutputIndex = 0
      // const amountCheckScriptBuf = amountCheckTx.outputs[amountCheckOutputIndex].script.toBuffer()
      const amountCheckScriptBuf = Buffer.alloc(0)
      const amountCheckHashIndex = 0
      const amountCheckInputIndex = txComposer.getTx().inputs.length - 1
      // const amountcheckTxProof = new TxOutputProof(
      //   TokenUtil.getTxOutputProof(amountCheckTx, amountCheckOutputIndex)
      // )
      const amountcheckTxProof = new TxOutputProof(TokenUtil.getEmptyTxOutputProof())
      const amountCheckScrypt = new Bytes(amountCheckScriptBuf.toString('hex'))

      const unlockingContract = nftContract.unlock({
        txPreimage: txComposer.getInputPreimage(nftInputIndex),
        prevouts: new Bytes(prevouts.toHex()),

        prevNftInputIndex,
        prevNftAddress: new Bytes(toHex(nftUtxo.preNftAddress.hashBuffer)),
        nftTxHeader,
        nftTxInputProof,
        prevNftTxProof,
        genesisScript,

        contractInputIndex,
        contractTxProof,

        amountCheckHashIndex,
        amountCheckInputIndex,
        amountcheckTxProof,
        amountCheckScrypt,

        senderPubKey: new PubKey(toHex(senderPubkey)),
        senderSig: new Sig(toHex(txComposer.getTxFormatSig(nftPrivateKey, nftInputIndex))),

        receiverAddress: new Bytes(toHex(receiverAddress.hashBuffer)),
        nftOutputSatoshis: new Int(txComposer.getOutput(nftOutputIndex).satoshis),
        opReturnScript: new Bytes(opreturnScriptHex),
        changeAddress: new Ripemd160(toHex(changeAddress.hashBuffer)),
        changeSatoshis: new Int(
          changeOutputIndex != -1 ? txComposer.getOutput(changeOutputIndex).satoshis : 0
        ),

        operation: nftProto.NFT_OP_TYPE.TRANSFER,
      })

      // if (this.debug && nftPrivateKey) {
      let txContext = {
        tx: txComposer.tx,
        inputIndex: nftInputIndex,
        inputSatoshis: txComposer.getInput(nftInputIndex).output.satoshis,
      }
      let ret = unlockingContract.verify(txContext)
      if (ret.success == false) console.log(ret)
      // }

      txComposer.getInput(nftInputIndex).setScript(unlockingContract.toScript() as mvc.Script)
    }
  }

  public async _calGenesisEstimateFee(totalSupply, opreturnData, feeb) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    // 构建合约
    const genesisContract = createNftGenesisContract({ totalSupply, address: this.purse.address })

    if (opreturnData) {
      addOpreturnOutput(txComposer, opreturnData)
    }

    const unlockSize =
      txComposer.tx.inputs.filter((v) => v.output.script.isPublicKeyHashOut()).length *
      P2PKH_UNLOCK_SIZE
    let fee = Math.ceil(
      (txComposer.tx.toBuffer().length + unlockSize + mvc.Transaction.CHANGE_OUTPUT_MAX_SIZE) * feeb
    )

    return fee
  }

  public async _calIssueEstimateFee({
    genesisUtxoSatoshis,
    opreturnData,
    utxoMaxCount = 10,
  }: {
    genesisUtxoSatoshis: number
    opreturnData?: any
    utxoMaxCount?: number
  }) {
    let p2pkhInputNum = utxoMaxCount

    let stx = new SizeTransaction(this.feeb, this.dustCalculator)
    stx.addInput(NftGenesisFactory.calUnlockingScriptSize(opreturnData), genesisUtxoSatoshis)
    for (let i = 0; i < p2pkhInputNum; i++) {
      stx.addP2PKHInput()
    }

    stx.addOutput(NftGenesisFactory.getLockingScriptSize())

    stx.addOutput(NftFactory.getLockingScriptSize())
    if (opreturnData) {
      stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
    }
    stx.addP2PKHOutput()

    return stx.getFee()
  }

  private async _calTransferEstimateFee({
    nftUtxoSatoshis,
    genesisScript,
    opreturnData,
    utxoMaxCount,
  }: {
    nftUtxoSatoshis: number
    genesisScript: Bytes
    opreturnData: any
    utxoMaxCount: number
  }) {
    let p2pkhInputNum = utxoMaxCount
    let stx = new SizeTransaction(this.feeb, this.dustCalculator)
    stx.addInput(
      NftFactory.calUnlockingScriptSize(
        p2pkhInputNum,
        genesisScript,
        opreturnData,
        nftProto.NFT_OP_TYPE.TRANSFER
      ),
      nftUtxoSatoshis
    )
    for (let i = 0; i < p2pkhInputNum; i++) {
      stx.addP2PKHInput()
    }

    stx.addOutput(NftFactory.getLockingScriptSize())
    if (opreturnData) {
      stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
    }
    stx.addP2PKHOutput()

    return stx.getFee()
  }
}
