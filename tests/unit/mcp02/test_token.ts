
// import { API_NET, SensibleFT } from './index'

// async function main() {
//     const feeb = 1
//     const network = API_NET.TEST
//     const wif = 'cSoo7a7sgDz7xLCYxyVeFSQ7Re6bisCokNU8MkQAbyfsfUYk6cT5'
//     const codehash = '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04'
//     const genesis = '1828fa4fa01c6e6b76509355ea0c16abd3535660'
//     const address = 'mstiV2oJRH7DFCHTQs1HuZApVMkEwNNKA8'
//     const ft = new SensibleFT({
//         feeb,
//         network,
//         purse: wif,
//         debug: true,
//     })

//     const res = await ft.transfer({
//         codehash,
//         genesis,
//         senderWif: wif,
//         receivers: [{address, amount: '10000000'}]
//     })

//     console.log('res:', res)
// }

// main()