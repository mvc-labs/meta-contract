import { API_NET, API_TARGET } from '../../../src/api'
import { Wallet } from '../../../src/wallet'
import 'dotenv/config'

describe('钱包测试', () => {
  it('正常初始化', async () => {
    const wif = process.env.WIF
    const feeb = 0.05
    const wallet = new Wallet(wif, API_NET.MAIN, feeb, API_TARGET.MVC)
    expect(wallet).toBeInstanceOf(Wallet)
  })
})
