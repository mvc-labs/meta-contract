import 'dotenv/config'
import {Mnemonic, Networks, PrivateKey} from '../../../src/mvc'
import {API_NET, Wallet} from "../../../src";

beforeAll(async () => {
})

describe('创建地址', () => {
    it('正常创建地址与WIF', async () => {
        const network = (process.env.NETWORK as Networks.Type) || 'mainnet'

        const privateKey = PrivateKey.fromRandom(network)
        const wif = privateKey.toWIF()
        const address = privateKey.toAddress(network).toString()

        console.log({network, wif, address})


    })

    it('mnemonicTest', async () => {
        const seed = process.env.MNEMONIC;
        let mnemonic = Mnemonic.fromString(seed);
        console.log(mnemonic.toString())
        let privateKey = mnemonic.toHDPrivateKey("", API_NET.TEST).deriveChild("m/44'/145'/0'");
        console.log(privateKey.hdPublicKey.toString())
        // // do not use pool key , or mandala will not work
        let reserveKey = privateKey.deriveChild(0).deriveChild(1);
        // send test coin from reserve address to test address
        let testKey = privateKey.deriveChild(0).deriveChild(2);
        console.log("reserve address " + reserveKey.privateKey.toAddress(API_NET.TEST).toString())
        console.log("test address " + testKey.privateKey.toAddress(API_NET.TEST).toString())
        console.log("test privateKey " + testKey.privateKey.toWIF())
        let wallet = new Wallet(reserveKey.privateKey.toWIF(), API_NET.TEST, 0.5);
        let result = await wallet.send(testKey.privateKey.toAddress(API_NET.TEST).toString(), 1000000000);
        console.log(result)

    })
})
