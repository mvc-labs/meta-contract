import 'dotenv/config'
import { Wallet, API_NET, API_TARGET, NftManager, mvc } from '../../../src'
import { ContractUtil } from '../../../src/mcp01/contractUtil'
ContractUtil.init()

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager

jest.setTimeout(300000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = parseInt(process.env.FEEB || '1')

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

async function mintSomeNfts(reGenesis: boolean = false) {
  let genesisInfo: any
  if (reGenesis) {
    const { sensibleId, genesis, codehash } = await nftManager.genesis({ totalSupply: '1000' })
    genesisInfo = { sensibleId, genesis, codehash }
    console.log({ genesisInfo })
  } else {
    genesisInfo = {
      // sensibleId: 'fe7c1750d06235c4ee42c32de3e3e29beb82e349aeecf65091f0e804a692582100000000', // release mainnet
      // genesis: '02496ae0a5ed28bd04583ca8aabf9138ae6113b1',
      // codehash: 'e205939ad9956673ce7da9fbd40514b30f66dc35',

      // release testnet
      sensibleId: '838a282dbe8c2a4565d724832236d3190d028a5e31424a11a8952ba8b6135e6600000000',
      genesis: '7d02adb2c1511d6ffc7bbe540cbad2d8492d4b9b',
      codehash: 'e205939ad9956673ce7da9fbd40514b30f66dc35',
    }
  }
  const { sensibleId, genesis, codehash } = genesisInfo

  const { txid, tokenIndex } = await nftManager.mint({
    sensibleId: sensibleId,
    metaTxId: '',
    metaOutputIndex: 0,
  })
  console.log('mintId', txid)

  return { sensibleId, genesis, codehash, mintTxId: txid, tokenIndex }
}

describe('NFT 销售测试', () => {
  it.skip('基础售卖', async () => {
    const { genesis, codehash, tokenIndex } = await mintSomeNfts(false)
    console.log({ tokenIndex })

    const { txid, sellTxId } = await nftManager.sell({
      genesis,
      codehash,
      tokenIndex,
      sellerWif: process.env.WIF,
      price: 25600,
    })

    console.log({ txid, sellTxId })

    // 确认nft已经在销售合约地址上
    // 先等待15秒，等待交易确认
    await new Promise((resolve) => setTimeout(resolve, 15000))
    // 查询合约地址
    const { contractAddress } = await wallet.api.getNftSellUtxo(codehash, genesis, tokenIndex, true)
    // 查询nft地址
    const { tokenAddress } = await wallet.api.getNonFungibleTokenUnspentDetail(
      codehash,
      genesis,
      tokenIndex
    )
    // 确认合约地址和nft地址一致
    expect(contractAddress).toBe(tokenAddress)
  })

  it.skip('售价不能低于22000 satoshis', async () => {
    const { genesis, codehash, tokenIndex } = await mintSomeNfts(false)
    console.log({ tokenIndex })

    await expect(
      nftManager.sell({
        genesis,
        codehash,
        tokenIndex,
        sellerWif: process.env.WIF,
        price: 21999,
      })
    ).rejects.toThrow(
      'Selling Price must be greater than or equals to 22000 satoshis. 销售价格最低为22000聪。'
    )
  })

  it.skip('速度测试', async () => {
    const { genesis, codehash, tokenIndex } = await mintSomeNfts(false)

    const timerName = 'sell'
    console.time(timerName)
    const { txid, sellTxId } = await nftManager.sell({
      genesis,
      codehash,
      tokenIndex,
      sellerWif: process.env.WIF,
      price: 25600,
    })
    console.timeEnd(timerName)
  })

  it('速度测试 - 代理', async () => {
    const { genesis, codehash, tokenIndex } = await mintSomeNfts(false)
    const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN

    const apiHost =
      network === API_NET.MAIN
        ? 'https://api.show3.io/metasv'
        : 'https://testmvc.showmoney.app/metasv'

    const proxy = new NftManager({
      network,
      apiTarget: API_TARGET.MVC,
      apiHost,
      purse: process.env.WIF!,
      feeb: 1,
    })
    proxy.api.authorize({ authorization: process.env.METASV_BEARER })

    const timerName = 'sell'
    console.time(timerName)

    const { txid, sellTxId } = await nftManager.sell({
      genesis,
      codehash,
      tokenIndex,
      sellerWif: process.env.WIF,
      price: 25600,
    })
    console.timeEnd(timerName)
  })
})
