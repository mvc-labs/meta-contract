import { CodeError, ErrCode } from '../common/error'
import { API_TARGET, API_NET, mvc, Api } from '..'
import { FEEB } from './constants'
import { Mcp02 } from './index.interface'

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
  }) {}
}
