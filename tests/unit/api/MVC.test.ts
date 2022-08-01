import { API_NET } from '../../../src/api'
import { MVC } from '../../../src/api/MVC'

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

    const res = await MVCAPI.getBalance('0x0')
    const expacted = {
      balance: 0,
      pendingBalance: 0,
    }

    expect(res).toMatchObject(expacted)
  })
})
