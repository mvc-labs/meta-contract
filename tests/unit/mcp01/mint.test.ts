import 'dotenv/config'
import { Wallet, API_NET, API_TARGET, NftManager } from '../../../src'

let wallet: Wallet
let nftManager: NftManager
let sensibleId: string
let genesisTxId: string
let genesisContract: any

beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })

  nftManager = new NftManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  nftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  // const res = await nftManager.genesis({ totalSupply: '46' })
  // sensibleId = res.sensibleId
  // genesisContract = res.genesisContract
  // genesisTxId = res.txid

  sensibleId = 'b081766cdff8fd72a567628c4643e60b372398947aaa7aa84d8c8b1facdc6cde00000000'
})

jest.setTimeout(30000)
describe('NFT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  const receiverAddress = process.env.ADDRESS2 as string

  it('正常铸造', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0

    const { txid, txHex } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
      // genesisWif: process.env.WIF,
      // receiverAddress,
    })

    console.log({ txid })
    expect(txid).toHaveLength(64)
  })
})
