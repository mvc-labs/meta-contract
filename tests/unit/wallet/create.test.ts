import 'dotenv/config'
import { PrivateKey, Networks } from '../../../src/mvc'

beforeAll(async () => {})

describe('创建地址', () => {
  it('正常创建地址与WIF', async () => {
    const network = (process.env.NETWORK as Networks.Type) || 'mainnet'

    const privateKey = PrivateKey.fromRandom(network)
    const wif = privateKey.toWIF()
    const address = privateKey.toAddress(network).toString()

    console.log({ network, wif, address })
  })
})
