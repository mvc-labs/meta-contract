import ProtoHeader = require('../deployments/protoheader');
import Common = require('../deployments/common')
import { mvc } from 'mvc-scryptlib';
import TokenProto = require('../deployments/tokenProto');

const tokenVersion = Common.getUInt32Buf(1)
const tokenType = Common.getUInt32Buf(1)
const PROTO_FLAG = ProtoHeader.PROTO_FLAG
const TOKEN_NAME = Buffer.alloc(TokenProto.TOKEN_NAME_LEN, 0)
TOKEN_NAME.write('test token name')
const TOKEN_SYMBOL = Buffer.alloc(TokenProto.TOKEN_SYMBOLE_LEN, 0)
TOKEN_SYMBOL.write('test')
const DECIMAL_NUM = Buffer.from('08', 'hex')

export function createGenesisContract(genesisClass, issuerAddress: mvc.Address, genesisTxid: Buffer) {
    const genesis = new genesisClass()
    const contractData = Buffer.concat([
        TOKEN_NAME,
        TOKEN_SYMBOL,
        DECIMAL_NUM,
        issuerAddress.hashBuffer, // address
        Buffer.alloc(8, 0), // token value
        Buffer.alloc(20, 0), // genesisHash
        genesisTxid, // genesisTxid
        tokenVersion,
        tokenType, // type
        PROTO_FLAG,
    ])
    genesis.setDataPart(Common.buildScriptData(contractData).toString('hex'))

    return genesis
}

export function createTokenContract(
    tokenClass, 
    addressBuf: Buffer, 
    amount: bigint, 
    genesisHash: Buffer, 
    genesisTxid: Buffer, 
    transferCheckCodeHashArray, 
    unlockContractCodeHashArray
    ) {
    const token = new tokenClass(transferCheckCodeHashArray, unlockContractCodeHashArray)
    const data = Buffer.concat([
        TOKEN_NAME,
        TOKEN_SYMBOL,
        DECIMAL_NUM,
        addressBuf,
        Common.getUInt64Buf(amount),
        genesisHash, // genesisHash
        genesisTxid, // genesisTxid
        tokenVersion,
        tokenType, // type
        PROTO_FLAG,
    ])
    const res = Common.buildScriptData(data)
    token.setDataPart(res.toString('hex'))
    return token
}

export function createInputTx(contract, prevTx: mvc.Transaction, inputSatoshis: number) {
    const tx = new mvc.Transaction()
    tx.version = Common.TX_VERSION
    if (prevTx) {
        Common.addInput(tx, prevTx.id, 0, prevTx.outputs[0].script, inputSatoshis, [])
    } else {
        const address = mvc.Address.fromPublicKeyHash(Buffer.alloc(20, 0), 'testnet')
        Common.addInput(tx, Common.dummyTxId, 0, mvc.Script.buildPublicKeyHashOut(address), inputSatoshis, [], true)
    }
    tx.addOutput(new mvc.Transaction.Output({
        script: contract.lockingScript,
        satoshis: inputSatoshis,
    }))
    return tx
}