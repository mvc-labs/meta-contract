import { API_NET } from '../../../src/api'
import { MVC } from '../../../src/api/MVC'
import 'dotenv/config'

describe('MetaSV MVC API测试', () => {
  it('正常初始化', async () => {
    const MVCAPI = new MVC(API_NET.MAIN)

    expect(MVCAPI).toBeInstanceOf(MVC)
  })

  it('获取地址余额', async () => {
    const MVCAPI = new MVC(API_NET.MAIN)
    MVCAPI.authorize({ authorization: process.env.METASV_BEARER })

    const address = process.env.ADDRESS
    const res1 = await MVCAPI.getBalance(address)
    console.log(`账号1余额 - balance: ${res1.balance} - pendingBalance: ${res1.pendingBalance}`)

    const address2 = process.env.ADDRESS2
    const res2 = await MVCAPI.getBalance(address2)
    console.log(`账号2余额 - balance: ${res2.balance} - pendingBalance: ${res2.pendingBalance}`)

    expect(res1.balance + res1.pendingBalance).toBeGreaterThan(0)
  })

  it.todo('获取地址UTXOs')
  it.todo('广播')
  it.todo('通过txid获取tx信息')
  it.todo('获取FT信息')
  it.todo('获取NFT信息')
})
