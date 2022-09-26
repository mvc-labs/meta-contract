import { DustCalculator } from '../common/DustCalculator'
import { sighashType, TxComposer } from '../tx-composer'
import * as mvc from '../mvc'
import { BN, API_NET, Api, API_TARGET } from '..'
import { NftGenesis, NftGenesisFactory } from './contract-factory/nftGenesis'
import {
  addChangeOutput,
  addContractInput,
  addContractOutput,
  addP2PKHInputs,
  checkFeeRate,
  getGenesisIdentifiers,
  getLatestGenesisInfo,
  getNftInfo,
  parseSensibleId,
  prepareUtxos,
  unlockP2PKHInputs,
} from '../common/mcpUtils'
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
import { CONTRACT_TYPE, PLACE_HOLDER_PUBKEY, PLACE_HOLDER_SIG } from '../common/utils'
import { Prevouts } from '../common/Prevouts'
import { CodeError, ErrCode } from '../common/error'
import { NonFungibleTokenUnspent } from '../api'
import { SizeTransaction } from '../common/SizeTransaction'
import { PROTO_TYPE } from '../common/protoheader'
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

  public async genesis({ totalSupply }: { totalSupply: string }) {
    const { utxos, utxoPrivateKeys } = await prepareUtxos(this.purse, this.api, this.network)

    const { txComposer, genesisContract } = await this.createGenesisTx({
      totalSupply,
      utxos,
      utxoPrivateKeys,
    })

    let txHex = txComposer.getRawHex()
    await this.api.broadcast(txHex)

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
    }
  }

  private async createGenesisTx({
    totalSupply,
    utxos,
    utxoPrivateKeys,
  }: {
    totalSupply: string
    utxos: Utxo[]
    utxoPrivateKeys: mvc.PrivateKey[]
  }) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    // 构建合约
    const genesisContract = this.createGenesisContract(totalSupply)

    // 添加付钱输入、添加创世输出、添加找零输出、解锁输入
    const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)
    addContractOutput({
      txComposer,
      contract: genesisContract,
      dustCalculator: this.dustCalculator,
    })
    addChangeOutput(txComposer, changeAddress, this.feeb)
    unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)

    // 检查最终费率
    checkFeeRate(txComposer, this.feeb)

    return { txComposer, genesisContract }
  }

  public async issue(options: any) {
    return this.mint(options)
  }

  public async mint2({
    sensibleId,
    metaTxId,
    metaOutputIndex,
  }: {
    sensibleId: string
    metaTxId: string
    metaOutputIndex: number
  }) {
    const { utxos, utxoPrivateKeys } = await prepareUtxos(this.purse, this.api, this.network)
    const txComposer = await this.createMintTx({
      utxos,
      utxoPrivateKeys,
      sensibleId,
      metaTxId,
      metaOutputIndex,
    })

    let txHex = txComposer.getRawHex()
    await this.api.broadcast(txHex)

    return { txHex, txid: txComposer.getTxId(), tx: txComposer.getTx() }
  }

  public async transfer2({
    genesis,
    codehash,
    tokenIndex,
    senderWif,
    receiverAddress,
    opreturnData,
  }: {
    genesis: string
    codehash: string
    tokenIndex: string
    senderWif: string
    receiverAddress: string | mvc.Address
    opreturnData?: any
  }) {
    const { utxos, utxoPrivateKeys } = await prepareUtxos(this.purse, this.api, this.network)
    receiverAddress = new mvc.Address(receiverAddress, this.network)
    const { txComposer } = await this.createTransferTx({
      utxos,
      utxoPrivateKeys,
      genesis,
      codehash,
      tokenIndex,
      senderWif,
      receiverAddress,
    })

    let txHex = txComposer.getRawHex()
    await this.api.broadcast(txHex)

    return { txHex, txid: txComposer.getTxId(), tx: txComposer.getTx() }
  }

  // 构建创世合约
  private createGenesisContract(totalSupply: string) {
    const totalSupplyInBn = new BN(totalSupply.toString())

    const genesisContract = NftGenesisFactory.createContract()
    genesisContract.setFormatedDataPart({
      totalSupply: totalSupplyInBn,
      nftAddress: this.purse.address.hashBuffer.toString('hex'),
    })

    return genesisContract
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
    senderWif,
    receiverAddress,
  }) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    let { nftUtxo } = await getNftInfo({
      tokenIndex,
      codehash,
      genesis,
      api: this.api,
      network: this.network,
    })

    nftUtxo = await this.pretreatNftUtxo(nftUtxo, codehash, genesis)

    const nftScriptBuf = nftUtxo.lockingScript.toBuffer()
    let dataPartObj = nftProto.parseDataPart(nftScriptBuf)
    dataPartObj.nftAddress = toHex(receiverAddress.hashBuffer)
    const lockingScriptBuf = nftProto.updateScript(nftScriptBuf, dataPartObj)

    let prevouts = new Prevouts()

    let nftInput = nftUtxo

    // token contract input
    const nftInputIndex = txComposer.appendInput(nftInput)
    prevouts.addVout(nftInput.txId, nftInput.outputIndex)
    txComposer.addSigHashInfo({
      inputIndex: nftInputIndex,
      address: nftUtxo.nftAddress.toString(),
      sighashType,
      contractType: CONTRACT_TYPE.BCP01_NFT,
    })

    const p2pkhInputIndexs = utxos.map((utxo) => {
      const inputIndex = txComposer.appendP2PKHInput(utxo)
      prevouts.addVout(utxo.txId, utxo.outputIndex)
      txComposer.addSigHashInfo({
        inputIndex,
        address: utxo.address.toString(),
        sighashType,
        contractType: CONTRACT_TYPE.P2PKH,
      })
      return inputIndex
    })

    //tx addOutput nft
    const nftOutputIndex = addContractOutput({
      txComposer,
      lockingScript: mvc.Script.fromBuffer(lockingScriptBuf),
      dustCalculator: this.dustCalculator,
    })

    //The first round of calculations get the exact size of the final transaction, and then change again
    //Due to the change, the script needs to be unlocked again in the second round
    //let the fee to be exact in the second round

    for (let c = 0; c < 2; c++) {
      txComposer.clearChangeOutput()
      const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)

      const nftContract = NftFactory.createContract(this.unlockContractCodeHashArray, codehash)
      let dataPartObj = nftProto.parseDataPart(nftInput.lockingScript.toBuffer())
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

      // const amountCheckTx = TokenUtil.get
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
      const privateKey = this.purse.privateKey
      const publicKey = privateKey.toPublicKey()
      // const genesisScript = nftInput.preNftAddress.hashBuffer.equals(Buffer.alloc(20, 0))
      //   ? new Bytes(nftInput.preLockingScript.toHex())
      //   : new Bytes(Buffer.alloc(0).toString('hex'))
      const genesisScript = new Bytes(nftInput.preLockingScript.toHex())

      const unlockingContract = nftContract.unlock({
        txPreimage: txComposer.getInputPreimage(nftInputIndex),
        prevouts: new Bytes(prevouts.toHex()),

        prevNftInputIndex,
        prevNftAddress: new Bytes(toHex(nftInput.preNftAddress.hashBuffer)),
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

        senderPubKey: new PubKey(toHex(publicKey.toBuffer())),
        senderSig: new Sig(toHex(txComposer.getTxFormatSig(privateKey, nftInputIndex))),

        receiverAddress: new Bytes(toHex(receiverAddress.hashBuffer)),
        nftOutputSatoshis: new Int(txComposer.getOutput(nftOutputIndex).satoshis),
        opReturnScript: new Bytes(''),
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

    if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
      p2pkhInputIndexs.forEach((inputIndex) => {
        let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        txComposer.unlockP2PKHInput(privateKey, inputIndex)
      })
    }

    checkFeeRate(txComposer, this.feeb)
    return { txComposer }

    // 2. 添加转账输出
    // 3. 添加找零输出
    // 4. 解锁输入
  }

  private async createMintTx({
    utxos,
    utxoPrivateKeys,
    sensibleId,
    metaTxId,
    metaOutputIndex,
  }: {
    utxos: Utxo[]
    utxoPrivateKeys: mvc.PrivateKey[]
    sensibleId: string
    metaTxId: string
    metaOutputIndex: number
  }) {
    const txComposer = new TxComposer()
    const changeAddress = this.purse.address

    // 输入：第一个为上一个创世，后面是付钱的utxo
    // 输出：第一个为更新的创世，第二个是nft，后面是找零

    // 第一步：找回创世utxo，放入第一个输入
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

    // 用于构建formData的数据
    const sensibleID = {
      txid: genesisTxId,
      index: genesisOutputIndex,
    }
    const genesisAddress = this.purse.privateKey.toPublicKey().toAddress(this.network).toString() // TODO: 他人创世
    const genesisInputIndex = addContractInput(
      txComposer,
      genesisUtxo,
      genesisAddress,
      CONTRACT_TYPE.BCP01_NFT_GENESIS
    )

    // 第二步：添加付钱输入
    const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)

    const genesisHash = this.getGenesisHash(genesisContract, sensibleID)
    const mintContract = this.createMintContract(
      genesisHash,
      genesisContract,
      metaTxId,
      metaOutputIndex,
      sensibleID
    )

    // 第三步：复制创世合约，添加创世输出
    // TODO: 到头
    const nextGenesisContract = this.updateGenesisContract(genesisContract, sensibleID)
    const nextGenesisOutputIndex = addContractOutput({
      txComposer,
      contract: nextGenesisContract,
      dustCalculator: this.dustCalculator,
    })

    // 第四步：创建铸造合约，添加铸造输出
    const mintOutputIndex = addContractOutput({
      txComposer,
      contract: mintContract,
      dustCalculator: this.dustCalculator,
    })

    // 第五步：添加找零输出，解锁创世合约输入
    let opreturnScriptHex = ''
    let opreturnData = ''
    if (opreturnData) {
      const opreturnOutputIndex = txComposer.appendOpReturnOutput(opreturnData)
      opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
    }
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

    // 第六步：解锁付钱输入
    unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)

    // 检查最终费率
    checkFeeRate(txComposer, this.feeb)

    return txComposer
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

  // 构建铸造合约
  private createMintContract(
    genesisHash: string,
    genesisContract: NftGenesis,
    metaTxId: string,
    metaOutputIndex: number,
    sensibleID: any
  ) {
    const mintContract = NftFactory.createContract(this.unlockContractCodeHashArray)
    mintContract.setFormatedDataPart({
      metaidOutpoint: {
        txid: metaTxId,
        index: metaOutputIndex,
      },

      nftAddress: this.purse.address.hashBuffer.toString('hex'),
      totalSupply: genesisContract.getFormatedDataPart().totalSupply,
      tokenIndex: genesisContract.getFormatedDataPart().tokenIndex,
      genesisHash,
      sensibleID,
    })

    return mintContract
  }

  // 解锁，找零
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
    const { genesisTxHeader, prevInputIndex, genesisTxInputProof } =
      this.getGenesisTxInputProof(genesisUtxo)

    const { prevGenesisTxHeader, prevTxOutputHashProof, prevTxOutputSatoshiBytes } =
      this.getPrevGenesisTxOutputProof(genesisUtxo)

    const genesisPrivateKey = mvc.PrivateKey.fromWIF(this.purse.privateKey.toWIF())
    const genesisPublicKey = genesisPrivateKey.toPublicKey()
    const pubKey = new PubKey(toHex(genesisPublicKey))

    const sig = new Sig(toHex(txComposer.getTxFormatSig(genesisPrivateKey, genesisInputIndex)))

    for (let c = 0; c < 2; c++) {
      txComposer.clearChangeOutput()
      const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)
      const txPreimage = txComposer.getInputPreimage(genesisInputIndex)

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

  // 获取创世交易的输入证明
  private getGenesisTxInputProof(genesisUtxo: any) {
    const genesisTx = new Transaction(genesisUtxo.satotxInfo.txHex)
    const prevInputIndex = 0
    const inputRes = TokenUtil.getTxInputProof(genesisTx, prevInputIndex)
    const genesisTxInputProof = new TxInputProof(inputRes[0])
    const genesisTxHeader = inputRes[1] as Bytes // TODO:

    return { genesisTxHeader, prevInputIndex, genesisTxInputProof }
  }

  // 获取前创世交易的输出证明
  private getPrevGenesisTxOutputProof(genesisUtxo: any) {
    const preGenesisOutputIndex = genesisUtxo.satotxInfo.preOutputIndex
    const preGenesisTx = new mvc.Transaction(genesisUtxo.satotxInfo.preTxHex)
    const prevOutputProof = TokenUtil.getTxOutputProof(preGenesisTx, preGenesisOutputIndex)

    return {
      prevGenesisTxHeader: prevOutputProof.txHeader,
      prevTxOutputHashProof: prevOutputProof.hashProof,
      prevTxOutputSatoshiBytes: prevOutputProof.satoshiBytes,
    }
  }

  // ===========================================================================
  // 老mint

  public async mint({
    sensibleId,
    genesisWif,
    receiverAddress,
    metaTxId,
    metaOutputIndex,
    opreturnData,
    utxos,
    changeAddress,
    noBroadcast = false,
  }: {
    sensibleId: string
    genesisWif: string
    receiverAddress: string | mvc.Address
    metaTxId?: string
    metaOutputIndex?: number
    opreturnData?: any
    utxos?: any[]
    changeAddress?: string | mvc.Address
    noBroadcast?: boolean
  }) {
    const genesisPrivateKey = new mvc.PrivateKey(genesisWif)
    const genesisPublicKey = genesisPrivateKey.toPublicKey()
    let utxoInfo = await this._pretreatUtxos(utxos)
    if (changeAddress) {
      changeAddress = new mvc.Address(changeAddress, this.network)
    } else {
      changeAddress = utxoInfo.utxos[0].address
    }

    receiverAddress = new mvc.Address(receiverAddress, this.network)

    let { txComposer, tokenIndex } = await this._issue({
      sensibleId,
      genesisPrivateKey,
      genesisPublicKey,
      receiverAddress,
      metaTxId,
      metaOutputIndex,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress: changeAddress,
    })

    let txHex = txComposer.getRawHex()
    if (!noBroadcast) {
      await this.api.broadcast(txHex)
    }

    return {
      txHex,
      txid: txComposer.getTxId(),
      tx: txComposer.getTx(),
      tokenIndex,
    }
  }

  private async _pretreatUtxos(
    paramUtxos: any[]
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

  private async _issue({
    sensibleId,
    genesisPrivateKey,
    genesisPublicKey,
    receiverAddress,
    metaTxId,
    metaOutputIndex,
    opreturnData,
    utxos,
    utxoPrivateKeys,
    changeAddress,
  }: {
    sensibleId: string
    genesisPrivateKey?: mvc.PrivateKey
    genesisPublicKey: mvc.PublicKey
    receiverAddress: mvc.Address
    metaTxId: string
    metaOutputIndex: number
    opreturnData?: any
    utxos: Utxo[]
    utxoPrivateKeys?: mvc.PrivateKey[]
    changeAddress: mvc.Address
  }): Promise<{ txComposer: TxComposer; tokenIndex: string }> {
    let { genesisContract, genesisTxId, genesisOutputIndex, genesisUtxo } =
      await this._pretreatNftUtxoToIssue({ sensibleId, genesisPublicKey })

    let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
    let estimateSatoshis = await this._calIssueEstimateFee({
      genesisUtxoSatoshis: genesisUtxo.satoshis,
      opreturnData,
      utxoMaxCount: utxos.length,
    })
    if (balance < estimateSatoshis) {
      throw new CodeError(
        ErrCode.EC_INSUFFICIENT_BSV,
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
      )
    }

    let originDataPart = genesisContract.getFormatedDataPart()
    genesisContract.setFormatedDataPart({
      sensibleID: {
        txid: genesisTxId,
        index: genesisOutputIndex,
      },
      tokenIndex: BN.Zero,
    })
    let genesisHash = genesisContract.getScriptHash()
    genesisContract.setFormatedDataPart(originDataPart)

    let nftContract = NftFactory.createContract(this.unlockContractCodeHashArray)
    nftContract.setFormatedDataPart({
      metaidOutpoint: {
        txid: metaTxId,
        index: metaOutputIndex,
      },
      nftAddress: toHex(receiverAddress.hashBuffer),
      totalSupply: genesisContract.getFormatedDataPart().totalSupply,
      tokenIndex: genesisContract.getFormatedDataPart().tokenIndex,
      genesisHash,
      sensibleID: {
        txid: genesisTxId,
        index: genesisOutputIndex,
      },
    })

    const txComposer = new TxComposer()

    //The first input is the genesis contract
    const genesisInputIndex = txComposer.appendInput(genesisUtxo)
    txComposer.addSigHashInfo({
      inputIndex: genesisInputIndex,
      address: genesisPublicKey.toAddress(this.network).toString(),
      sighashType,
      contractType: CONTRACT_TYPE.BCP01_NFT_GENESIS,
    })

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

    let genesisContractSatoshis = 0
    const genesisDataPartObj = genesisContract.getFormatedDataPart()
    if (genesisDataPartObj.tokenIndex.lt(genesisDataPartObj.totalSupply.sub(BN.One))) {
      genesisDataPartObj.tokenIndex = genesisDataPartObj.tokenIndex.add(BN.One)
      genesisDataPartObj.sensibleID = nftContract.getFormatedDataPart().sensibleID
      let nextGenesisContract = genesisContract.clone()
      nextGenesisContract.setFormatedDataPart(genesisDataPartObj)
      genesisContractSatoshis = this.getDustThreshold(
        nextGenesisContract.lockingScript.toBuffer().length
      )
      txComposer.appendOutput({
        lockingScript: nextGenesisContract.lockingScript,
        satoshis: genesisContractSatoshis,
      })
    }

    //The following output is the NFT
    const nftOutputIndex = txComposer.appendOutput({
      lockingScript: nftContract.lockingScript,
      satoshis: this.getDustThreshold(nftContract.lockingScript.toBuffer().length),
    })

    //If there is opReturn, add it to the output
    let opreturnScriptHex = ''
    if (opreturnData) {
      const opreturnOutputIndex = txComposer.appendOpReturnOutput(opreturnData)
      opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
    }
    const pubKey = new PubKey(toHex(genesisPublicKey))

    const { genesisTxHeader, prevInputIndex, genesisTxInputProof } =
      this.getGenesisTxInputProof(genesisUtxo)

    const { prevGenesisTxHeader, prevTxOutputHashProof, prevTxOutputSatoshiBytes } =
      this.getPrevGenesisTxOutputProof(genesisUtxo)

    for (let c = 0; c < 2; c++) {
      txComposer.clearChangeOutput()
      const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)
      let unlockResult = genesisContract.unlock({
        txPreimage: txComposer.getInputPreimage(genesisInputIndex),
        sig: new Sig(
          genesisPrivateKey
            ? toHex(txComposer.getTxFormatSig(genesisPrivateKey, genesisInputIndex))
            : PLACE_HOLDER_SIG
        ),
        pubKey,

        genesisTxHeader,
        prevInputIndex,
        genesisTxInputProof,

        prevGenesisTxHeader,
        prevTxOutputHashProof,
        prevTxOutputSatoshiBytes,

        genesisSatoshis: genesisContractSatoshis,
        nftScript: new Bytes(txComposer.getOutput(nftOutputIndex).script.toHex()),
        nftSatoshis: txComposer.getOutput(nftOutputIndex).satoshis,
        changeAddress: new Ripemd160(toHex(changeAddress.hashBuffer)),
        changeSatoshis:
          changeOutputIndex != -1 ? txComposer.getOutput(changeOutputIndex).satoshis : 0,
        opReturnScript: new Bytes(opreturnScriptHex),
      })

      // if (this.debug && genesisPrivateKey && c == 1) {
      let ret = unlockResult.verify({
        tx: txComposer.tx,
        inputIndex: genesisInputIndex,
        inputSatoshis: txComposer.getInput(genesisInputIndex).output.satoshis,
      })
      if (ret.success == false) throw ret
      // }

      txComposer.getInput(genesisInputIndex).setScript(unlockResult.toScript() as mvc.Script)
    }

    if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
      p2pkhInputIndexs.forEach((inputIndex) => {
        let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        txComposer.unlockP2PKHInput(privateKey, inputIndex)
      })
    }

    this._checkTxFeeRate(txComposer)
    return {
      txComposer,
      tokenIndex: nftContract.getFormatedDataPart().tokenIndex.toString(10),
    }
  }

  private async getIssueUtxo(
    codehash: string,
    genesisTxId: string,
    genesisOutputIndex: number
  ): Promise<NftUtxo> {
    let unspent: NonFungibleTokenUnspent
    let firstGenesisTxHex = await this.api.getRawTxData(genesisTxId)
    let firstGenesisTx = new mvc.Transaction(firstGenesisTxHex)

    let scriptBuffer = firstGenesisTx.outputs[genesisOutputIndex].script.toBuffer()

    let originGenesis = nftProto.getQueryGenesis(scriptBuffer)
    let genesisUtxos = await this.api.getNonFungibleTokenUnspents(
      codehash,
      originGenesis,
      this.purse.address.toString()
    )
    unspent = genesisUtxos.find((v) => v.txId == genesisTxId && v.outputIndex == genesisOutputIndex)

    // let spent = await this.api.getOutpointSpent(
    //   genesisTxId,
    //   genesisOutputIndex
    // );
    // if (!spent) {
    //   return {
    //     txId: genesisTxId,
    //     outputIndex: genesisOutputIndex,
    //   };
    // }

    if (!unspent) {
      let _dataPartObj = nftProto.parseDataPart(scriptBuffer)
      _dataPartObj.sensibleID = {
        txid: genesisTxId,
        index: genesisOutputIndex,
      }
      let newScriptBuf = nftProto.updateScript(scriptBuffer, _dataPartObj)
      let issueGenesis = nftProto.getQueryGenesis(newScriptBuf)
      let issueUtxos = await this.api.getNonFungibleTokenUnspents(
        codehash,
        issueGenesis,
        this.purse.address.toString()
      )
      if (issueUtxos.length > 0) {
        unspent = issueUtxos[0]
      }
    }
    if (unspent) {
      return {
        txId: unspent.txId,
        outputIndex: unspent.outputIndex,
      }
    }
  }

  private async _pretreatNftUtxoToIssue({
    sensibleId,
    genesisPublicKey,
  }: {
    sensibleId: string
    genesisPublicKey: mvc.PublicKey
  }) {
    let genesisContract = NftGenesisFactory.createContract()

    let { genesisTxId, genesisOutputIndex } = parseSensibleId(sensibleId)
    let genesisUtxo = await this.getIssueUtxo(
      genesisContract.getCodeHash(),
      genesisTxId,
      genesisOutputIndex
    )

    if (!genesisUtxo) {
      throw new CodeError(ErrCode.EC_FIXED_TOKEN_SUPPLY, 'token supply is fixed')
    }
    let txHex = await this.api.getRawTxData(genesisUtxo.txId)
    const tx = new mvc.Transaction(txHex)
    let preTxId = tx.inputs[0].prevTxId.toString('hex')
    let preOutputIndex = tx.inputs[0].outputIndex
    let preTxHex = await this.api.getRawTxData(preTxId)
    genesisUtxo.satotxInfo = {
      txId: genesisUtxo.txId,
      outputIndex: genesisUtxo.outputIndex,
      txHex,
      preTxId,
      preOutputIndex,
      preTxHex,
    }

    let output = tx.outputs[genesisUtxo.outputIndex]
    genesisUtxo.satoshis = output.satoshis
    genesisUtxo.lockingScript = output.script
    genesisContract.setFormatedDataPartFromLockingScript(genesisUtxo.lockingScript)

    return {
      genesisContract,
      genesisTxId,
      genesisOutputIndex,
      genesisUtxo,
    }
  }

  private async _calIssueEstimateFee({
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

  // ===========================================================================
  // 老transfer
  public async transfer({
    genesis,
    codehash,
    tokenIndex,

    senderWif,
    senderPrivateKey,

    receiverAddress,
    opreturnData,
    utxos,
    changeAddress,
    noBroadcast = false,
  }: {
    genesis: string
    codehash: string
    tokenIndex: string
    senderWif?: string
    senderPrivateKey?: string | mvc.PrivateKey
    receiverAddress: string | mvc.Address
    opreturnData?: any
    utxos?: any[]
    changeAddress?: string | mvc.Address
    noBroadcast?: boolean
  }): Promise<{ tx: mvc.Transaction; txid: string; txHex: string }> {
    // checkParamGenesis(genesis)
    // checkParamCodehash(codehash)

    let senderPublicKey: mvc.PublicKey
    if (senderWif) {
      senderPrivateKey = new mvc.PrivateKey(senderWif)
      senderPublicKey = senderPrivateKey.publicKey
    } else if (senderPrivateKey) {
      senderPrivateKey = new mvc.PrivateKey(senderPrivateKey)
      senderPublicKey = senderPrivateKey.publicKey
    } else {
      throw new CodeError(ErrCode.EC_INVALID_ARGUMENT, 'senderPrivateKey should be provided!')
    }

    let nftInfo = await this._pretreatNftUtxoToTransfer(
      tokenIndex,
      codehash,
      genesis,
      senderPrivateKey as mvc.PrivateKey,
      senderPublicKey as mvc.PublicKey
    )

    let utxoInfo = await this._pretreatUtxos(utxos)
    if (changeAddress) {
      changeAddress = new mvc.Address(changeAddress, this.network)
    } else {
      changeAddress = utxoInfo.utxos[0].address
    }
    receiverAddress = new mvc.Address(receiverAddress, this.network)

    let { txComposer } = await this._transfer({
      genesis,
      codehash,
      nftUtxo: nftInfo.nftUtxo,
      nftPrivateKey: nftInfo.nftUtxoPrivateKey,
      receiverAddress,
      opreturnData,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress,
    })

    let txHex = txComposer.getRawHex()
    if (!noBroadcast) {
      await this.api.broadcast(txHex)
    }
    return { tx: txComposer.tx, txHex, txid: txComposer.tx.id }
  }

  private async _pretreatNftUtxoToTransfer(
    tokenIndex: string,
    codehash?: string,
    genesis?: string,
    senderPrivateKey?: mvc.PrivateKey,
    senderPublicKey?: mvc.PublicKey
  ): Promise<{ nftUtxo: NftUtxo; nftUtxoPrivateKey: mvc.PrivateKey }> {
    if (senderPrivateKey) {
      senderPublicKey = senderPrivateKey.toPublicKey()
    }

    let _res = await this.api.getNonFungibleTokenUnspentDetail(codehash, genesis, tokenIndex)
    let nftUtxo: NftUtxo = {
      txId: _res.txId,
      outputIndex: _res.outputIndex,
      nftAddress: new mvc.Address(_res.tokenAddress, this.network),
      publicKey: senderPublicKey,
    }

    return { nftUtxo, nftUtxoPrivateKey: senderPrivateKey }
  }

  private async _transfer({
    genesis,
    codehash,
    nftUtxo,
    nftPrivateKey,
    receiverAddress,
    opreturnData,
    utxos,
    utxoPrivateKeys,
    changeAddress,
  }: {
    genesis: string
    codehash: string
    nftUtxo: NftUtxo
    nftPrivateKey?: mvc.PrivateKey
    receiverAddress: mvc.Address
    opreturnData?: any
    utxos: Utxo[]
    utxoPrivateKeys: mvc.PrivateKey[]
    changeAddress: mvc.Address
  }): Promise<{ txComposer: TxComposer }> {
    nftUtxo = await this._pretreatNftUtxoToTransferOn(nftUtxo, codehash, genesis)

    // let genesisScript = nftUtxo.preNftAddress.hashBuffer.equals(Buffer.alloc(20, 0))
    //   ? new Bytes(nftUtxo.preLockingScript.toHex())
    //   : new Bytes('')
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
        `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
      )
    }

    const nftScriptBuf = nftUtxo.lockingScript.toBuffer()
    let dataPartObj = nftProto.parseDataPart(nftScriptBuf)
    dataPartObj.protoType = PROTO_TYPE.NFT
    dataPartObj.protoVersion = nftProto.PROTO_VERSION

    dataPartObj.nftAddress = toHex(receiverAddress.hashBuffer)
    const lockingScriptBuf = nftProto.updateScript(nftScriptBuf, dataPartObj)

    const txComposer = new TxComposer()
    let nftInput = nftUtxo

    let prevouts = new Prevouts()

    // token contract input
    const nftInputIndex = txComposer.appendInput(nftInput)
    prevouts.addVout(nftInput.txId, nftInput.outputIndex)
    txComposer.addSigHashInfo({
      inputIndex: nftInputIndex,
      address: nftUtxo.nftAddress.toString(),
      sighashType,
      contractType: CONTRACT_TYPE.BCP01_NFT,
    })

    const p2pkhInputIndexs = utxos.map((utxo) => {
      const inputIndex = txComposer.appendP2PKHInput(utxo)
      prevouts.addVout(utxo.txId, utxo.outputIndex)
      txComposer.addSigHashInfo({
        inputIndex,
        address: utxo.address.toString(),
        sighashType,
        contractType: CONTRACT_TYPE.P2PKH,
      })
      return inputIndex
    })

    //tx addOutput nft
    const nftOutputIndex = txComposer.appendOutput({
      lockingScript: mvc.Script.fromBuffer(lockingScriptBuf),
      satoshis: this.getDustThreshold(lockingScriptBuf.length),
    })

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
      const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)

      const nftContract = NftFactory.createContract(this.unlockContractCodeHashArray, codehash)
      let dataPartObj = nftProto.parseDataPart(nftInput.lockingScript.toBuffer())
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
        prevNftAddress: new Bytes(toHex(nftInput.preNftAddress.hashBuffer)),
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

        senderPubKey: new PubKey(toHex(nftInput.publicKey.toBuffer())),
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

    if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
      p2pkhInputIndexs.forEach((inputIndex) => {
        let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        txComposer.unlockP2PKHInput(privateKey, inputIndex)
      })
    }

    this._checkTxFeeRate(txComposer)
    return { txComposer }
  }

  private async _pretreatNftUtxoToTransferOn(nftUtxo: NftUtxo, codehash: string, genesis: string) {
    let txHex = await this.api.getRawTxData(nftUtxo.txId)
    const tx = new mvc.Transaction(txHex)
    let tokenScript = tx.outputs[nftUtxo.outputIndex].script

    let curDataPartObj = nftProto.parseDataPart(tokenScript.toBuffer())
    let input = tx.inputs.find((input, i) => {
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

  /**
   * Estimate the cost of transfer
   * senderPrivateKey and senderPublicKey only need to provide one of them
   */
  public async getTransferEstimateFee({
    genesis,
    codehash,
    tokenIndex,

    senderWif,
    senderPrivateKey,
    senderPublicKey,
    opreturnData,
    utxoMaxCount = 10,
  }: {
    genesis: string
    codehash: string
    tokenIndex: string
    senderWif?: string
    senderPrivateKey?: string | mvc.PrivateKey
    senderPublicKey?: string | mvc.PublicKey
    opreturnData?: any
    utxoMaxCount?: number
  }): Promise<number> {
    // checkParamGenesis(genesis)
    // checkParamCodehash(codehash)

    if (senderWif) {
      senderPrivateKey = new mvc.PrivateKey(senderWif)
      senderPublicKey = senderPrivateKey.publicKey
    } else if (senderPrivateKey) {
      senderPrivateKey = new mvc.PrivateKey(senderPrivateKey)
      senderPublicKey = senderPrivateKey.publicKey
    } else if (senderPublicKey) {
      senderPublicKey = new mvc.PublicKey(senderPublicKey)
    }

    let nftInfo = await this._pretreatNftUtxoToTransfer(
      tokenIndex,
      codehash,
      genesis,
      senderPrivateKey as mvc.PrivateKey,
      senderPublicKey as mvc.PublicKey
    )

    let nftUtxo = await this._pretreatNftUtxoToTransferOn(nftInfo.nftUtxo, codehash, genesis)

    let genesisScript = nftUtxo.preNftAddress.hashBuffer.equals(Buffer.alloc(20, 0))
      ? new Bytes(nftUtxo.preLockingScript.toHex())
      : new Bytes('')
    return await this._calTransferEstimateFee({
      nftUtxoSatoshis: nftUtxo.satoshis,
      genesisScript,
      opreturnData,
      utxoMaxCount,
    })
  }
}
