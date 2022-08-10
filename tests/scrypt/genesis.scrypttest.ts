// import { expect } from 'chai'
import { FtManager } from '../../src/mcp02'

const WIF = 'L2fxpsw8GvePpUHjgHwn13B6tXhoTn3M4EdEhMdh1B94bYnznR7H'
const ADDRESS = '14fv4nEaPCShFHkbqD6YuMkMp87FDLSdGk'

const WIF2 = 'L3WVdrDgeqhpRGdzDeKEZhCvuYxHy3MvxAugVhDioH94AJ14Vf4N'
const ADDRESS2 = '1Fub47P962JmvJiN6jXXJPzf3BBUMteyoL'

const METASV_BEARER =
  'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJpbnRlcm5hbF90ZXN0X3Nob3dwYXkiLCJpc3MiOiJNZXRhU1YiLCJleHAiOjE3MTYxMDY4NTl9.lARtWFAxMmCyTqOu9EgxB5SqZPc48dp2iWYKYRyDrrg'

const FEEB = 0.5

async function run() {
  const ft = new FtManager({
    purse: WIF,
  })

  ft.api.authorize({ authorization: METASV_BEARER })

  const genesisResult = await ft.genesis({
    tokenName: 'COFFEE COIN',
    tokenSymbol: 'CC',
    decimalNum: 3,
    noBroadcast: true
  })

  console.log(genesisResult)

  // const mintResult = await ft.mint({
  //   genesis: genesisResult.genesis,
  //   codehash: genesisResult.codehash,
  //   sensibleId: genesisResult.sensibleId,
  //   receiverAddress: ADDRESS,
  //   tokenAmount: '100',
  //   genesisWif: WIF
  // })

  // console.log(mintResult)

}

run()

// describe('Test genesis contract unlock In Javascript', () => {
//   before(async () => {})

//   it('g0: genesis', async () => {
//     expect(true, 'yes').to.be.true
//   })
// })
