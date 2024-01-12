import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let ftManager: FtManager
let codehash: string
let genesis: string
let sensibleId: string
let genesisTxId: string

beforeEach(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2] = [process.env.WIF, process.env.WIF2] as string[]
  const feeb = 1

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })

  ftManager = new FtManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  ftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  const tokenName = 'Mint - ' + currentDate
  const tokenSymbol = 'HelloWorld'
  const decimalNum = 8

  // const genesisResult = await ftManager.genesis({
  //   tokenName,
  //   tokenSymbol,
  //   decimalNum,
  //   genesisWif: wif,
  // })
  // codehash = genesisResult.codehash
  // genesis = genesisResult.genesis
  // genesisTxId = genesisResult.txid
  // sensibleId = genesisResult.sensibleId
})

async function genesisSomeTokens(version = 2) {
  let genesisInfo: any
  const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  const tokenName = 'Test Token - ' + currentDate
  const tokenSymbol = 'RR'
  const decimalNum = 18
  const { sensibleId, genesis, codehash } = await ftManager.genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
    version,
  })
  genesisInfo = { sensibleId, genesis, codehash }
  console.log({ genesisInfo })

  return genesisInfo
}

jest.setTimeout(60000)
describe('FT 铸造测试', () => {
  it('正常初始化', async () => {
    expect(ftManager).toBeInstanceOf(FtManager)
  })

  const receiverAddress = process.env.ADDRESS!

  it.skip('正常铸造', async () => {
    let { txid } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF!,
      receiverAddress,
      tokenAmount: '10000000000',
    })

    expect(txid).toHaveLength(64)

    console.log({ txid })
  })

    it('v1', async () => {
      const { sensibleId, genesis, codehash } = await genesisSomeTokens(1)

      let { txid } = await ftManager.mint({
        version: 1,
        sensibleId,
        genesisWif: process.env.WIF!,
        receiverAddress,
        tokenAmount: '1000',
      })

      expect(txid).toHaveLength(64)

      // ask api to return the balance
      let res = await ftManager.api.getFungibleTokenBalance(codehash, genesis, receiverAddress)
      expect(res.pendingBalance).toBe('1000')
      expect(codehash).toBe('a2421f1e90c6048c36745edd44fad682e8644693')

      console.log({ txid })
    })

  it('v2', async () => {
    const { sensibleId, genesis, codehash } = await genesisSomeTokens()

    let { txid } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF!,
      receiverAddress,
      tokenAmount: '1000',
    })

    expect(txid).toHaveLength(64)

    // ask api to return the balance
    let res = await ftManager.api.getFungibleTokenBalance(
      codehash,
      genesis,
      receiverAddress
    )
    expect(res.pendingBalance).toBe('1000')
    expect(codehash).toBe('c9cc7bbd1010b44873959a8b1a2bcedeb62302b7')

    console.log({ txid })
  })

  it.skip('连续铸造，拥有同样的sensibleId、Genesis、CodeHash', async () => {
    let { txid: firstTxId } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF2!,
      receiverAddress,
      tokenAmount: '100000',
    })
    // let { txid: secondTxId } = await ftManager.mint({
    //   sensibleId,
    //   genesisWif: process.env.WIF,
    //   receiverAddress,
    //   tokenAmount: '100000',
    // })

    // let res = await ftManager.api.getFungibleTokenBalance()
  })
})
