import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let ftManager: FtManager
let codehash: string
let genesis: string
let sensibleId: string

beforeAll(async () => {
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, API_NET.MAIN, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, API_NET.MAIN, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })

  ftManager = new FtManager({
    network: API_NET.MAIN,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  ftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  const tokenName = '测试FT'
  const tokenSymbol = 'HelloWorld'
  const decimalNum = 8

  const genesisResult = await ftManager.genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
  })
  codehash = genesisResult.codehash
  sensibleId = genesisResult.sensibleId
  genesis = genesisResult.genesis
})

describe('FT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(ftManager).toBeInstanceOf(FtManager)
  })

  it('正常铸造', async () => {
    let { txid } = await ftManager.mint({
      genesis,
      codehash,
      sensibleId,
      genesisWif: process.env.WIF,
      receiverAddress: wallet.address,
      tokenAmount: '100',
      allowIncreaseMints: true,
    })

    console.log({ txid })
  })
})
