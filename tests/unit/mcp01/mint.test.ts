import 'dotenv/config'
import { Wallet, API_NET, API_TARGET, NftManager } from '../../../src'

let wallet: Wallet
let nftManager: NftManager
let sensibleId: string
let genesisTxId: string
let genesisContract: any

beforeAll(async () => {
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, API_NET.MAIN, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })

  nftManager = new NftManager({
    network: API_NET.MAIN,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  nftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  // const res = await nftManager.genesis({ totalSupply: '46' })
  // console.log({ res })

  // sensibleId = res.sensibleId
  // genesisContract = res.genesisContract
  // genesisTxId = res.txid
  sensibleId = '4ed27df9620f4f515bb6201f05d2161ffdea24efa746c641684b8aadf9a1c29500000000'
})

jest.setTimeout(30000)
describe('NFT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  it('正常铸造', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0
    const { txid, txHex } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
    })

    console.log({ txid })
    expect(txid).toHaveLength(64)
  })
})
