import { API_TARGET, API_NET, mvc, Api } from '../'
import { FEEB } from './constants'
import { Mcp02 } from './index.interface'

type Mcp02Options = {
  network?: API_NET
  apiTarget?: API_TARGET
  purse: string
  feeb?: number
}

type Purse = {
  privateKey: mvc.PrivateKey
  address: mvc.Address
}

export class FtManager implements Mcp02 {
  private network: API_NET
  private api: Api
  private purse: Purse
  private feeb: number

  constructor({
    network = API_NET.MAIN,
    apiTarget = API_TARGET.MVC,
    purse: wif,
    feeb = FEEB,
  }: Mcp02Options) {
    // 初始化API
    this.network = network
    this.api = new Api(network, apiTarget)

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

  public async genesis() {}
  public async issue() {}
  public async transfer() {}
  public async merge() {}
}
