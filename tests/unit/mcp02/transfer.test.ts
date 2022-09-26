import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let ftManager: FtManager
let sensibleId = 'b5f7ebcad420ff6c57d4a29d157cf8eec3ee9b2f5c001060949f66382d84691000000000'
let mintTxId: string
let genesis
let codehash
// let genesis = 'bcbcdd9e34b74ebf60e48e28fcc3aa9dc9159781'
// let codehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
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

  ftManager = new FtManager({
    network: API_NET.MAIN,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  ftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  // 创世并铸造
  const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  const tokenName = '测试MVC Token'
  const tokenSymbol = 'HelloWorld'
  const decimalNum = 8
  const genesisResult = await ftManager.genesis({
    tokenName,
    tokenSymbol,
    decimalNum,
  })
  codehash = genesisResult.codehash
  genesis = genesisResult.genesis
  sensibleId = genesisResult.sensibleId
  let { txid } = await ftManager.mint({
    sensibleId,
    genesisWif: process.env.WIF,
    receiverAddress: wallet.address.toString(),
    tokenAmount: '10000',
  })
  mintTxId = txid
  console.log(mintTxId)
})

describe('转账', () => {
  it('正常初始化', async () => {
    expect(ftManager).toHaveProperty('transfer')
  })

  it('正常转账', async () => {
    let { txid: transferTxId } = await ftManager.transfer({
      genesis: '0eacb9c6826b48e3573b09df5027b9f538eb26f0',
      codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
      receivers: [
        {
          amount: '46',
          address: wallet.address.toString(),
        },
      ],
      senderWif: process.env.WIF,
    })
    console.log(transferTxId)
    expect(transferTxId).toHaveLength(64)
  })
})
