import { CYBER3 } from './CYBER3'
import { MVC } from './MVC'

export enum API_NET {
  MAIN = 'mainnet',
  TEST = 'testnet',
}

export enum API_TARGET {
  MVC = 'mvcapi',
  CYBER3 = 'cyber3',
}

export type NonFungibleTokenUnspent = {
  txId: string
  outputIndex: number
  tokenAddress: string
  tokenIndex: string
  metaTxId: string
  metaOutputIndex: number
}

export type FungibleTokenUnspent = {
  txId: string
  outputIndex: number
  tokenAddress: string
  tokenAmount: string
}

export type SA_utxo = {
  txId: string
  outputIndex: number
  satoshis: number
  address: string
  height: number
  flag: string
}
export type FungibleTokenSummary = {
  codehash: string
  genesis: string
  sensibleId: string
  pendingBalance: string
  balance: string
  symbol: string
  decimal: number
}

export type NonFungibleTokenSummary = {
  codehash: string
  genesis: string
  sensibleId: string
  count: string
  pendingCount: string
  metaTxId: string
  metaOutputIndex: number
  supply: string
}

export type FungibleTokenBalance = {
  balance: string
  pendingBalance: string
  utxoCount: number
  decimal: number
}

export type NftSellUtxo = {
  codehash: string
  genesis: string
  tokenIndex: string
  txId: string
  outputIndex: number
  sellerAddress: string
  contractAddress?: string
  satoshisPrice: number
  price: number
}
export type AuthorizationOption = {
  /**
   * should be provided in MetaSV
   */
  authorization?: string
  /**
   * should be provided in MetaSV
   */
  privateKey?: any
}

export type OutpointSpent = {
  spentTxId: string
  spentInputIndex: number
}
export interface ApiBase {
  authorize: (options: AuthorizationOption) => void
  getUnspents: (address: string, flag?: string) => Promise<SA_utxo[]>
  getRawTxData: (txid: string) => Promise<string>
  checkTxSeen: (txid: string) => Promise<boolean>
  broadcast: (hex: string) => Promise<string>
  getFungibleTokenUnspents: (
    codehash: string,
    genesis: string,
    address: string,
    size?: number
  ) => Promise<FungibleTokenUnspent[]>
  getFungibleTokenBalance: (
    codehash: string,
    genesis: string,
    address: string
  ) => Promise<FungibleTokenBalance>
  getFungibleTokenSummary(address: string): Promise<FungibleTokenSummary[]>
  getNonFungibleTokenUnspents(
    codehash: string,
    genesis: string,
    address: string,
    cursor?: number,
    size?: number
  ): Promise<NonFungibleTokenUnspent[]>
  getNonFungibleTokenUnspentDetail(
    codehash: string,
    genesis: string,
    tokenIndex: string
  ): Promise<NonFungibleTokenUnspent>

  getNonFungibleTokenSummary(address: string): Promise<NonFungibleTokenSummary[]>

  getBalance(address: string): Promise<{
    balance: number
    pendingBalance: number
  }>

  getNftSellUtxo(
    codehash: string,
    genesis: string,
    tokenIndex: string,
    includesNotReady?: boolean
  ): Promise<NftSellUtxo>

  getNftSellList(codehash: string, genesis: string, cursor?: number, size?: number): Promise<NftSellUtxo[]>

  getNftSellListByAddress(address: string, cursor?: number, size?: number): Promise<NftSellUtxo[]>

  getOutpointSpent(txId: string, index: number): Promise<OutpointSpent>

  getXpubLiteUtxo(xpub: string): Promise<any>

  getXpubLiteBalance(xpub: string): Promise<any>
}

export class Api implements ApiBase {
  private apiTarget: API_TARGET
  private apiHandler: ApiBase
  constructor(apiNet: API_NET, apiTarget: API_TARGET = API_TARGET.MVC, serverBase?: string) {
    switch (apiTarget) {
      case API_TARGET.MVC: {
        this.apiHandler = new MVC(apiNet, serverBase)
        break
      }
      case API_TARGET.CYBER3: {
        this.apiHandler = new CYBER3(apiNet, serverBase)
        break
      }

      default: {
        // this.apiHandler = new Sensible(apiTarget, apiNet, serverBase)
        this.apiHandler = new MVC(apiNet, serverBase)
        break
      }
    }
  }

  /**
   * Authorization to use MetaSV
   * @param options
   * @returns
   */
  authorize(options: AuthorizationOption) {
    return this.apiHandler.authorize(options)
  }

  async getUnspents(address: string, flag?: string) {
    return this.apiHandler.getUnspents(address, flag)
  }

  async getBalance(address: string) {
    let _res = await this.apiHandler.getBalance(address)
    return { balance: _res.balance, pendingBalance: _res.pendingBalance }
  }

  async getRawTxData(txid: string) {
    return this.apiHandler.getRawTxData(txid)
  }

  async checkTxSeen(txid: string) {
    return this.apiHandler.checkTxSeen(txid)
  }

  async broadcast(hex: string) {
    return this.apiHandler.broadcast(hex)
  }

  async getFungibleTokenUnspents(codehash: string, genesis: string, address: string, size?: number) {
    return this.apiHandler.getFungibleTokenUnspents(codehash, genesis, address, size)
  }
  async getFungibleTokenBalance(codehash: string, genesis: string, address: string) {
    return this.apiHandler.getFungibleTokenBalance(codehash, genesis, address)
  }

  async getFungibleTokenSummary(address: string) {
    return this.apiHandler.getFungibleTokenSummary(address)
  }
  async getNonFungibleTokenUnspents(
    codehash: string,
    genesis: string,
    address: string,
    cursor?: number,
    size?: number
  ) {
    return this.apiHandler.getNonFungibleTokenUnspents(codehash, genesis, address, cursor, size)
  }
  async getNonFungibleTokenUnspentDetail(codehash: string, genesis: string, tokenIndex: string) {
    return this.apiHandler.getNonFungibleTokenUnspentDetail(codehash, genesis, tokenIndex)
  }

  async getNonFungibleTokenSummary(address: string) {
    return this.apiHandler.getNonFungibleTokenSummary(address)
  }

  async getNftSellUtxo(codehash: string, genesis: string, tokenIndex: string, includesNotReady?: boolean) {
    return this.apiHandler.getNftSellUtxo(codehash, genesis, tokenIndex, includesNotReady)
  }

  async getNftSellList(codehash: string, genesis: string, cursor?: number, size?: number) {
    return this.apiHandler.getNftSellList(codehash, genesis, cursor, size)
  }

  async getNftSellListByAddress(address: string, cursor?: number, size?: number) {
    return this.apiHandler.getNftSellListByAddress(address, cursor, size)
  }

  async getOutpointSpent(txId: string, index: number) {
    return this.apiHandler.getOutpointSpent(txId, index)
  }

  async getXpubLiteUtxo(xpub: string) {
    return this.apiHandler.getXpubLiteUtxo(xpub)
  }

  async getXpubLiteBalance(xpub: string) {
    return this.apiHandler.getXpubLiteBalance(xpub)
  }
}
