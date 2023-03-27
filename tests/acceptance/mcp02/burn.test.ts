import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'
import { Transaction } from '../../../src/mvc'

let wallet: Wallet
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
  wallet.api.authorize({ authorization: process.env.METASV_BEARER })

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
      sensibleId: 'a93c28288643b2425f984c93e6b6ad7c1b3330c0c69d8613e5557238922e16ae00000000',
      genesis: '039032ade3d49a6d4ff41c33b3d63ea5c986f310',
      codehash: 'a2421f1e90c6048c36745edd44fad682e8644693',
      // debug testnet
      // sensibleId: '27a97925b5550f6178661489a73602ce0e14a725e4f86bfa664de21eaff2964100000000',
      // genesis: '728996c04c1571b122f20f466698c55c7dbcca5e',
      // codehash: '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04',
    }
  }

  return genesisInfo
}

describe('焚毁', () => {
  it('正常初始化', async () => {
    expect(ftManager).toHaveProperty('burn')
  })

  it('正常焚毁', async () => {
    const { genesis, codehash } = await mintSomeTokens(false)
    const network = process.env.NETWORK === 'testnet' ? API_NET.TEST : API_NET.MAIN
    const apiHost =
      network === API_NET.MAIN
        ? 'https://api.show3.io/metasv'
        : 'https://testmvc.showmoney.app/metasv'

    const proxy = new FtManager({
      network,
      apiTarget: API_TARGET.MVC,
      apiHost,
      purse: process.env.WIF!,
      feeb: 1,
    })
    proxy.api.authorize({ authorization: process.env.METASV_BEARER })

    let { txid: transferTxId } = await proxy.burn({
      genesis,
      codehash,
      amount: '100',
      senderWif: process.env.WIF!,
    })

    console.log({ transferTxId })
    expect(transferTxId).toHaveLength(64)
  })
})
