import 'dotenv/config'
import { NftManager, Wallet, API_NET, API_TARGET } from '../../../../src'

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager
let sensibleId = 'f652bd86090b9bf93ba7127a85b007822a4dc6ea17e6e582ba10973e886b99b800000000'
let mintTxId: string
let genesis = 'a893fb79541bb48dab82f35974232b62cc8998dc'
let codehash = '48d6118692b459fabfc2910105f38dda0645fb57'

jest.setTimeout(30000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 1

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })

  nftManager = new NftManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: process.env.WIF,
    feeb: feeb,
  })
  nftManager.api.authorize({ authorization: process.env.METASV_BEARER })
})

describe('转账', () => {
  it('正常初始化', async () => {
    expect(nftManager).toHaveProperty('transfer')
  })
})
