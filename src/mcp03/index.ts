import { CodeError, ErrCode } from '../common/error'
import { API_TARGET, API_NET, mvc, Api } from '..'
import { FEEB, PROTO_FLAG, TOKEN_NAME_LEN, TX_VERSION, SIG_HASH_ALL } from './constants'
import { Mcp02 } from './index.interface'
import * as ContractFactory from './contract-factory'
import { TOKEN_SYMBOLE_LEN } from './deployments/tokenProto'
import { dummyTxId, inputSatoshis } from '../../scrypt_helper'
import { getNewGenesisScript } from './tokenProto'
import { TxComposer } from '../tx-composer'
import { CONTRACT_TYPE } from '../common/utils'
import { TokenGenesisFactory } from './contract-factories/token-genesis-factory'

type Purse = {
  privateKey: mvc.PrivateKey
  address: mvc.Address
}

type Mcp02Options = {
  network?: API_NET
  apiTarget?: API_TARGET
  purse: string
  feeb?: number
}

export class FtManager implements Mcp02 {
  private network: API_NET
  private _api: Api
  private purse: Purse
  private feeb: number

  get api() {
    return this._api
  }

  constructor({
    network = API_NET.MAIN,
    apiTarget = API_TARGET.MVC,
    purse: wif,
    feeb = FEEB,
  }: Mcp02Options) {
    // 初始化API
    this.network = network
    this._api = new Api(network, apiTarget)

    // 初始化钱包
    const privateKey = mvc.PrivateKey.fromWIF(wif)
    const address = privateKey.toAddress(network)
    this.purse = {
      privateKey,
      address,
    }

    // 初始化费率
    this.feeb = feeb
  }

