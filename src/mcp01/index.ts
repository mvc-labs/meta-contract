import { DustCalculator } from '../common/DustCalculator'
import { sighashType, TxComposer } from '../tx-composer'
import { BN, mvc, API_NET, Api, API_TARGET } from '..'
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

  public async mint({
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

  public async transfer({
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

      // console.log({
      //   genesisScript,
      //   ls: nftInput.preLockingScript.toHex(),
      // })

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
    console.log(genesisDataPart)
    if (genesisDataPart.tokenIndex.lt(genesisDataPart.totalSupply.sub(BN.One))) {
      // genesisDataPart.tokenIndex = genesisDataPart.tokenIndex.add(BN.One)
      // genesisDataPart.sensibleID = sensibleID

      let nextGenesisContract = genesisContract.clone()
      nextGenesisContract.setFormatedDataPart(genesisDataPart)
      nextGenesisContract.setFormatedDataPart({
        tokenIndex: genesisDataPart.tokenIndex.add(BN.One),
        sensibleID,
      })

      console.log(genesisContract.getFormatedDataPart())

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

      console.log(txComposer.getOutput(nextGenesisOutputIndex).satoshis)
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
}
