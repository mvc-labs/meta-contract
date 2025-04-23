import * as mvc from '../mvc'
import { CodeError, ErrCode } from '../common/error'
import { Net } from '../net'
import {
  API_NET,
  ApiBase,
  AuthorizationOption,
  FungibleTokenBalance,
  FungibleTokenSummary,
  FungibleTokenUnspent,
  NonFungibleTokenSummary,
  NonFungibleTokenUnspent,
  SA_utxo,
} from './index'

type ResData = {
  code: number
  data: any
  msg: string
}

export class METALET implements ApiBase {
  serverBase: string
  authorization: string
  privateKey: any
  publicKey: any
  network: API_NET
  constructor(apiNet: API_NET, serverBase?: string) {
    this.network = apiNet
    if (apiNet == API_NET.MAIN) {
      this.serverBase = 'https://mvcapi.cyber3.space'
    } else {
      this.serverBase = 'https://mvcapi-testnet.cyber3.space'
    }
    if (serverBase) {
      this.serverBase = serverBase
    }
  }

  public authorize(options: AuthorizationOption) {
    const { authorization, privateKey } = options

    if (authorization) {
      if (authorization.indexOf('Bearer') != 0) {
        this.authorization = `Bearer ${authorization}`
      } else {
        this.authorization = authorization
      }
    } else {
      //https://github.com/metasv/metasv-client-signature
      this.privateKey = new mvc.PrivateKey(privateKey)
      this.publicKey = this.privateKey.toPublicKey()
    }
  }

  private _getHeaders(path: string) {
    let headers: any = {}
    if (this.authorization) {
      headers = { authorization: this.authorization }
    } else if (this.privateKey) {
      const timestamp = Date.now()
      const nonce = Math.random().toString().substring(2, 12)
      const message = path + '_' + timestamp + '_' + nonce
      const hash = mvc.crypto.Hash.sha256(Buffer.from(message))
      const sig = mvc.crypto.ECDSA.sign(hash, this.privateKey)
      const sigEncoded = sig.toBuffer().toString('base64')

      headers = {
        'MetaSV-Timestamp': timestamp,
        'MetaSV-Client-Pubkey': this.publicKey.toHex(),
        'MetaSV-Nonce': nonce,
        'MetaSV-Signature': sigEncoded,
      }
    } else {
      headers = {}
      // throw new CodeError(
      //   ErrCode.EC_SENSIBLE_API_ERROR,
      //   'MetaSV should be authorized to access api.'
      // )
    }

    headers.accept = 'application/json'
    return headers
  }

  /**
   * @param {string} address
   * @param {?string} [flag]
   * @note finished
   */
  public async getUnspents(address: string, flag: string): Promise<SA_utxo[]> {
    // let path = `/address/${address}/utxo`
    let path = `/mvc/address/utxo-list?net=${this.network}&address=${address}`
    if (flag) {
      path += `&flag=${flag}`
    }
    let url = 'https://www.metalet.space/wallet-api/v4' + path
    let _res: any = await Net.httpGet(
      url,
      {},
      {
        headers: this._getHeaders(path),
      }
    )

    let ret: SA_utxo[] = _res.data.list
      .map((v: any) => ({
        txId: v.txid,
        outputIndex: v.outIndex,
        satoshis: v.value,
        address: address,
        height: v.height,
        flag: v.flag,
      }))
      .filter((v) => Number(v.satoshis) > 1)
    return ret
  }

  public async getVins(txid: string): Promise<any> {
    let path = `/vin/${txid}/detail`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(
      url,
      {},
      {
        headers: this._getHeaders(path),
      }
    )
    return _res
  }

  /**
   * @param {string} hex
   * @note finished
   */
  public async broadcast(hex: string): Promise<string> {
    let path = `/tx/broadcast`
    let url = this.serverBase + path
    let _res: any = await Net.httpPost(
      url,
      {
        hex,
      },
      {
        headers: this._getHeaders(path),
      }
    )

    if (!_res.txid) {
      console.log(`广播出错：${_res.message.toString()}`)
      throw new Error('broadcast error ' + _res.message.toString())
    }

    return _res.txid
  }