  public async genesis({ tokenName, tokenSymbol, decimalNum, genesisWif }: GenesisOptions) {
    let utxoInfo = await this._pretreatUtxos()

    // if (changeAddress) {
    //   changeAddress = new mvc.Address(changeAddress, this.network)
    // } else {
    const changeAddress = utxoInfo.utxos[0].address
    // }

    let genesisPrivateKey = new mvc.PrivateKey(genesisWif)
    let genesisPublicKey = genesisPrivateKey.toPublicKey()

    // let { txComposer } = await this._genesis({
    await this._genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
      utxos: utxoInfo.utxos,
      utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
      changeAddress: changeAddress as mvc.Address,
      // opreturnData,
      genesisPublicKey,
    })

    // let txHex = txComposer.getRawHex()

    // if (!noBroadcast) {
    //   await this.api.broadcast(txHex)
    // }

    // let { codehash, genesis, sensibleId } = this.getCodehashAndGensisByTx(txComposer.getTx())
    // return {
    //   txHex,
    //   txid: txComposer.getTxId(),
    //   tx: txComposer.getTx(),
    //   codehash,
    //   genesis,
    //   sensibleId,
    // }
  }

  public async issue() {
    return this.mint()
  }

  public async mint() {}
  public async transfer() {}
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

  private async _genesis2({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    opreturnData,
    genesisPublicKey,
  }: {
    tokenName: string
    tokenSymbol: string
    decimalNum: number
    utxos?: Utxo[]
    utxoPrivateKeys?: mvc.PrivateKey[]
    changeAddress?: mvc.Address
    opreturnData?: any
    genesisPublicKey: mvc.PublicKey
  }) {
    //create genesis contract
    // const contractParams = {
    //   tokenName,
    //   tokenSymbol,
    //   decimalNum,
    //   address: changeAddress,
    // }
    // let genesisContract = TokenGenesisFactory.create(contractParams)
    // let estimateSatoshis = await this.getGenesisEstimateFee({
    //   opreturnData,
    //   utxoMaxCount: utxos.length,
    // })
    // const balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
    // if (balance < estimateSatoshis) {
    //   throw new CodeError(
    //     ErrCode.EC_INSUFFICIENT_BSV,
    //     `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
    //   )
    // }
    // const txComposer = new TxComposer()
    // const p2pkhInputIndexs = utxos.map((utxo) => {
    //   const inputIndex = txComposer.appendP2PKHInput(utxo)
    //   txComposer.addSigHashInfo({
    //     inputIndex,
    //     address: utxo.address.toString(),
    //     sighashType,
    //     contractType: CONTRACT_TYPE.P2PKH,
    //   })
    //   return inputIndex
    // })
    // const genesisOutputIndex = txComposer.appendOutput({
    //   lockingScript: genesisContract.lockingScript,
    //   satoshis: this.getDustThreshold(genesisContract.lockingScript.toBuffer().length),
    // })
    // //If there is opReturn, add it to the second output
    // if (opreturnData) {
    //   txComposer.appendOpReturnOutput(opreturnData)
    // }
    // txComposer.appendChangeOutput(changeAddress, this.feeb)
    // if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
    //   p2pkhInputIndexs.forEach((inputIndex) => {
    //     let privateKey = utxoPrivateKeys.splice(0, 1)[0]
    //     txComposer.unlockP2PKHInput(privateKey, inputIndex)
    //   })
    // }
    // this._checkTxFeeRate(txComposer)
    // return { txComposer }
  }

  private async _genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    utxos,
    utxoPrivateKeys,
    changeAddress,
    opreturnData,
    genesisPublicKey,
  }: {
    tokenName: string
    tokenSymbol: string
    decimalNum: number
    utxos?: Utxo[]
    utxoPrivateKeys?: mvc.PrivateKey[]
    changeAddress?: mvc.Address
    opreturnData?: any
    genesisPublicKey: mvc.PublicKey
  }) {
    //create genesis contract
    const GenesisContract = ContractFactory.genContract('token/tokenGenesis', false, false)
    const genesis = new GenesisContract()

    const genesisTxidBuf1 = Buffer.alloc(36, 0)
    const tokenVersion = ContractFactory.getUInt32Buf(1)
    const tokenType = ContractFactory.getUInt32Buf(1)

    const TOKEN_NAME = Buffer.alloc(TOKEN_NAME_LEN, 0)
    TOKEN_NAME.write(tokenName)
    const TOKEN_SYMBOL = Buffer.alloc(TOKEN_SYMBOLE_LEN, 0)
    TOKEN_SYMBOL.write(tokenSymbol)
    let decimalNumStr = decimalNum.toString()
    if (decimalNumStr.length === 1) {
      decimalNumStr = '0' + decimalNumStr
    }
    const DECIMAL_NUM = Buffer.from(decimalNumStr, 'hex')

    const contractData1 = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      changeAddress.hashBuffer, // address
      Buffer.alloc(8, 0), // token value
      Buffer.alloc(20, 0), // genesisHash
      genesisTxidBuf1, // genesisTxidBuf
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
    ])
    genesis.setDataPart(ContractFactory.buildScriptData(contractData1).toString('hex'))

    // 构建并广播genesis交易
    const genesisScript = genesis.lockingScript
    const scriptBuf = genesisScript.toBuffer()

    // txComposer way
    const txComposer = new TxComposer()
    const p2pkhInputIndexs = utxos.map((utxo: any) => {
      const inputIndex = txComposer.appendP2PKHInput(utxo)
      txComposer.addSigHashInfo({
        inputIndex,
        address: utxo.address.toString(),
        sighashType: SIG_HASH_ALL,
        contractType: CONTRACT_TYPE.P2PKH,
      })
      return inputIndex
    })

    txComposer.appendOutput({
      lockingScript: genesisScript,
      satoshis: 10000, // DustCalculator
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

    // const txHex = txComposer.getRawHex()
    // const result = await this.api.broadcast(txHex)
    // console.log(result)
    // return

    // transacion way
    const prevGenesisTx = new mvc.Transaction()
    prevGenesisTx.version = TX_VERSION
    let prevouts = []
    ContractFactory.addInput(
      prevGenesisTx,
      dummyTxId,
      0,
      mvc.Script.buildPublicKeyHashOut(this.purse.address),
      inputSatoshis,
      prevouts
    )

    ContractFactory.addOutput(
      prevGenesisTx,
      mvc.Script.buildPublicKeyHashOut(this.purse.address),
      inputSatoshis
    )

    const txComposer2 = new TxComposer(prevGenesisTx)
    const res = await this.api.broadcast(txComposer2.getRawHex())
    console.log(res)
    return

    // create genesisTx
    const genesisTx = new mvc.Transaction()
    genesisTx.version = TX_VERSION
    ContractFactory.addInput(
      genesisTx,
      prevGenesisTx.id,
      0,
      prevGenesisTx.outputs[0].script,
      inputSatoshis,
      prevouts
    )
    ContractFactory.addOutput(genesisTx, genesis.lockingScript, inputSatoshis)

    const genesisTxidBuf2 = Buffer.from(ContractFactory.genGenesisTxid(genesisTx.id, 0), 'hex')

    const newScriptBuf = getNewGenesisScript(scriptBuf, genesisTxidBuf2)
    const genesisHash = ContractFactory.getScriptHashBuf(newScriptBuf)

    const tokenValue = 1000000
    const buffValue = Buffer.alloc(8, 0)
    buffValue.writeBigUInt64LE(BigInt(tokenValue))

    let contractData = Buffer.concat([
      TOKEN_NAME,
      TOKEN_SYMBOL,
      DECIMAL_NUM,
      this.purse.address.hashBuffer,
      buffValue,
      genesisHash,
      genesisTxidBuf2,
      tokenVersion,
      tokenType, // type
      PROTO_FLAG,
    ])

    let tx = this.createToken(genesis, contractData, genesisTxidBuf2, genesisTx)

    // prevGenesisTx = genesisTx
    // genesisTx = tx
  }

  // public getCodehashAndGensisByTx(genesisTx: mvc.Transaction, genesisOutputIndex: number = 0) {
  //   //calculate genesis/codehash
  //   let genesis: string, codehash: string, sensibleId: string
  //   let genesisTxId = genesisTx.id
  //   let genesisLockingScriptBuf = genesisTx.outputs[genesisOutputIndex].script.toBuffer()
  //   const dataPartObj = ftProto.parseDataPart(genesisLockingScriptBuf)
  //   dataPartObj.sensibleID = {
  //     txid: genesisTxId,
  //     index: genesisOutputIndex,
  //   }
  //   genesisLockingScriptBuf = ftProto.updateScript(genesisLockingScriptBuf, dataPartObj)

  //   let tokenContract = TokenFactory.createContract(
  //     this.transferCheckCodeHashArray,
  //     this.unlockContractCodeHashArray
  //   )
  //   tokenContract.setFormatedDataPart({
  //     rabinPubKeyHashArrayHash: toHex(this.rabinPubKeyHashArrayHash),
  //     sensibleID: {
  //       txid: genesisTxId,
  //       index: genesisOutputIndex,
  //     },
  //     genesisHash: toHex(TokenUtil.getScriptHashBuf(genesisLockingScriptBuf)),
  //   })

  //   let scriptBuf = tokenContract.lockingScript.toBuffer()
  //   genesis = ftProto.getQueryGenesis(scriptBuf)
  //   codehash = tokenContract.getCodeHash()
  //   sensibleId = toHex(TokenUtil.getOutpointBuf(genesisTxId, genesisOutputIndex))

  //   return { codehash, genesis, sensibleId }
  // }

  private createToken(genesis, contractData: Buffer, genesisTxidBuf, genesisTx, options: any = {}) {
    const tx = new mvc.Transaction()
    tx.version = TX_VERSION
    if (options.wrongVersion) {
      tx.version = 1
    }

    const genesisScript = genesis.lockingScript
    const scriptBuf = genesisScript.toBuffer()
    const newScriptBuf = getNewGenesisScript(scriptBuf, genesisTxidBuf)

    let prevouts = []

    // input
    // genesis
    ContractFactory.addInput(tx, genesisTx.id, 0, genesis.lockingScript, inputSatoshis, prevouts)

    // bsv
    ContractFactory.addInput(
      tx,
      dummyTxId,
      0,
      mvc.Script.buildPublicKeyHashOut(this.purse.address),
      inputSatoshis,
      prevouts
    )

    // output
    // genesis
    ContractFactory.addOutput(tx, mvc.Script.fromBuffer(newScriptBuf), inputSatoshis)

    // token
    // const token = new Token(transferCheckCodeHashArray, unlockContractCodeHashArray)
    // token.setDataPart(ContractFactory.buildScriptData(contractData).toString('hex'))
    // const tokenScript = token.lockingScript
    // ContractFactory.addOutput(tx, tokenScript, inputSatoshis)

    // const prevInputIndex = 0
    // const prevOutputIndex = 0

    // unlockGenesis(
    //   tx,
    //   genesis,
    //   tokenScript,
    //   genesisTx,
    //   prevInputIndex,
    //   prevGenesisTx,
    //   prevOutputIndex,
    //   address1,
    //   0,
    //   options.expected
    // )

    return tx
  }
}
