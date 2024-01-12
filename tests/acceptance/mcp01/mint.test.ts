import 'dotenv/config'
import { Wallet, API_NET, API_TARGET, NftManager } from '../../../src'
import { sleep } from '../test-helpers'

let wallet: Wallet
let nftManager: NftManager
let sensibleId: string
let genesisTxId: string
let genesisContract: any

beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 1

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

  // sensibleId = '4874dff763ec1ec6849ce0ae935eaedc67e6802d7e645ce6a088b8a270175def00000000'
})

// 创世准备
async function genesis(version = 2) {
  const res = await nftManager.genesis({ totalSupply: '46', version })
  sensibleId = res.sensibleId!
  genesisContract = res.genesisContract
  genesisTxId = res.txid!

  return { sensibleId, genesisTxId, ...res }
}

jest.setTimeout(30000)
describe('NFT Mint - v1', () => {
  it('init', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  it('mint', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0
    const genesisInfo = await genesis(1)

    const { txid } = await nftManager.mint({
      version: 1,
      sensibleId: genesisInfo.sensibleId,
      metaTxId,
      metaOutputIndex,
    })

    console.log({ txid })
    expect(txid).toHaveLength(64)

    await sleep(5000)

    // ask api to return nft info
    const nftInfo = await nftManager.api.getNonFungibleTokenUnspentDetail(
      genesisInfo.codehash!,
      genesisInfo.genesis!,
      '0'
    )

    expect(nftInfo.tokenIndex).toBe(0)
    expect(nftInfo.tokenAddress).toBe(process.env.ADDRESS)
    expect(nftInfo.txId).toBe(txid)
    expect(genesisInfo.codehash).toBe('e205939ad9956673ce7da9fbd40514b30f66dc35')
  })

  it.skip('When totalSupply is reached, it is not allowed to mint again.', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0

    // 创世，设置totalSupply为1
    const { sensibleId } = (await nftManager.genesis({ totalSupply: '1', version: 1 })) as {
      sensibleId: string
    }

    // 铸造1个
    const { tx } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
      version: 1,
    })
    // 此tx应只有两个output，不存在genesis utxo
    expect(tx!.outputs.length).toBe(2)

    // 铸造第二个，应报错
    await expect(
      nftManager.mint({
        sensibleId,
        metaTxId,
        metaOutputIndex,
        version: 1,
      })
    ).rejects.toThrow('token supply is fixed')

    await expect(
      nftManager.mint({
        sensibleId,
        metaTxId,
        metaOutputIndex,
      })
    ).rejects.toThrow('token supply is fixed')
  })
})

jest.setTimeout(30000)
describe('NFT Mint - v2', () => {
  it('init', async () => {
    expect(nftManager).toBeInstanceOf(NftManager)
  })

  it('mint', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0
    const genesisInfo = await genesis()

    const { txid } = await nftManager.mint({
      sensibleId: genesisInfo.sensibleId,
      metaTxId,
      metaOutputIndex,
      // genesisWif: process.env.WIF,
      // receiverAddress,
    })

    console.log({ txid })
    expect(txid).toHaveLength(64)

    await sleep(5000)

    // ask api to return nft info
    const nftInfo = await nftManager.api.getNonFungibleTokenUnspentDetail(genesisInfo.codehash!, genesisInfo.genesis!, '0')

    expect(nftInfo.tokenIndex).toBe(0)
    expect(nftInfo.tokenAddress).toBe(process.env.ADDRESS)
    expect(nftInfo.txId).toBe(txid)
    expect(genesisInfo.codehash).toBe('e114e9652b0a3e4a911e6fb183461ae6e16d7729')
  })

  it('When totalSupply is reached, it is not allowed to mint again.', async () => {
    const metaTxId = ''
    const metaOutputIndex = 0

    // 创世，设置totalSupply为1
    const { sensibleId } = await nftManager.genesis({ totalSupply: '1' }) as {
      sensibleId: string
    }

    // 铸造1个
    const { tx } = await nftManager.mint({
      sensibleId,
      metaTxId,
      metaOutputIndex,
    })
    // 此tx应只有两个output，不存在genesis utxo
    expect(tx!.outputs.length).toBe(2)

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
