import 'dotenv/config'
import { NftManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let nftManager: NftManager
let sensibleId = '4ed27df9620f4f515bb6201f05d2161ffdea24efa746c641684b8aadf9a1c29500000000'
let mintTxId: string
let genesis = 'b4b730eb541a8f5fe765b515a4cb50b04166cd12'
let codehash = '62de3500752a71955c836b21d9fd94bc90fe24c2'
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
      tokenIndex: '2',
      senderWif: wallet.privateKey.toWIF(),
      receiverAddress: wallet.address.toString(),
    })

    console.log(res)
    // expect(transferTxId).toHaveLength(64)
  })
})
