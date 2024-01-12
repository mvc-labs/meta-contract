import 'dotenv/config'
import { FtManager, Wallet, API_NET, API_TARGET, TxComposer, mvc } from '../../../src'
import { getGenesisIdentifiers } from '../../../src/helpers/contractHelpers'

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

jest.setTimeout(60000)
describe('FT 创世测试', () => {
  it('正常初始化', async () => {
    expect(ftManager).toBeInstanceOf(FtManager)
  })

  it('正常创世', async () => {
    const tokenName = 'TEST_FT'
    const tokenSymbol = 'TEST'
    const decimalNum = 18

    const genesis = await ftManager.genesis({
      tokenName,
      tokenSymbol,
      decimalNum,
      genesisWif: process.env.WIF,
      opreturnData: [],
    })

    console.log(genesis)
  })

  it('创世后正确返回genesis信息', async () => {
    const genesisTxId = '4196f2af1ee24d66fa6bf8e425a7140ece0236a789146678610f55b52579a927'
    const genesisTxRaw = await ftManager.api.getRawTxData(genesisTxId)
    const genesisTx = new mvc.Transaction(genesisTxRaw)
    const { codehash, genesis, sensibleId } = getGenesisIdentifiers({
      genesisTx,
      purse: { address: wallet.address },
      transferCheckCodeHashArray: ftManager.transferCheckCodeHashArray,
      unlockContractCodeHashArray: ftManager.unlockContractCodeHashArray,
      type: 'ft',
    })
    expect(sensibleId).toBe('27a97925b5550f6178661489a73602ce0e14a725e4f86bfa664de21eaff2964100000000')
    // expect(codehash).toBe('57344f46cc0d0c8dfea7af3300b1b3a0f4216c04')
    expect(codehash).toBe('c9cc7bbd1010b44873959a8b1a2bcedeb62302b7')
    // expect(genesis).toBe('728996c04c1571b122f20f466698c55c7dbcca5e')
  })
})