  /**
   * @param address
   * @note finished
   */
  public async getBalance(address: string) {
    let path = `/address/${address}/balance`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(
      url,
      {},
      {
        headers: this._getHeaders(path),
      }
    )
    return {
      balance: _res.confirmed,
      pendingBalance: _res.unconfirmed,
    }
  }
  /**
   * @param {string} txid
   */
  public async getRawTxData(txid: string): Promise<string> {
    // let path = `/tx/${txid}/raw`
    let url = `https://www.metalet.space/wallet-api/v4/mvc/tx/raw`

    let _res: any = await Net.httpGet(
      url,
      {
        net: this.network,
        txId: txid,
      },
      {}
    )

    return _res.data.hex
  }

  /**
   * 快速查询txid是否存在
   * @param {string} txid
   */
  public async checkTxSeen(txid: string): Promise<boolean> {
    let path = `/tx/${txid}/seen`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(
      url,
      {},
      {
        headers: this._getHeaders(path),
      }
    )
    return _res
  }

  /**
   * 通过FT合约CodeHash+溯源genesis获取某地址的utxo列表
   * @note finished
   */
  public async getFungibleTokenUnspents(
    codehash: string,
    genesis: string,
    address: string,
    size: number = 10
  ): Promise<FungibleTokenUnspent[]> {
    let path = `/contract/ft/address/${address}/utxo`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(
      url,
      {
        codeHash: codehash,
        genesis,
      },
      {
        headers: this._getHeaders(path),
      }
    )

    let ret: FungibleTokenUnspent[] = _res.map((v) => ({
      txId: v.txid,
      outputIndex: v.txIndex,
      tokenAddress: address,
      tokenAmount: v.valueString,
    }))
    return ret
  }

  /**
   * 查询某人持有的某FT的余额
   * @note finished
   */
  public async getFungibleTokenBalance(
    codehash: string,
    genesis: string,
    address: string
  ): Promise<FungibleTokenBalance> {
    let path = `/contract/ft/address/${address}/balance`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(
      url,
      { codeHash: codehash, genesis },
      { headers: this._getHeaders(path) }
    )

    let ret: FungibleTokenBalance = {
      balance: '0',
      pendingBalance: '0',
      utxoCount: 0,
      decimal: 0,
    }
    if (_res.length > 0) {
      ret = {
        balance: _res[0].confirmedString,
        pendingBalance: _res[0].unconfirmedString,
        utxoCount: _res[0].utxoCount,
        decimal: _res[0].decimal,
      }
    }
    return ret
  }

  /**
   * 查询某人持有的FT Token列表。获得每个token的余额
   * @note finished
   */
  public async getFungibleTokenSummary(address: string): Promise<FungibleTokenSummary[]> {
    let path = `/contract/ft/address/${address}/balance`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(url, {}, { headers: this._getHeaders(path) })

    let data: FungibleTokenSummary[] = []
    _res.forEach((v: any) => {
      data.push({
        codehash: v.codeHash,
        genesis: v.genesis,
        sensibleId: v.sensibleId,
        symbol: v.symbol,
        decimal: v.decimal,
        balance: v.confirmedString,
        pendingBalance: v.unconfirmedString,
      })
    })

    return data
  }

  /**
   * 通过NFT合约CodeHash+溯源genesis获取某地址的utxo列表
   */
  public async getNonFungibleTokenUnspents(
    codehash: string,
    genesis: string,
    address: string,
    cursor: number = 0,
    size: number = 20
  ): Promise<NonFungibleTokenUnspent[]> {
    let path = `/contract/nft/address/${address}/utxo`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(
      url,
      { codeHash: codehash, genesis },
      { headers: this._getHeaders(path) }
    )

    let ret: NonFungibleTokenUnspent[] = _res.map((v) => ({
      txId: v.txid,
      outputIndex: v.txIndex,
      tokenAddress: address,
      tokenIndex: v.tokenIndex,
      metaTxId: v.metaTxid,
      metaOutputIndex: v.metaOutputIndex,
    }))
    return ret
  }

