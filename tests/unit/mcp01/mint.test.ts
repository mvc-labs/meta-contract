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

  const res = await nftManager.genesis({ totalSupply: '46' })

  sensibleId = res.sensibleId
  genesisContract = res.genesisContract
  genesisTxId = res.txid
  // sensibleId = '2e4c6155ead72bb2e5d33c0e7b24c87c8be4864d7d235dad7b0445514a843e2a00000000'
})

jest.setTimeout(30000)
describe('NFT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  it('正常铸造', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0
    // await nftManager.mint({
    //   sensibleId,
    //   metaTxId,
    //   metaOutputIndex,
    //   genesisWif: process.env.WIF,
    //   receiverAddress: wallet.address,
    // })

    const { txid, txHex } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
      genesisWif: process.env.WIF,
      receiverAddress: wallet.address,
    })

    console.log({ txid })
    expect(txid).toHaveLength(64)
  })
})
