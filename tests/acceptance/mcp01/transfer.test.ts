import 'dotenv/config'
import { NftManager, Wallet, API_NET, API_TARGET } from '../../../src'
import { sleep } from '../test-helpers'

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager

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
    purse: process.env.WIF!,
    feeb: feeb,
  })
  nftManager.api.authorize({ authorization: process.env.METASV_BEARER })
})

// 创世并铸造
async function genesisAndMint(version = 2) {
  const { sensibleId, genesis, codehash } = await nftManager.genesis({ totalSupply: '46', version })

  const { txid } = await nftManager.mint({
    version,
    sensibleId: sensibleId!,
    metaTxId: '',
    metaOutputIndex: 0,
  })

  return { sensibleId, genesis, codehash, mintTxId: txid }
}

describe('NFT Transfer - v1', () => {
  it('正常初始化', async () => {
    expect(nftManager).toHaveProperty('transfer')
  })

  it('正常转账', async () => {
    const mintRes = await genesisAndMint(1)

    const { genesis, codehash, mintTxId } = mintRes
    const tokenIndex = '0'

    let res = await nftManager.transfer({
      genesis,
      codehash,
      tokenIndex,
      senderWif: process.env.WIF,
      receiverAddress: process.env.ADDRESS3,
    })

    expect(codehash).toBe('e205939ad9956673ce7da9fbd40514b30f66dc35')

    await sleep(3000)

    let nftInfo = await nftManager.api.getNonFungibleTokenUnspentDetail(codehash!, genesis!, tokenIndex!)

    expect(nftInfo.tokenAddress).toBe(process.env.ADDRESS3)
    expect(nftInfo.txId).toBe(res.txid)
  })

  it.skip('转MetaName', async () => {
    const genesis = '1a2f7b2160d7cf398da9c13fd4bcbc8ee7919dd6'
    const codehash = '48d6118692b459fabfc2910105f38dda0645fb57'
    const tokenIndex = '4'
    let res = await nftManager.transfer({
      genesis,
      codehash,
      tokenIndex,
      senderWif: process.env.WIF4,
      receiverAddress: process.env.ADDRESS4,
    })
    console.log(res.txid)

    expect(res.txid).toHaveLength(64)
  })
})

describe('NFT Transfer - v2', () => {
  it('正常初始化', async () => {
    expect(nftManager).toHaveProperty('transfer')
  })

  it('正常转账', async () => {
    const mintRes = await genesisAndMint()

    const { genesis, codehash, mintTxId } = mintRes
    const tokenIndex = '0'

    let res = await nftManager.transfer({
      genesis,
      codehash,
      tokenIndex,
      senderWif: process.env.WIF,
      receiverAddress: process.env.ADDRESS3,
    })

    expect(codehash).toBe('e114e9652b0a3e4a911e6fb183461ae6e16d7729')

    await sleep(3000)

    let nftInfo = await nftManager.api.getNonFungibleTokenUnspentDetail(codehash!, genesis!, tokenIndex!)

    expect(nftInfo.tokenAddress).toBe(process.env.ADDRESS3)
    expect(nftInfo.txId).toBe(res.txid)
  })

  it.skip('转MetaName', async () => {
    const genesis = '1a2f7b2160d7cf398da9c13fd4bcbc8ee7919dd6'
    const codehash = '48d6118692b459fabfc2910105f38dda0645fb57'
    const tokenIndex = '4'
    let res = await nftManager.transfer({
      genesis,
      codehash,
      tokenIndex,
      senderWif: process.env.WIF4,
      receiverAddress: process.env.ADDRESS4,
    })
    console.log(res.txid)

    expect(res.txid).toHaveLength(64)
  })
})
