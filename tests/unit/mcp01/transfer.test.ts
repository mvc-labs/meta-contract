import 'dotenv/config'
import { NftManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager
let sensibleId = '2e4c6155ead72bb2e5d33c0e7b24c87c8be4864d7d235dad7b0445514a843e2a00000000'
let mintTxId: string
let genesis = '413460e744000157926178c5b87724051b9ebfc3'
let codehash = 'd80d955b2bbbe4309e9df982fa37646963f61cf1'
// let codehash = 'a771584dc693966b8d98ff3e02d906f840416f49'
// let genesis = '39a4da6b72901545f4560822bd752a95e8727e5f'

jest.setTimeout(30000)
beforeAll(async () => {
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, API_NET.MAIN, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, API_NET.MAIN, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })

  nftManager = new NftManager({
    network: API_NET.MAIN,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  nftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  // 创世并铸造
  // const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  // const tokenName = 'Mint - ' + currentDate
  // const tokenSymbol = 'HelloWorld'
  // const decimalNum = 8
  // const genesisResult = await nftManager.genesis({
  //   tokenName,
  //   tokenSymbol,
  //   decimalNum,
  // })
  // codehash = genesisResult.codehash
  // genesis = genesisResult.genesis
  // sensibleId = genesisResult.sensibleId
  // let { txid } = await nftManager.mint({
  //   sensibleId,
  //   genesisWif: process.env.WIF,
  //   receiverAddress: wallet.address,
  //   tokenAmount: '460',
  // })
  // mintTxId = txid
  // console.log(mintTxId)
})

describe('转账', () => {
  it('正常初始化', async () => {
    expect(nftManager).toHaveProperty('transfer')
  })

  it('正常转账', async () => {
    let res = await nftManager.transfer({
      genesis,
      codehash,
      tokenIndex: '1',
      senderWif: wallet.privateKey.toWIF(),
      receiverAddress: wallet.address.toString(),
    })

    console.log(res)
    // expect(transferTxId).toHaveLength(64)
  })
})
