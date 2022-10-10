import 'dotenv/config'
import { Wallet, API_NET, API_TARGET, NftManager } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager

jest.setTimeout(10000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })

  nftManager = new NftManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  nftManager.api.authorize({ authorization: process.env.METASV_BEARER })
})

describe('NFT 创世测试', () => {
  it('正常初始化', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  it('正常创世', async () => {
    const totalSupply = '1000'
    const { txid, sensibleId } = await nftManager.genesis({
      totalSupply,
    })

    console.log({ txid, sensibleId })

    expect(txid).toHaveLength(64)
  })
})
