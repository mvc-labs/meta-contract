import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let wallet3: Wallet
let ftManager: FtManager
let sensibleId = 'b5f7ebcad420ff6c57d4a29d157cf8eec3ee9b2f5c001060949f66382d84691000000000'
let mintTxId: string
let genesis
let codehash

jest.setTimeout(30000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2, wif3] = [process.env.WIF, process.env.WIF2, process.env.WIF3] as string[]
  const feeb = 0.5

  wallet = new Wallet(wif, network, feeb, API_TARGET.MVC)
  wallet2 = new Wallet(wif2, network, feeb, API_TARGET.MVC)
  wallet3 = new Wallet(wif3, network, feeb, API_TARGET.MVC)
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet2.api.authorize({ authorization: process.env.METASV_BEARER })
  wallet3.api.authorize({ authorization: process.env.METASV_BEARER })

  ftManager = new FtManager({
    network: network,
    apiTarget: API_TARGET.MVC,
    purse: wif,
    feeb: feeb,
  })
  ftManager.api.authorize({ authorization: process.env.METASV_BEARER })

  // 创世并铸造
  // const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
  // const tokenName = '测试MVC Token - ' + currentDate
  // const tokenSymbol = 'HelloWorld'
  // const decimalNum = 8
  // const genesisResult = await ftManager.genesis({
  //   tokenName,
  //   tokenSymbol,
  //   decimalNum,
  // })
  // codehash = genesisResult.codehash
  // genesis = genesisResult.genesis
  // sensibleId = genesisResult.sensibleId
  // let { txid } = await ftManager.mint({
  //   sensibleId,
  //   genesisWif: process.env.WIF,
  //   receiverAddress: wallet.address.toString(),
  //   tokenAmount: '10000',
  // })
  // mintTxId = txid
  // console.log({ mintTxId })

  codehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
  genesis = '45e78fd83fb2ded9e7eb645ac43a5c31c529501f'
})

describe('转账', () => {
  it('正常初始化', async () => {
    expect(ftManager).toHaveProperty('transfer')
  })

  it('正常转账', async () => {
    // console.log({ genesis, codehash })
    // let { txid } = await ftManager.transfer({
    //   genesis,
    //   codehash,
    //   receivers: [
    //     {
    //       amount: '100000',
    //       address: wallet2.address.toString(),
    //       // address: 'n3bupZH1K1NEqXdBRw5dfkJtpAhSvLwedM',
    //     },
    //   ],
    //   senderWif: process.env.WIF,
    // })
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '100000',
          address: 'mjdRRKd3qCwiLwyHhuCQA5nniUEPofwpro',
        },
      ],
      senderWif: process.env.WIF,
    })
    console.log(transferTxId)
    expect(transferTxId).toHaveLength(64)
  })

  it.skip('mtt转账', async () => {
    const mttGenesis = '1828fa4fa01c6e6b76509355ea0c16abd3535660'
    const mttCodehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
    const mttManager = new FtManager({
      network: API_NET.TEST,
      apiTarget: API_TARGET.MVC,
      purse: process.env.WIF3,
      feeb: 1,
    })
    mttManager.api.authorize({ authorization: process.env.METASV_BEARER })
    let { txid } = await mttManager.transfer({
      genesis: mttGenesis,
      codehash: mttCodehash,
      receivers: [
        {
          amount: '10000',
          address: wallet.address.toString(),
          // address: 'n3bupZH1K1NEqXdBRw5dfkJtpAhSvLwedM',
        },
      ],
      senderWif: process.env.WIF3,
    })

    console.log(txid)
    expect(txid).toHaveLength(64)
  })
})
