import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let ftManager: FtManager
let codehash: string
let genesis: string
let sensibleId: string
let genesisTxId: string

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

  const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  const tokenName = 'Mint - ' + currentDate
  const tokenSymbol = 'HelloWorld'
  const decimalNum = 8

  const genesisResult = await ftManager.genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
  })
  codehash = genesisResult.codehash
  genesis = genesisResult.genesis
  genesisTxId = genesisResult.txid
  sensibleId = genesisResult.sensibleId
  // sensibleId = '46c29cbdb9d44ebf35cfca98e769652fb930cf995f838409ec4eb2ca9b33b6f600000000'
})

describe('FT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(ftManager).toBeInstanceOf(FtManager)
  })

  jest.setTimeout(10000)
  it('正常铸造', async () => {
    let { txid } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF,
      receiverAddress: wallet.address,
      tokenAmount: '100',
    })

    expect(txid).toHaveLength(64)

    console.log({ txid })
  })

  jest.setTimeout(20000)
  it('连续铸造，拥有同样的sensibleId、Genesis、CodeHash', async () => {
    console.log({ sensibleId })
    let { txid: firstTxId } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF,
      receiverAddress: wallet.address,
      tokenAmount: '200',
    })
    let { txid: secondTxId } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF,
      receiverAddress: wallet.address,
      tokenAmount: '300',
    })

    // let res = await ftManager.api.getFungibleTokenBalance()
  })
})
