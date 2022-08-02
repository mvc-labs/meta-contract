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
    MVCAPI.authorize({
      authorization:
        'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJpbnRlcm5hbF90ZXN0X3Nob3dwYXkiLCJpc3MiOiJNZXRhU1YiLCJleHAiOjE3MTYxMDY4NTl9.lARtWFAxMmCyTqOu9EgxB5SqZPc48dp2iWYKYRyDrrg',
    })

    const address = process.env.ADDRESS
    const res = await MVCAPI.getBalance(address)

    expect(res.balance + res.pendingBalance).toBeGreaterThan(0)
  })

  it.todo('获取地址UTXOs')
  it.todo('广播')
  it.todo('通过txid获取tx信息')
  it.todo('获取FT信息')
  it.todo('获取NFT信息')
})
