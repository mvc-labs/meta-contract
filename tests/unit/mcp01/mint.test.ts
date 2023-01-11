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

  sensibleId = '4874dff763ec1ec6849ce0ae935eaedc67e6802d7e645ce6a088b8a270175def00000000'
})

jest.setTimeout(30000)
describe('NFT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  const receiverAddress = process.env.ADDRESS2 as string

  it.skip('正常铸造', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0

    const { txid } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
      // genesisWif: process.env.WIF,
      // receiverAddress,
    })

    console.log({ txid })
    expect(txid).toHaveLength(64)
  })

  it('当达到totalSupply上限时，应正确地不再生成genesis Utxo，并在下一次调用铸造方法时正确报错', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0

    // 创世，设置totalSupply为1
    const { sensibleId } = await nftManager.genesis({ totalSupply: '1' })

    // 铸造1个
    const { tx } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
    })
    // 此tx应只有两个output，不存在genesis utxo
    expect(tx.outputs.length).toBe(2)

    // 铸造第二个，应报错
    await expect(
      nftManager.mint({
        sensibleId,
        metaTxId,
        metaOutputIndex,
      })
    ).rejects.toThrow('token supply is fixed')
  })
})