  /**
   * 查询某人持有的某NFT的UTXO
   */
  public async getNonFungibleTokenUnspentDetail(codehash: string, genesis: string, tokenIndex: string) {
    let path = `/contract/nft/genesis/${codehash}/${genesis}/utxo`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(url, { tokenIndex }, { headers: this._getHeaders(path) })

    let ret = _res.map((v) => ({
      txId: v.txid,
      outputIndex: v.txIndex,
      tokenAddress: v.address,
      tokenIndex: v.tokenIndex,
      metaTxId: v.metaTxid,
      metaOutputIndex: v.metaOutputIndex,
    }))[0]
    return ret
  }

  /**
   * 查询某人持有的所有NFT Token列表。获得持有的nft数量计数
   * @param {String} address
   * @returns
   */
  public async getNonFungibleTokenSummary(address: string): Promise<NonFungibleTokenSummary[]> {
    let url = `https://api.sensiblequery.com/nft/summary/${address}`
    let _res = await Net.httpGet(url, {})
    const { code, data, msg } = _res as ResData
    if (code != 0) {
      throw new CodeError(ErrCode.EC_SENSIBLE_API_ERROR, `request api failed. [url]:${url} [msg]:${msg}`)
    }

    let ret: NonFungibleTokenSummary[] = []
    data.forEach((v) => {
      ret.push({
        codehash: v.codehash,
        genesis: v.genesis,
        sensibleId: v.sensibleId,
        count: v.count,
        pendingCount: v.pendingCount,
        metaTxId: v.metaTxId,
        metaOutputIndex: v.metaOutputIndex,
        supply: v.supply,
      })
    })
    return ret
  }

  public async getNftSellUtxo(
    codehash: string,
    genesis: string,
    tokenIndex: string,
    includesNotReady?: boolean
  ) {
    let path = `/contract/nft/sell/genesis/${codehash}/${genesis}/utxo`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(url, { tokenIndex }, { headers: this._getHeaders(path) })

    let ret = _res
      .filter((v) => {
        return includesNotReady || v.isReady == true
      })
      .map((v) => ({
        codehash,
        genesis,
        tokenIndex,
        txId: v.txid,
        outputIndex: v.txIndex,
        sellerAddress: v.address,
        contractAddress: v.contractAddress,
        satoshisPrice: v.price,
        price: v.price,
      }))[0]
    return ret
  }

  public async getNftSellList(codehash: string, genesis: string, cursor: number = 0, size: number = 20) {
    let path = `/contract/nft/sell/genesis/${codehash}/${genesis}/utxo`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(url, {}, { headers: this._getHeaders(path) })

    let ret = _res
      .filter((v) => v.isReady == true)
      .map((v) => ({
        codehash,
        genesis,
        tokenIndex: v.tokenIndex,
        txId: v.txid,
        outputIndex: v.txIndex,
        sellerAddress: v.address,
        satoshisPrice: v.price,
        price: v.price,
      }))[0]
    return ret
  }

  public async getNftSellListByAddress(address: string, cursor: number = 0, size: number = 20) {
    let path = `/contract/nft/sell/address/${address}/utxo`
    let url = this.serverBase + path
    let _res: any = await Net.httpGet(url, {}, { headers: this._getHeaders(path) })
    let ret = _res
      // .filter((v) => v.isReady == true)
      .map((v) => ({
        codehash: v.codeHash,
        genesis: v.genesis,
        tokenIndex: v.tokenIndex,
        txId: v.txid,
        outputIndex: v.txIndex,
        sellerAddress: v.address,
        satoshisPrice: v.price,
        price: v.price,
      }))
    return ret
  }

  public async getOutpointSpent(txId: string, index: number) {
    let url = `https://api.sensiblequery.com/tx/${txId}/out/${index}/spent`
    let _res = await Net.httpGet(url, {})
    const { code, data, msg } = _res as ResData
    if (code != 0) {
      return null
    }
    if (!data) return null
    return {
      spentTxId: data.txid,
      spentInputIndex: data.idx,
    }
  }

  public async getXpubLiteUtxo(xpub: string) {
    const path = `/xpubLite/${xpub}/utxo`
    const url = this.serverBase + path
    return await Net.httpGet(
      url,
      {},
      {
        headers: this._getHeaders(path),
      }
    )
  }

  public async getXpubLiteBalance(xpub: string) {
    const path = `/xpubLite/${xpub}/balance`
    const url = this.serverBase + path

    return await Net.httpGet(
      url,
      {},
      {
        headers: this._getHeaders(path),
      }
    )
  }
}
