import * as mvc from '../mvc'
import { dumpTx, P2PKH_UNLOCK_SIZE } from '../common/utils'
import { Api, API_NET, API_TARGET, ApiBase, SA_utxo } from '../api'
import { TxComposer } from '../tx-composer'
import { checkFeeRate } from '../helpers/transactionHelpers'

type Receiver = {
  amount: number
  address: any
}

type BroadcastOptions = {
  noBroadcast: boolean
  dump?: boolean
}

export class Wallet {
  privateKey: mvc.PrivateKey
  address: mvc.Address
  feeb: number
  blockChainApi: ApiBase
  network: API_NET

  constructor(
    wif: string,
    network: API_NET = API_NET.MAIN,
    feeb: number = 1,
    apiTarget: API_TARGET = API_TARGET.MVC,
    apiUrl?: string
  ) {
    if (wif) {
      this.privateKey = mvc.PrivateKey.fromWIF(wif)
    } else {
      this.privateKey = mvc.PrivateKey.fromRandom(network)
    }
    this.address = this.privateKey.toAddress(network)
    this.blockChainApi = new Api(network, apiTarget, apiUrl)
    this.feeb = feeb
    this.network = network
  }

  public get api() {
    return this.blockChainApi
  }

  public async getUnspents(): Promise<SA_utxo[]> {
    return await this.blockChainApi.getUnspents(this.address.toString())
  }

  public async getUtxos() {
    return this.getUnspents()
  }

  public async getBalance() {
    let { pendingBalance, balance } = await this.blockChainApi.getBalance(this.address.toString())
    return balance + pendingBalance
  }

  public async send(address: string, amount: number, options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    let utxos = await this.blockChainApi.getUnspents(this.address.toString())
    const pickedUtxos = this.pickUtxo(utxos, amount)
    pickedUtxos.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })
    txComposer.appendP2PKHOutput({
      address: new mvc.Address(address, this.network),
      satoshis: amount,
    })
    txComposer.appendChangeOutput(this.address, this.feeb)
    pickedUtxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    checkFeeRate(txComposer, this.feeb)

    return await this.broadcastTxComposer(txComposer, options)
  }

  public async sendArray(receivers: Receiver[], utxos?: SA_utxo[], options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    if (!utxos) {
      utxos = await this.blockChainApi.getUnspents(this.address.toString())
    }
    utxos.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })
    receivers.forEach((v) => {
      txComposer.appendP2PKHOutput({
        address: new mvc.Address(v.address, this.network),
        satoshis: v.amount,
      })
    })
    txComposer.appendChangeOutput(this.address, this.feeb)
    utxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    checkFeeRate(txComposer, this.feeb)

    return await this.broadcastTxComposer(txComposer, options)
  }

  public async merge(options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    let utxos = []
    let currentUtxos = await this.blockChainApi.getUnspents(this.address.toString())
    while (currentUtxos.length) {
      utxos = [...utxos, ...currentUtxos]
      const flag = currentUtxos[currentUtxos.length - 1].flag
      currentUtxos = await this.blockChainApi.getUnspents(this.address.toString(), flag)
    }
    utxos.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })

    txComposer.appendChangeOutput(this.address, this.feeb)
    utxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    checkFeeRate(txComposer, this.feeb)

    return await this.broadcastTxComposer(txComposer, options)
  }

  // evenly split all amount into utxo shares, this will increase parallel for wallet
  // minShareValue is used to guarantee single share value won't be too small
  // the last share will cover the tx fee
  public async evenSplit(shares: number, minShareValue = 0, options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    const utxos = await this.blockChainApi.getUnspents(this.address.toString())
    const sumAmount = utxos.map((utxo) => utxo.satoshis).reduce((a, b) => a + b, 0)
    utxos.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })
    const shareValue = Math.floor(sumAmount / shares)
    if (shareValue < minShareValue) {
      throw new Error(`"Share value ${shareValue} is less than minShareValue ${minShareValue}"`)
    }
    for (let i = 0; i < shares - 1; i++) {
      txComposer.appendP2PKHOutput({ address: this.address, satoshis: shareValue })
    }
    txComposer.appendChangeOutput(this.address, this.feeb)
    utxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    checkFeeRate(txComposer, this.feeb)

    return await this.broadcastTxComposer(txComposer, options)
  }

  private async broadcastTxComposer(
    txComposer: TxComposer,
    options?: BroadcastOptions
  ): Promise<{
    txId: string
    txHex: string
  }> {
    const { noBroadcast, dump } = options || {}
    if (dump) {
      dumpTx(txComposer.getTx(), this.network)
    }
    if (noBroadcast) {
      return {
        txId: txComposer.getTx().id,
        txHex: txComposer.getRawHex(),
      }
    }
    const txId = await this.blockChainApi.broadcast(txComposer.getRawHex())

    return {
      txId,
      txHex: txComposer.getRawHex(),
    }
  }

  public async sendOpReturn(opreturnData: any, options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    // pick enough amount for writing opreturn
    const amountRequired = this.feeb * mvc.Script.buildSafeDataOut(opreturnData).getData().length + 100
    let utxos = await this.blockChainApi.getUnspents(this.address.toString())
    // pick enough utxo instead of all utxo
    const pickedUtxo = this.pickUtxo(utxos, amountRequired)
    pickedUtxo.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })
    txComposer.appendOpReturnOutput(opreturnData)
    txComposer.appendChangeOutput(this.address, this.feeb)
    pickedUtxo.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    return await this.broadcastTxComposer(txComposer, options)
  }

  // pick utxo enough to pay amount and fee, use confirmed utxo in priority
  // shuffle confirmed utxo for higher concurrency
  private pickUtxo(utxos: SA_utxo[], amount: number) {
    // amount + 2 outputs + buffer
    let requiredAmount = amount + 34 * 2 * this.feeb + 100
    const candidateUtxos: SA_utxo[] = []
    // split utxo to confirmed and unconfirmed and shuffle them
    const confirmedUtxos = utxos
      .filter((utxo) => {
        return utxo.height > 0
      })
      .sort(() => Math.random() - 0.5)
    const unconfirmedUtxos = utxos
      .filter((utxo) => {
        return utxo.height < 0
      })
      .sort(() => Math.random() - 0.5)

    let current = 0
    // use confirmed first
    for (let utxo of confirmedUtxos) {
      current += utxo.satoshis
      // add input fee
      requiredAmount += this.feeb * P2PKH_UNLOCK_SIZE
      candidateUtxos.push(utxo)
      if (current > requiredAmount) {
        return candidateUtxos
      }
    }
    for (let utxo of unconfirmedUtxos) {
      current += utxo.satoshis
      // add input fee
      requiredAmount += this.feeb * P2PKH_UNLOCK_SIZE
      candidateUtxos.push(utxo)
      if (current > requiredAmount) {
        return candidateUtxos
      }
    }
    return candidateUtxos
  }
}
