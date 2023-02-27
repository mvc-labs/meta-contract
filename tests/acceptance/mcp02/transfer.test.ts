import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let wallet3: Wallet
let ftManager: FtManager

type Receiver = {
  address: string
  amount: string
}

jest.setTimeout(300000)
beforeAll(async () => {
  const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
  const [wif, wif2, wif3] = [process.env.WIF, process.env.WIF2, process.env.WIF3] as string[]
  const feeb = 1

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
})

async function mintSomeTokens(reGenesis: boolean = false) {
  let genesisInfo: any
  if (reGenesis) {
    const currentDate = new Date().getHours() + ':' + new Date().getMinutes()
    const tokenName = 'Test Token - ' + currentDate
    const tokenSymbol = 'RR'
    const decimalNum = 18
    const { sensibleId, genesis, codehash } = await ftManager.genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
    })
    genesisInfo = { sensibleId, genesis, codehash }
    console.log({ genesisInfo })

    let { txid } = await ftManager.mint({
      sensibleId,
      genesisWif: process.env.WIF!,
      receiverAddress: wallet.address.toString(),
      tokenAmount: '10000',
    })
  } else {
    genesisInfo = {
      // release mainnet
      // sensibleId: 'fe7c1750d06235c4ee42c32de3e3e29beb82e349aeecf65091f0e804a692582100000000',
      // genesis: '02496ae0a5ed28bd04583ca8aabf9138ae6113b1',
      // codehash: 'e205939ad9956673ce7da9fbd40514b30f66dc35',
      // release testnet
      // sensibleId: '838a282dbe8c2a4565d724832236d3190d028a5e31424a11a8952ba8b6135e6600000000',
      // genesis: '7d02adb2c1511d6ffc7bbe540cbad2d8492d4b9b',
      // codehash: 'e205939ad9956673ce7da9fbd40514b30f66dc35',
      // debug testnet
      sensibleId: '27a97925b5550f6178661489a73602ce0e14a725e4f86bfa664de21eaff2964100000000',
      genesis: '728996c04c1571b122f20f466698c55c7dbcca5e',
      codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
    }
  }

  return genesisInfo
}

describe('转账', () => {
  it('正常初始化', async () => {
    expect(ftManager).toHaveProperty('transfer')
  })

  it('铸造后转账', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)

    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '10',
          address: process.env.ADDRESS2!,
        },
      ],
      senderWif: process.env.WIF,
    })
    console.log({ transferTxId })
    expect(transferTxId).toHaveLength(64)
  })

  it('转账后转账', async () => {
    // 先转20到地址2
    const { genesis, codehash } = await mintSomeTokens(false)
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '20',
          address: process.env.ADDRESS2!,
        },
      ],
      senderWif: process.env.WIF,
    })

    // 再从地址2转10到地址3
    let { txid: transferTxId2 } = await ftManager.transfer({
      genesis,
      codehash,
      receivers: [
        {
          amount: '10',
          address: process.env.ADDRESS3!,
        },
      ],
      senderWif: process.env.WIF2,
    })

    console.log({ transferTxId, transferTxId2 })
  })

  it('归并', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)
    let { txid: mergeTxId } = await ftManager.merge({
      genesis,
      codehash,
      ownerWif: process.env.WIF!,
    })
    console.log(mergeTxId)
    expect(mergeTxId).toHaveLength(64)
  })

  it('多人转账', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)
    const receivers: Receiver[] = []
    for (let i = 0; i < 99; i++) {
      receivers.push({
        amount: '10',
        address: process.env.ADDRESS2!,
      })
    }
    let { txid: transferTxId } = await ftManager.transfer({
      genesis,
      codehash,
      receivers,
      senderWif: process.env.WIF,
    })
    console.log(transferTxId)
    expect(transferTxId).toHaveLength(64)
  })
})
