import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET } from '../../../src'

let wallet: Wallet
let wallet2: Wallet
let ftManager: FtManager

beforeAll(async () => {
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
})

describe('FT 创世测试', () => {
  it('正常初始化', async () => {
    expect(ftManager).toBeInstanceOf(FtManager)
  })

  it('正常创世', async () => {
    const tokenName = 'SPACE-MIT'
    const tokenSymbol = 'SMIT'
    const decimalNum = 8
    const dataCarrier = {
      type: 'metacontract',
      tokenName,
      tokenSymbol,
      decimalNum,
      desc: 'SPACE-MIT(SMIT) is a reward token launched for the MVC Incentivized Testnet (MIT). You can swap the reward to the Mainnet coin in a specific ratio after the launch of MVC Mainnet.',
      icon: '',
      website: 'https://mvc.space/',
      issuerName: 'MVC Foundation',
      signers: [],
    }
    const scriptPayload = [
      'meta',
      pNode,
      ParentInfo.data.txId,
      'testmetaid',
      'ftGenesis-' + pNode.substr(0, 12),
      JSON.stringify(dataCarrier),
      '0',
      '1.0.0',
      'text/plain',
      'UTF-8',
    ]

    const genesis = await ftManager.genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
      opreturnData: scriptPayload,
    })

    console.log(genesis)
  })
})
