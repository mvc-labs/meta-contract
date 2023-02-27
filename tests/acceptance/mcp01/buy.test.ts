import 'dotenv/config'
import { Wallet, API_NET, API_TARGET, NftManager, mvc } from '../../../src'
import { ContractUtil } from '../../../src/mcp01/contractUtil'
ContractUtil.init()

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager
let nftManager2: NftManager

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
  nftManager2 = new NftManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif2,
    feeb: feeb,
  })
  nftManager2.api.authorize({ authorization: process.env.METASV_BEARER })
})

async function sellSomeNfts(reGenesis: boolean = false, price: number = 50000) {
  const nftManager = new NftManager({
    network: process.env.NETWORK as API_NET,
    apiTarget: API_TARGET.MVC,
    purse: process.env.WIF,
    feeb: 1,
  })

  let genesisInfo: any
  if (reGenesis) {
    const { sensibleId, genesis, codehash } = await nftManager.genesis({ totalSupply: '1000' })
    genesisInfo = { sensibleId, genesis, codehash }
  } else {
    genesisInfo = {
      // release mainnet
      // sensibleId: 'fe7c1750d06235c4ee42c32de3e3e29beb82e349aeecf65091f0e804a692582100000000',
      // genesis: '02496ae0a5ed28bd04583ca8aabf9138ae6113b1',
      // codehash: 'e205939ad9956673ce7da9fbd40514b30f66dc35',

      // debug mainnet
      // codehash: '48d6118692b459fabfc2910105f38dda0645fb57',
      // genesis: '1f7e8d1818f89a1f0b1f9c5634c25c6e8d76637d',
      // sensibleId: 'fe804f40a84623c00b5fc8e1844b4185a3fcfb795e5aa0ec6466b13cf5792fe900000000',

      // debug testnet
      // sensibleId: '3ed9aaf9e9d74d1c9ede3c4b9f53d861fe7172ff4448d1bd12c627b42b580cac00000000',
      // genesis: '7873ed838cc26071042eb02c701dc4427d4fde1d',
      // codehash: '48d6118692b459fabfc2910105f38dda0645fb57',

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

  const { sellTx, sellTxId } = await nftManager.sell({
    genesis,
    codehash,
    tokenIndex,
    sellerWif: process.env.WIF,
    price,
  })

  const rawSellUtxo = sellTx.outputs[0]
  const sellUtxo = {
    txId: sellTxId,
    outputIndex: 0,
    sellerAddress: process.env.ADDRESS,
    price,
  }

  return {
    genesis,
    codehash,
    tokenIndex,
    sellUtxo,
    rawSellUtxo,
  }
}

describe('NFT 购买', () => {
  it.skip('创世一下', async () => {
    await sellSomeNfts(true)
  })

  it.skip('自己购买', async () => {
    const { genesis, codehash, tokenIndex, sellUtxo } = await sellSomeNfts(false)
    console.log({ tokenIndex })

    // 等待15秒
    await new Promise((resolve) => setTimeout(resolve, 15000))

    const res = await nftManager.buy({
      genesis,
      codehash,
      tokenIndex,
      buyerWif: process.env.WIF,
      // sellUtxo,
    })

    // 验证两个tx均在链上
    const seeTransfer = await nftManager.api.checkTxSeen(res.txid)
    const seeUnlock = await nftManager.api.checkTxSeen(res.unlockCheckTxId)
    expect(seeTransfer).toBe(true)
    expect(seeUnlock).toBe(true)

    // 验证nft在自己手中
    const nft = await nftManager.api.getNonFungibleTokenUnspentDetail(codehash, genesis, tokenIndex)
    expect(nft.tokenAddress).toBe(wallet.address.toString())
  })

  it.skip('他人购买', async () => {
    const price = 46000
    const { genesis, codehash, tokenIndex, sellUtxo } = await sellSomeNfts(false, price)
    console.log({ tokenIndex })

    // 记录此时我的余额
    const myBalance = await nftManager.api
      .getBalance(process.env.ADDRESS)
      .then((res) => res.balance + res.pendingBalance)

    const other = new NftManager({
      network: process.env.NETWORK as API_NET,
      apiTarget: API_TARGET.MVC,
      purse: process.env.WIF2,
      feeb: 1,
    })

    // 等待15秒
    await new Promise((resolve) => setTimeout(resolve, 15000))

    const res = await other.buy({
      genesis,
      codehash,
      tokenIndex,
      buyerWif: process.env.WIF2,
    })

    // 验证两个tx均在链上
    const seeTransfer = await nftManager.api.checkTxSeen(res.txid)
    const seeUnlock = await nftManager.api.checkTxSeen(res.unlockCheckTxId)
    expect(seeTransfer).toBe(true)
    expect(seeUnlock).toBe(true)

    // 验证nft在用户2手中
    const nft = await nftManager2.api.getNonFungibleTokenUnspentDetail(
      codehash,
      genesis,
      tokenIndex
    )
    expect(nft.tokenAddress).toBe(process.env.ADDRESS2)

    // 验证我的钱包余额增加了
    const myBalance2 = await nftManager.api
      .getBalance(process.env.ADDRESS)
      .then((res) => res.balance + res.pendingBalance)

    console.log({ myBalance, myBalance2, price })
    expect(myBalance2).toBe(myBalance + price)

    // 此nft可转移
    const res2 = await other.transfer({
      genesis,
      codehash,
      tokenIndex,
      senderWif: process.env.WIF2,
      receiverAddress: process.env.ADDRESS,
    })

    // 验证两个tx均在链上
    const seeTransfer2 = await nftManager.api.checkTxSeen(res2.txid)
    expect(seeTransfer2).toBe(true)

    // 验证nft在自己手中
    const nft2 = await nftManager.api.getNonFungibleTokenUnspentDetail(
      codehash,
      genesis,
      tokenIndex
    )
    expect(nft2.tokenAddress).toBe(process.env.ADDRESS)
  })

  it.skip('使用指定钱购买', async () => {
    const price = 46000
    const { genesis, codehash, tokenIndex, sellUtxo } = await sellSomeNfts(false, price)
    console.log({ tokenIndex })

    // 记录此时我的余额
    const myBalance = await nftManager.api
      .getBalance(process.env.ADDRESS)
      .then((res) => res.balance + res.pendingBalance)

    // 预估价格
    const estimate = await nftManager.getBuyEstimateFee({
      genesis,
      codehash,
      tokenIndex,
      buyerWif: process.env.WIF2,
    })
    console.log({ estimate })

    // 拆出指定的钱
    const wallet2 = new Wallet(process.env.WIF2, process.env.NETWORK as API_NET, 1)
    await wallet2.send(process.env.ADDRESS2, estimate)
    // 拿回来
    const utxos = await wallet2.getUnspents()
    console.log({ utxos })
    const theUtxo = utxos.find((u) => u.satoshis === estimate)
    theUtxo.wif = process.env.WIF2

    // 等待15秒
    await new Promise((resolve) => setTimeout(resolve, 15000))

    const res = await nftManager.buy({
      genesis,
      codehash,
      tokenIndex,
      buyerWif: process.env.WIF2,
      utxos: [theUtxo],
    })

    // 验证两个tx均在链上
    const seeTransfer = await nftManager.api.checkTxSeen(res.txid)
    const seeUnlock = await nftManager.api.checkTxSeen(res.unlockCheckTxId)
    expect(seeTransfer).toBe(true)
    expect(seeUnlock).toBe(true)

    // 验证nft在自己手中
    const nft = await nftManager.api.getNonFungibleTokenUnspentDetail(codehash, genesis, tokenIndex)
    expect(nft.tokenAddress).toBe(process.env.ADDRESS2)
  })

  it('取消出售', async () => {
    const { genesis, codehash, tokenIndex, sellUtxo } = await sellSomeNfts(false)
    console.log({ tokenIndex })

    // 等待15秒
    await new Promise((resolve) => setTimeout(resolve, 15000))

    const { txid, unlockCheckTxId } = await nftManager.cancelSell({
      genesis,
      codehash,
      tokenIndex,
      sellerWif: process.env.WIF,
    })
    console.log({ txid, unlockCheckTxId })

    // 验证两个tx均在链上
    const seeTransfer = await nftManager.api.checkTxSeen(txid)
    const seeUnlock = await nftManager.api.checkTxSeen(unlockCheckTxId)
    expect(seeTransfer).toBe(true)
    expect(seeUnlock).toBe(true)

    // 验证nft在自己手中
    const nft = await nftManager.api.getNonFungibleTokenUnspentDetail(codehash, genesis, tokenIndex)
    expect(nft.tokenAddress).toBe(wallet.address.toString())
  })

  it.todo('购买费用预估')
  it.skip('取消购买费用预估', async () => {
    const { genesis, codehash, tokenIndex } = await sellSomeNfts(false)
    console.log({ tokenIndex })

    // 等待15秒
    await new Promise((resolve) => setTimeout(resolve, 15000))

    const estimate = await nftManager.getCancelSellEstimateFee({
      genesis,
      codehash,
      tokenIndex,
      sellerWif: process.env.WIF,
    })
    console.log({ estimate })
  })

  it.todo('中间找零地址')
})
