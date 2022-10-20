import * as mvc from '../mvc'
import {dumpTx} from '../common/utils'
import {Api, API_NET, API_TARGET, ApiBase} from '../api'
import {TxComposer} from '../tx-composer'

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
    privwif: string,
    network: API_NET = API_NET.MAIN,
    feeb: number,
    apiTarget: API_TARGET = API_TARGET.MVC,
    apiUrl?: string
  ) {
    if (privwif) {
      this.privateKey = new mvc.PrivateKey(privwif, network)
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

  public async getUnspents(): Promise<any[]> {
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
    utxos.forEach((v) => {
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
    utxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    return await this.broadcastTxComposer(txComposer, options)
  }

  public async sendArray(receivers: Receiver[], options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    let utxos = await this.blockChainApi.getUnspents(this.address.toString())
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

    return await this.broadcastTxComposer(txComposer, options)
  }

  public async merge(options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    let utxos = await this.blockChainApi.getUnspents(this.address.toString())
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

    return await this.broadcastTxComposer(txComposer, options)
  }

  // evenly split all amount into utxo shares, this will increase parallel for wallet
  // minShareValue is used to guarantee single share value won't be too small
  // the last share will cover the tx fee
  public async evenSplit(shares: number, minShareValue = 0, options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    const utxos = await this.blockChainApi.getUnspents(this.address.toString())
    const sumAmount = utxos.map(utxo => utxo.satoshis).reduce((a, b) => a + b, 0);
    utxos.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })
    const shareValue = Math.floor(sumAmount / shares);
    if (shareValue < minShareValue) {
      throw new Error(`"Share value ${shareValue} is less than minShareValue ${minShareValue}"`)
    }
    for (let i = 0; i < shares - 1; i++) {
      txComposer.appendP2PKHOutput({address: this.address, satoshis:shareValue});
    }
    txComposer.appendChangeOutput(this.address, this.feeb)
    utxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })
    return await this.broadcastTxComposer(txComposer, options)
  }

  private async broadcastTxComposer(txComposer: TxComposer, options?: BroadcastOptions) {
    const { noBroadcast, dump } = options || {}
    if (dump) {
      dumpTx(txComposer.getTx(), this.network)
    }
    if (noBroadcast) {
      return txComposer
    }

    return await this.blockChainApi.broadcast(txComposer.getRawHex())
    // return txComposer
  }

  public async sendOpReturn(opreturnData: any, options?: BroadcastOptions) {
    const txComposer = new TxComposer()
    let utxos = await this.blockChainApi.getUnspents(this.address.toString())
    utxos.forEach((v) => {
      txComposer.appendP2PKHInput({
        address: new mvc.Address(v.address, this.network),
        txId: v.txId,
        outputIndex: v.outputIndex,
        satoshis: v.satoshis,
      })
    })
    txComposer.appendOpReturnOutput(opreturnData)
    txComposer.appendChangeOutput(this.address, this.feeb)
    utxos.forEach((v, index) => {
      txComposer.unlockP2PKHInput(this.privateKey, index)
    })

    return await this.broadcastTxComposer(txComposer, options)
  }
}
