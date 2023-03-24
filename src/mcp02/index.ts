import {buildTypeClasses, Bytes, getPreimage, Int, PubKey, Ripemd160, Sig, SigHashPreimage, toHex,} from '../scryptlib'
import {CodeError, ErrCode} from '../common/error'
import * as mvc from '../mvc'
import {Api, API_NET, API_TARGET} from '..'

import {BURN_ADDRESS, FEEB} from './constants'
import * as BN from '../bn.js'
import * as TokenUtil from '../common/tokenUtil'
import {getTxOutputProof, getUInt64Buf, writeVarint} from '../common/tokenUtil'
import * as $ from '../common/argumentCheck'
import {Prevouts} from '../common/Prevouts'
import {TxComposer} from '../tx-composer'
import {TokenFactory} from './contract-factory/token'
import {ContractUtil} from './contractUtil'
import {CONTRACT_TYPE, isNull, P2PKH_UNLOCK_SIZE, PLACE_HOLDER_PUBKEY, PLACE_HOLDER_SIG,} from '../common/utils'
import {TokenGenesisFactory} from './contract-factory/tokenGenesis'
import {TOKEN_TRANSFER_TYPE, TokenTransferCheckFactory,} from './contract-factory/tokenTransferCheck'
import * as ftProto from './contract-proto/token.proto'
import {DustCalculator} from '../common/DustCalculator'
import {SizeTransaction} from '../common/SizeTransaction'
import {FungibleTokenUnspent} from '../api'
import {
    addChangeOutput,
    addContractInput,
    addContractOutput,
    addOpreturnOutput,
    addP2PKHInputs,
    checkFeeRate,
    prepareUtxos,
    unlockP2PKHInputs,
} from '../helpers/transactionHelpers'
import {getGenesisIdentifiers} from '../helpers/contractHelpers'
import {dummyTxId} from '../common/dummy'
import {hasProtoFlag} from '../common/protoheader'
import {TOKEN_UNLOCK_TYPE, TokenUnlockContractCheckFactory} from "@/mcp02/contract-factory/tokenUnlockContractCheck";
import {Buffer} from "buffer";

const jsonDescr = require('./contract-desc/txUtil_desc.json')
const {TxInputProof, TxOutputProof} = buildTypeClasses(jsonDescr)

const Signature = mvc.crypto.Signature
const _ = mvc.deps._
export const sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID

ContractUtil.init()

function checkParamGenesis(genesis) {
    $.checkArgument(_.isString(genesis), 'Invalid Argument: genesis should be a string')
    $.checkArgument(genesis.length == 40, `Invalid Argument: genesis.length must be 40`)
}

function checkParamCodehash(codehash) {
    $.checkArgument(_.isString(codehash), 'Invalid Argument: codehash should be a string')
    $.checkArgument(codehash.length == 40, `Invalid Argument: codehash.length must be 40`)
    $.checkArgument(
        codehash == ContractUtil.tokenCodeHash ||
        codehash == ContractUtil.tokenGenesisCodeHash ||
        codehash === '57344f46cc0d0c8dfea7af3300b1b3a0f4216c04' ||
        codehash === 'a2421f1e90c6048c36745edd44fad682e8644693',
        `a valid codehash should be ${ContractUtil.tokenCodeHash}, but the provided is ${codehash} `
    )
}

function checkParamReceivers(receivers: TokenReceiver[]) {
    const ErrorName = 'ReceiversFormatError'
    if (isNull(receivers)) {
        throw new CodeError(ErrCode.EC_INVALID_ARGUMENT, `${ErrorName}: param should not be null`)
    }
    if (receivers.length > 0) {
        let receiver = receivers[0]
        if (isNull(receiver.address) || isNull(receiver.amount)) {
            throw new CodeError(
                ErrCode.EC_INVALID_ARGUMENT,
                `${ErrorName}-valid format example
      [
        {
          address: "mtjjuRuA84b2qVyo28AyJQ8AoUmpbWEqs3",
          amount: "1000",
        },
      ]
      `
            )
        }

        let amount = new BN(receiver.amount.toString())
        if (amount.lten(0)) {
            throw `receiver amount must greater than 0 but now is ${receiver.amount}`
        }
    }
}

function parseSensibleID(sensibleID: string) {
    let sensibleIDBuf = Buffer.from(sensibleID, 'hex')
    let genesisTxId = sensibleIDBuf.slice(0, 32).reverse().toString('hex')
    let genesisOutputIndex = sensibleIDBuf.readUIntLE(32, 4)
    return {
        genesisTxId,
        genesisOutputIndex,
    }
}

type Utxo = {
    txId: string
    outputIndex: number
    satoshis: number
    address: mvc.Address
}

type GenesisOptions = {
    tokenName: string
    tokenSymbol: string
    decimalNum: number
    genesisWif: string
}

type ParamUtxo = {
    txId: string
    outputIndex: number
    satoshis: number
    wif?: string
    address?: string | mvc.Address
}

type Purse = {
    privateKey: mvc.PrivateKey
    address: mvc.Address
}

type Mcp02Options = {
    network?: API_NET
    apiTarget?: API_TARGET
    apiHost?: string
    purse?: string
    feeb?: number
    dustLimitFactor?: number
    dustAmount?: number
    debug?: boolean
}

type TokenReceiver = {
    address: string
    amount: string
}

type ParamFtUtxo = {
    txId: string
    outputIndex: number
    tokenAddress: string
    tokenAmount: string
    wif?: string
}

type FtUtxo = {
    txId: string
    outputIndex: number
    satoshis?: number
    lockingScript?: mvc.Script

    tokenAddress?: mvc.Address
    tokenAmount?: BN

    satotxInfo?: {
        txId?: string
        tx?: any
        outputIndex?: number
        txHex?: string
        preTxId?: string
        preOutputIndex?: number
        preTxHex?: string
        txInputsCount?: number
    }

    tx?: any

    preTokenAddress?: mvc.Address
    preTokenAmount?: BN
    preLockingScript?: mvc.Script

    prevTokenTx?: any
    prevTokenInputIndex?: any
    prevTokenOutputIndex?: any

    publicKey?: mvc.PublicKey
}

export class FtManager {
    private network: API_NET
    private _api: Api
    private zeroAddress: mvc.Address
    private purse: Purse
    private feeb: number
    private dustCalculator?: DustCalculator
    transferCheckCodeHashArray: Bytes[]
    unlockContractCodeHashArray: Bytes[]
    private debug: boolean

    get api() {
        return this._api
    }

    get sensibleApi() {
        return this._api
    }

    constructor(
        {
            network = API_NET.MAIN,
            apiTarget = API_TARGET.MVC,
            purse,
            feeb = FEEB,
            apiHost,
            dustLimitFactor = 300,
            dustAmount,
            debug = false,
        }: Mcp02Options) {
        // 初始化API
        this.network = network
        this._api = new Api(network, apiTarget, apiHost)

        // 初始化钱包
        if (purse) {
            const privateKey = mvc.PrivateKey.fromWIF(purse)
            const address = privateKey.toAddress(network)
            this.purse = {
                privateKey,
                address,
            }
        }

        // 初始化零地址
        this.zeroAddress = new mvc.Address(BURN_ADDRESS, network)
        this.dustCalculator = new DustCalculator(dustLimitFactor, dustAmount)
        this.transferCheckCodeHashArray = ContractUtil.transferCheckCodeHashArray
        this.unlockContractCodeHashArray = ContractUtil.unlockContractCodeHashArray

        // 初始化费率
        this.feeb = feeb

        this.debug = false
    }

    /**
     * Create a transaction for genesis
     * @param tokenName token name, limited to 20 bytes
     * @param tokenSymbol the token symbol, limited to 10 bytes
     * @param decimalNum the decimal number, range 0-255
     * @param utxos (Optional) specify mvc utxos
     * @param changeAddress (Optional) specify mvc changeAddress
     * @param opreturnData (Optional) append an opReturn output
     * @param genesisWif the private key of the token genesiser
     * @param noBroadcast (Optional) whether not to broadcast the transaction, the default is false
     * @returns
     */
    public async genesis(
        {
            tokenName,
            tokenSymbol,
            decimalNum,
            utxos: utxosInput,
            changeAddress,
            opreturnData,
            genesisWif,
            noBroadcast = false,
        }: {
            tokenName: string
            tokenSymbol: string
            decimalNum: number
            utxos?: any[]
            changeAddress?: string | mvc.Address
            opreturnData?: any
            genesisWif?: string
            noBroadcast?: boolean
        }) {
        // TODO 检查必要参数
        // validate params
        $.checkArgument(
            _.isString(tokenName) && Buffer.from(tokenName).length <= 40,
            `tokenName should be a string and not be larger than 40 bytes`
        )

        $.checkArgument(
            _.isString(tokenSymbol) && Buffer.from(tokenSymbol).length <= 10,
            'tokenSymbol should be a string and not be larger than 10 bytes'
        )

        $.checkArgument(
            _.isNumber(decimalNum) && decimalNum >= 0 && decimalNum <= 255,
            'decimalNum should be a number and must be between 0 and 255'
        )

        const utxoInfo = await prepareUtxos(this.purse, this.api, this.network, utxosInput)
        if (changeAddress) {
            changeAddress = new mvc.Address(changeAddress, this.network)
        } else {
            changeAddress = utxoInfo.utxos[0].address
        }

        const tokenAddress = genesisWif
            ? mvc.PrivateKey.fromWIF(genesisWif).toAddress(this.network)
            : this.purse.address

        let {txComposer} = await this._genesis({
            tokenName,
            tokenSymbol,
            decimalNum,
            utxos: utxoInfo.utxos,
            utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
            changeAddress: changeAddress as mvc.Address,
            tokenAddress: tokenAddress.hashBuffer.toString('hex'),
            opreturnData,
        })

        let txHex = txComposer.getRawHex()
        if (!noBroadcast) {
            await this.api.broadcast(txHex)
        }

        let {codehash, genesis, sensibleId} = getGenesisIdentifiers({
            genesisTx: txComposer.getTx(),
            purse: {address: tokenAddress, privateKey: this.purse.privateKey},
            transferCheckCodeHashArray: this.transferCheckCodeHashArray,
            unlockContractCodeHashArray: this.unlockContractCodeHashArray,
            type: 'ft',
        })

        return {
            txHex,
            txid: txComposer.getTxId(),
            tx: txComposer.getTx(),
            codehash,
            genesis,
            sensibleId,
        }
    }

    public async issue(options: {
        genesis: string
        codehash: string
        sensibleId: string
        genesisWif: string
        receiverAddress: string | mvc.Address
        tokenAmount: string | BN
        allowIncreaseMints: boolean
        utxos?: ParamUtxo[]
        changeAddress?: string | mvc.Address
        opreturnData?: any
        noBroadcast?: boolean
    }) {
        return this.mint(options)
    }

    public async mint(
        {
            // genesis,
            // codehash,
            sensibleId,
            genesisWif,
            receiverAddress,
            tokenAmount,
            allowIncreaseMints = true,
            utxos: utxosInput,
            changeAddress,
            opreturnData,
            noBroadcast = false,
        }: {
            // genesis: string
            // codehash: string
            sensibleId: string
            genesisWif: string
            receiverAddress: string | mvc.Address
            tokenAmount: string | BN
            allowIncreaseMints?: boolean
            utxos?: any[]
            changeAddress?: string | mvc.Address
            opreturnData?: any
            noBroadcast?: boolean
        }) {
        // checkParamGenesis(genesis)
        // checkParamCodehash(codehash)
        $.checkArgument(sensibleId, 'sensibleId is required')
        $.checkArgument(genesisWif, 'genesisWif is required')
        $.checkArgument(receiverAddress, 'receiverAddress is required')
        $.checkArgument(tokenAmount, 'tokenAmount is required')

        const utxoInfo = await prepareUtxos(this.purse, this.api, this.network, utxosInput)
        if (changeAddress) {
            changeAddress = new mvc.Address(changeAddress, this.network)
        } else {
            changeAddress = utxoInfo.utxos[0].address
        }
        let genesisPrivateKey = new mvc.PrivateKey(genesisWif)
        let genesisPublicKey = genesisPrivateKey.toPublicKey()
        receiverAddress = new mvc.Address(receiverAddress, this.network)
        tokenAmount = new BN(tokenAmount.toString())

        let {txComposer} = await this._mint({
            // genesis,
            // codehash,
            sensibleId,
            receiverAddress,
            tokenAmount,
            allowIncreaseMints,
            utxos: utxoInfo.utxos,
            utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
            changeAddress,
            opreturnData,
            genesisPrivateKey,
            genesisPublicKey,
        })

        let txHex = txComposer.getRawHex()
        if (!noBroadcast) {
            await this.api.broadcast(txHex)
        }

        return {txHex, txid: txComposer.getTxId(), tx: txComposer.getTx()}
    }

    private async _mint(
        {
            // genesis,
            // codehash,
            sensibleId,
            receiverAddress,
            tokenAmount,
            allowIncreaseMints = true,
            utxos,
            utxoPrivateKeys,
            changeAddress,
            opreturnData,
            genesisPrivateKey,
            genesisPublicKey,
        }: {
            // genesis: string
            // codehash: string
            sensibleId: string
            receiverAddress: mvc.Address
            tokenAmount: BN
            allowIncreaseMints: boolean
            utxos?: Utxo[]
            utxoPrivateKeys?: mvc.PrivateKey[]
            changeAddress?: mvc.Address
            opreturnData?: any
            noBroadcast?: boolean
            genesisPrivateKey?: mvc.PrivateKey
            genesisPublicKey: mvc.PublicKey
        }) {
        const genesisAddress = genesisPrivateKey.toAddress(this.network).toString()
        let {genesisContract, genesisTxId, genesisOutputIndex, genesisUtxo} =
            await this._prepareMintUtxo({sensibleId, genesisAddress})

        let balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
        let estimateSatoshis = await this._calMintEstimateFee({
            genesisUtxoSatoshis: genesisUtxo.satoshis,
            opreturnData,
            allowIncreaseMints,
            utxoMaxCount: utxos.length,
        })
        if (balance < estimateSatoshis) {
            throw new CodeError(
                ErrCode.EC_INSUFFICIENT_MVC,
                `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
            )
        }

        let newGenesisContract = genesisContract.clone()
        newGenesisContract.setFormatedDataPart({
            sensibleID: {
                txid: genesisTxId,
                index: genesisOutputIndex,
            },
        })

        let tokenContract = TokenFactory.createContract(
            this.transferCheckCodeHashArray,
            this.unlockContractCodeHashArray
        )
        tokenContract.setFormatedDataPart(
            Object.assign({}, newGenesisContract.getFormatedDataPart(), {
                tokenAddress: toHex(receiverAddress.hashBuffer),
                tokenAmount,
                genesisHash: newGenesisContract.getScriptHash(),
            })
        )

        const txComposer = new TxComposer()

        const genesisInputIndex = addContractInput(
            txComposer,
            genesisUtxo as any,
            genesisPublicKey.toAddress(this.network).toString(),
            CONTRACT_TYPE.BCP02_TOKEN_GENESIS
        )

        const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)

        //If increase issues is allowed, add a new issue contract as the first output
        let newGenesisOutputIndex = -1
        if (allowIncreaseMints) {
            newGenesisOutputIndex = addContractOutput({
                txComposer,
                contract: newGenesisContract,
                dustCalculator: this.dustCalculator,
            })
        }

        const tokenOutputIndex = addContractOutput({
            txComposer,
            contract: tokenContract,
            dustCalculator: this.dustCalculator,
        })

        //If there is opReturn, add it to the output
        let opreturnScriptHex = ''
        if (opreturnData) {
            const opreturnOutputIndex = addOpreturnOutput(txComposer, opreturnData)
            opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
        }

        const prevInputIndex = 0 // TODO: 0?
        const genesisTx = genesisUtxo.satotxInfo.tx as mvc.Transaction
        const inputRes = TokenUtil.getTxInputProof(genesisTx, prevInputIndex)
        const genesisTxInputProof = new TxInputProof(inputRes[0])
        const genesisTxHeader = inputRes[1] as Bytes // TODO:

        // Find a valid preGenesisTx

        const genesisTxInput = genesisTx.inputs[prevInputIndex]
        const preGenesisOutputIndex = genesisTxInput.outputIndex
        const preGenesisTxId = genesisTxInput.prevTxId.toString('hex')
        const preGenesisTxHex = await this.api.getRawTxData(preGenesisTxId)
        const preGenesisTx = new mvc.Transaction(preGenesisTxHex)

        const prevOutputProof = TokenUtil.getTxOutputProof(preGenesisTx, preGenesisOutputIndex)

        const pubKey = new PubKey(genesisPublicKey.toHex())

        //The first round of calculations get the exact size of the final transaction, and then change again
        //Due to the change, the script needs to be unlocked again in the second round
        //let the fee to be exact in the second round
        for (let c = 0; c < 2; c++) {
            // TODO: 取消两轮？
            txComposer.clearChangeOutput()
            const changeOutputIndex = txComposer.appendChangeOutput(changeAddress, this.feeb)

            let unlockResult = genesisContract.unlock({
                txPreimage: txComposer.getInputPreimage(genesisInputIndex),
                pubKey,
                sig: new Sig(
                    genesisPrivateKey
                        ? toHex(txComposer.getTxFormatSig(genesisPrivateKey, genesisInputIndex))
                        : PLACE_HOLDER_SIG
                ),
                tokenScript: new Bytes(txComposer.getOutput(tokenOutputIndex).script.toHex()),

                // GenesisTx Input Proof
                genesisTxHeader,
                prevInputIndex,
                genesisTxInputProof,

                // Prev GenesisTx Output Proof
                prevGenesisTxHeader: prevOutputProof.txHeader,
                prevTxOutputHashProof: prevOutputProof.hashProof,
                prevTxOutputSatoshiBytes: prevOutputProof.satoshiBytes,

                genesisSatoshis:
                    newGenesisOutputIndex != -1 ? txComposer.getOutput(newGenesisOutputIndex).satoshis : 0,
                tokenSatoshis: txComposer.getOutput(tokenOutputIndex).satoshis,
                changeSatoshis:
                    changeOutputIndex != -1 ? txComposer.getOutput(changeOutputIndex).satoshis : 0,

                changeAddress: new Ripemd160(toHex(changeAddress.hashBuffer)),
                opReturnScript: new Bytes(opreturnScriptHex),
            })
            // const txContext = {
            //   tx: txComposer.getTx(),
            //   inputIndex: 0,
            //   inputSatoshis: txComposer.getOutput(newGenesisOutputIndex).satoshis,
            // }
            // const verify = unlockResult.verify(txContext)
            // console.log({ verify })

            if (this.debug && genesisPrivateKey && c == 1) {
                let ret = unlockResult.verify({
                    tx: txComposer.tx,
                    inputIndex: genesisInputIndex,
                    inputSatoshis: txComposer.getInput(genesisInputIndex).output.satoshis,
                })
                if (ret.success == false) throw ret
            }

            txComposer.getInput(genesisInputIndex).setScript(unlockResult.toScript() as mvc.Script)
        }

        unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)
        // if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
        //   p2pkhInputIndexs.forEach((inputIndex) => {
        //     let privateKey = utxoPrivateKeys.splice(0, 1)[0]
        //     txComposer.unlockP2PKHInput(privateKey, inputIndex)
        //   })
        // }

        checkFeeRate(txComposer, this.feeb)
        return {txComposer}
    }

    private async _prepareMintUtxo(
        {
            sensibleId,
            genesisAddress,
        }: {
            sensibleId: string
            genesisAddress: string
        }) {
        let genesisContract = TokenGenesisFactory.createContract()

        //Looking for UTXO for issue
        let {genesisTxId, genesisOutputIndex} = parseSensibleID(sensibleId)
        let genesisUtxo = await this._getMintUtxo(
            genesisContract.getCodeHash(),
            genesisTxId,
            genesisOutputIndex,
            genesisAddress
        )
        if (!genesisUtxo) {
            throw new CodeError(ErrCode.EC_FIXED_TOKEN_SUPPLY, 'token supply is fixed')
        }

        let txHex = await this.api.getRawTxData(genesisUtxo.txId)
        const tx = new mvc.Transaction(txHex)
        let preTxId = tx.inputs[0].prevTxId.toString('hex')
        let preOutputIndex = tx.inputs[0].outputIndex
        let preTxHex = await this.api.getRawTxData(preTxId)
        genesisUtxo.satotxInfo = {
            txId: genesisUtxo.txId,
            outputIndex: genesisUtxo.outputIndex,
            txHex,
            preTxId,
            preOutputIndex,
            preTxHex,
            tx,
        }

        let output = tx.outputs[genesisUtxo.outputIndex]
        genesisUtxo.satoshis = output.satoshis
        genesisUtxo.lockingScript = output.script
        genesisContract.setFormatedDataPartFromLockingScript(genesisUtxo.lockingScript)

        return {
            genesisContract,
            genesisTxId,
            genesisOutputIndex,
            genesisUtxo,
        }
    }

    private async _getMintUtxo(
        codehash: string,
        genesisTxId: string,
        genesisOutputIndex: number,
        genesisAddress: string
    ): Promise<FtUtxo> {
        let unspent: FungibleTokenUnspent
        let firstGenesisTxHex = await this.api.getRawTxData(genesisTxId)
        let firstGenesisTx = new mvc.Transaction(firstGenesisTxHex)

        let scriptBuffer = firstGenesisTx.outputs[genesisOutputIndex].script.toBuffer()
        let originGenesis = ftProto.getQueryGenesis(scriptBuffer)
        let genesisUtxos = await this.api.getFungibleTokenUnspents(
            codehash,
            originGenesis,
            genesisAddress
        )

        unspent = genesisUtxos.find((v) => v.txId == genesisTxId && v.outputIndex == genesisOutputIndex)

        if (!unspent) {
            let _dataPartObj = ftProto.parseDataPart(scriptBuffer)
            _dataPartObj.sensibleID = {
                txid: genesisTxId,
                index: genesisOutputIndex,
            }
            let newScriptBuf = ftProto.updateScript(scriptBuffer, _dataPartObj)

            let issueGenesis = ftProto.getQueryGenesis(newScriptBuf)
            let issueUtxos = await this.api.getFungibleTokenUnspents(
                codehash,
                issueGenesis,
                genesisAddress
            )
            if (issueUtxos.length > 0) {
                unspent = issueUtxos[0]
            }
        }

        if (unspent) {
            return {
                txId: unspent.txId,
                outputIndex: unspent.outputIndex,
            }
        }
    }

    private async _calMintEstimateFee(
        {
            genesisUtxoSatoshis,
            opreturnData,
            allowIncreaseMints = true,
            utxoMaxCount = 10,
        }: {
            genesisUtxoSatoshis: number
            opreturnData?: any
            allowIncreaseMints: boolean
            utxoMaxCount?: number
        }) {
        let p2pkhInputNum = utxoMaxCount

        let stx = new SizeTransaction(this.feeb, this.dustCalculator)
        stx.addInput(TokenGenesisFactory.calUnlockingScriptSize(opreturnData), genesisUtxoSatoshis)
        for (let i = 0; i < p2pkhInputNum; i++) {
            stx.addP2PKHInput()
        }

        if (allowIncreaseMints) {
            stx.addOutput(TokenGenesisFactory.getLockingScriptSize())
        }

        stx.addOutput(TokenFactory.getLockingScriptSize())
        if (opreturnData) {
            stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
        }
        stx.addP2PKHOutput()

        return stx.getFee()
    }

    public async merge(
        {
            codehash,
            genesis,
            ownerWif,
            utxos,
            changeAddress,
            noBroadcast = false,
            opreturnData,
        }: {
            codehash: string
            genesis: string
            ownerWif: string
            utxos?: ParamUtxo[]
            changeAddress?: string | mvc.Address
            noBroadcast?: boolean
            opreturnData?: any
        }) {
        $.checkArgument(ownerWif, 'ownerWif is required')
        return await this.transfer({
            codehash,
            genesis,
            senderWif: ownerWif,
            utxos,
            changeAddress,
            isMerge: true,
            noBroadcast,
            receivers: [],
            opreturnData,
        })
    }

    private async _pretreatUtxos(
        paramUtxos?: ParamUtxo[]
    ): Promise<{ utxos: Utxo[]; utxoPrivateKeys: mvc.PrivateKey[] }> {
        let utxoPrivateKeys = []
        let utxos: Utxo[] = []

        //If utxos are not provided, use purse to fetch utxos
        if (!paramUtxos) {
            if (!this.purse)
                throw new CodeError(ErrCode.EC_INVALID_ARGUMENT, 'Utxos or Purse must be provided.')
            paramUtxos = await this.api.getUnspents(this.purse.address.toString())
            paramUtxos.forEach((v) => {
                utxoPrivateKeys.push(this.purse.privateKey)
            })
        } else {
            paramUtxos.forEach((v) => {
                if (v.wif) {
                    let privateKey = new mvc.PrivateKey(v.wif)
                    utxoPrivateKeys.push(privateKey)
                    v.address = privateKey.toAddress(this.network).toString() //Compatible with the old version, only wif is provided but no address is provided
                }
            })
        }
        paramUtxos.forEach((v) => {
            utxos.push({
                txId: v.txId,
                outputIndex: v.outputIndex,
                satoshis: v.satoshis,
                address: new mvc.Address(v.address, this.network),
            })
        })

        if (utxos.length == 0) throw new CodeError(ErrCode.EC_INSUFFICIENT_MVC, 'Insufficient balance.')
        return {utxos, utxoPrivateKeys}
    }

    /**
     * Estimate the cost of genesis
     * @param opreturnData
     * @param utxoMaxCount Maximum number of MVC UTXOs supported
     * @returns
     */
    public async getGenesisEstimateFee(
        {
            opreturnData,
            utxoMaxCount = 10,
        }: {
            opreturnData?: any
            utxoMaxCount?: number
        }) {
        const p2pkhInputNum = utxoMaxCount
        const sizeOfTokenGenesis = TokenGenesisFactory.getLockingScriptSize()
        let stx = new SizeTransaction(this.feeb, this.dustCalculator)
        for (let i = 0; i < p2pkhInputNum; i++) {
            stx.addP2PKHInput()
        }
        stx.addOutput(sizeOfTokenGenesis)
        if (opreturnData) {
            stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
        }
        stx.addP2PKHOutput()
        return stx.getFee()
    }

    private async _genesis(
        {
            tokenName,
            tokenSymbol,
            decimalNum,
            utxos,
            utxoPrivateKeys,
            changeAddress,
            tokenAddress,
            opreturnData,
        }: {
            tokenName: string
            tokenSymbol: string
            decimalNum: number
            utxos?: Utxo[]
            utxoPrivateKeys?: mvc.PrivateKey[]
            changeAddress?: mvc.Address
            tokenAddress: string
            opreturnData?: any
        }) {
        //create genesis contract
        let genesisContract = TokenGenesisFactory.createContract()

        genesisContract.setFormatedDataPart({
            tokenName,
            tokenSymbol,
            decimalNum,
            tokenAddress,
        })
        let estimateSatoshis = await this.getGenesisEstimateFee({
            opreturnData,
            utxoMaxCount: utxos.length,
        })
        const balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)

        if (balance < estimateSatoshis) {
            throw new CodeError(
                ErrCode.EC_INSUFFICIENT_MVC,
                `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
            )
        }
        const txComposer = new TxComposer()
        const p2pkhInputIndexs = addP2PKHInputs(txComposer, utxos)

        addContractOutput({
            txComposer,
            contract: genesisContract,
            dustCalculator: this.dustCalculator,
        })

        //If there is opReturn, add it to the second output
        if (opreturnData) {
            txComposer.appendOpReturnOutput(opreturnData)
        }

        addChangeOutput(txComposer, changeAddress, this.feeb)
        unlockP2PKHInputs(txComposer, p2pkhInputIndexs, utxoPrivateKeys)

        checkFeeRate(txComposer, this.feeb)

        return {txComposer}
    }

    public async transfer(
        {
            codehash,
            genesis,
            receivers,

            senderWif,
            ftUtxos,
            ftChangeAddress,

            utxos,
            changeAddress,

            middleChangeAddress,
            middlePrivateKey,

            minUtxoSet = true,
            isMerge,
            opreturnData,
            noBroadcast = false,
        }: {
            codehash: string
            genesis: string
            receivers?: TokenReceiver[]

            senderWif?: string
            ftUtxos?: ParamFtUtxo[]
            ftChangeAddress?: string | mvc.Address

            utxos?: ParamUtxo[]
            changeAddress?: string | mvc.Address

            middleChangeAddress?: string | mvc.Address
            middlePrivateKey?: string | mvc.PrivateKey

            minUtxoSet?: boolean
            isMerge?: boolean
            opreturnData?: any
            noBroadcast?: boolean
        }): Promise<{
        tx: mvc.Transaction
        txHex: string
        txid: string
        routeCheckTx: mvc.Transaction
        routeCheckTxHex: string
    }> {
        checkParamGenesis(genesis)
        checkParamCodehash(codehash)
        checkParamReceivers(receivers)

        let senderPrivateKey: mvc.PrivateKey
        let senderPublicKey: mvc.PublicKey
        if (senderWif) {
            senderPrivateKey = new mvc.PrivateKey(senderWif)
        }

        let utxoInfo = await this._pretreatUtxos(utxos)
        if (changeAddress) {
            changeAddress = new mvc.Address(changeAddress, this.network)
        } else {
            changeAddress = utxoInfo.utxos[0].address as mvc.Address
        }

        if (middleChangeAddress) {
            middleChangeAddress = new mvc.Address(middleChangeAddress, this.network)
            middlePrivateKey = new mvc.PrivateKey(middlePrivateKey)
        } else {
            middleChangeAddress = utxoInfo.utxos[0].address as mvc.Address
            middlePrivateKey = utxoInfo.utxoPrivateKeys[0]
        }

        let ftUtxoInfo = await this._pretreatFtUtxos(
            ftUtxos,
            codehash,
            genesis,
            senderPrivateKey,
            senderPublicKey
        )
        if (ftChangeAddress) {
            ftChangeAddress = new mvc.Address(ftChangeAddress, this.network)
        } else {
            ftChangeAddress = ftUtxoInfo.ftUtxos[0].tokenAddress as mvc.Address
        }

        let {txComposer, transferCheckTxComposer} = await this._transfer({
            codehash,
            genesis,
            receivers,
            ftUtxos: ftUtxoInfo.ftUtxos,
            ftPrivateKeys: ftUtxoInfo.ftUtxoPrivateKeys,
            ftChangeAddress,
            utxos: utxoInfo.utxos,
            utxoPrivateKeys: utxoInfo.utxoPrivateKeys,
            changeAddress,
            opreturnData,
            isMerge,
            middleChangeAddress,
            middlePrivateKey,
            minUtxoSet,
        })
        let routeCheckTxHex = transferCheckTxComposer.getRawHex()
        let txHex = txComposer.getRawHex()

        if (!noBroadcast) {
            await this.api.broadcast(routeCheckTxHex)
            await this.api.broadcast(txHex)
        }

        return {
            tx: txComposer.getTx(),
            txHex,
            routeCheckTx: transferCheckTxComposer.getTx(),
            routeCheckTxHex,
            txid: txComposer.getTxId(),
        }
    }

    private async _pretreatFtUtxos(
        paramFtUtxos: ParamFtUtxo[],
        codehash?: string,
        genesis?: string,
        senderPrivateKey?: mvc.PrivateKey,
        senderPublicKey?: mvc.PublicKey
    ): Promise<{ ftUtxos: FtUtxo[]; ftUtxoPrivateKeys: mvc.PrivateKey[] }> {
        let ftUtxos: FtUtxo[] = []
        let ftUtxoPrivateKeys = []

        let publicKeys = []
        if (!paramFtUtxos) {
            if (senderPrivateKey) {
                senderPublicKey = senderPrivateKey.toPublicKey()
            }
            if (!senderPublicKey)
                throw new CodeError(
                    ErrCode.EC_INVALID_ARGUMENT,
                    'ftUtxos or senderPublicKey or senderPrivateKey must be provided.'
                )

            paramFtUtxos = await this.api.getFungibleTokenUnspents(
                codehash,
                genesis,
                senderPublicKey.toAddress(this.network).toString(),
                20
            )

            paramFtUtxos.forEach((v) => {
                if (senderPrivateKey) {
                    ftUtxoPrivateKeys.push(senderPrivateKey)
                }
                publicKeys.push(senderPublicKey)
            })
        } else {
            paramFtUtxos.forEach((v) => {
                if (v.wif) {
                    let privateKey = new mvc.PrivateKey(v.wif)
                    ftUtxoPrivateKeys.push(privateKey)
                    publicKeys.push(privateKey.toPublicKey())
                }
            })
        }

        paramFtUtxos.forEach((v, index) => {
            ftUtxos.push({
                txId: v.txId,
                outputIndex: v.outputIndex,
                tokenAddress: new mvc.Address(v.tokenAddress, this.network),
                tokenAmount: new BN(v.tokenAmount.toString()),
                publicKey: publicKeys[index],
            })
        })

        if (ftUtxos.length == 0) throw new CodeError(ErrCode.EC_INSUFFICIENT_FT, 'Insufficient token.')

        return {ftUtxos, ftUtxoPrivateKeys}
    }


    /**
     * prepare transfer tokens, decide which transfer pattern to use, preprocess ft utxos(fetch previous transactions for tx building)
     * @param codehash codehash of token
     * @param genesis genesis of token
     * @param receivers token receivers, will be ignored if isMerge is true
     * @param ftUtxos input ft utxos
     * @param ftChangeAddress change address of ft
     * @param isMerge merge utxos, if true, all the token will be merged into one utxo and send to the change address
     * @param minUtxoSet if true, will use minimum utxo set as possible
     * @private
     */
    private async _prepareTransferTokens(
        {
            codehash,
            genesis,
            receivers,
            ftUtxos,
            ftChangeAddress,
            isMerge,
            minUtxoSet,
        }: {
            codehash: string
            genesis: string
            receivers?: TokenReceiver[]
            ftUtxos: FtUtxo[]
            ftChangeAddress: mvc.Address
            isMerge?: boolean
            minUtxoSet: boolean
        }) {
        let mergeUtxos: FtUtxo[] = []
        let mergeTokenAmountSum: BN = BN.Zero
        if (isMerge) {
            mergeUtxos = ftUtxos.slice(0, 20)
            mergeTokenAmountSum = mergeUtxos.reduce((pre, cur) => cur.tokenAmount.add(pre), BN.Zero)
            receivers = [
                {
                    address: ftChangeAddress.toString(),
                    amount: mergeTokenAmountSum.toString(),
                },
            ]
        }

        let tokenOutputArray = receivers.map((v) => ({
            address: new mvc.Address(v.address, this.network),
            tokenAmount: new BN(v.amount.toString()),
        }))

        let outputTokenAmountSum = tokenOutputArray.reduce(
            (pre, cur) => cur.tokenAmount.add(pre),
            BN.Zero
        )

        let inputTokenAmountSum = BN.Zero
        let _ftUtxos = []
        for (let i = 0; i < ftUtxos.length; i++) {
            let ftUtxo = ftUtxos[i]
            _ftUtxos.push(ftUtxo)
            inputTokenAmountSum = ftUtxo.tokenAmount.add(inputTokenAmountSum)
            if (minUtxoSet && inputTokenAmountSum.gte(outputTokenAmountSum)) {
                break
            }
        }

        if (isMerge) {
            _ftUtxos = mergeUtxos
            inputTokenAmountSum = mergeTokenAmountSum
            if (mergeTokenAmountSum.eq(BN.Zero)) {
                throw new CodeError(ErrCode.EC_INNER_ERROR, 'No utxos to merge.')
            }
        }

        //Decide whether to change the token
        let changeTokenAmount = inputTokenAmountSum.sub(outputTokenAmountSum)
        if (changeTokenAmount.gt(BN.Zero)) {
            tokenOutputArray.push({
                address: ftChangeAddress,
                tokenAmount: changeTokenAmount,
            })
        }

        if (inputTokenAmountSum.lt(outputTokenAmountSum)) {
            throw new CodeError(
                ErrCode.EC_INSUFFICIENT_FT,
                `Insufficient token. Need ${outputTokenAmountSum} But only ${inputTokenAmountSum}`
            )
        }

        ftUtxos = _ftUtxos
        await this.perfectFtUtxosInfo(ftUtxos, genesis)

        let tokenInputArray = ftUtxos

        //Choose a transfer plan
        let inputLength = tokenInputArray.length
        let outputLength = tokenOutputArray.length
        let tokenTransferType = TokenTransferCheckFactory.getOptimumType(inputLength, outputLength)
        if (tokenTransferType == TOKEN_TRANSFER_TYPE.UNSUPPORT) {
            throw new CodeError(
                ErrCode.EC_TOO_MANY_FT_UTXOS,
                'Too many token-utxos, should merge them to continue.'
            )
        }
        return {
            tokenInputArray,
            tokenOutputArray,
            tokenTransferType,
        }
    }

    /**
     * prepare burn tokens,preprocess ft utxos(fetch previous transactions for tx building)
     * @param codehash codehash of token
     * @param genesis genesis of token
     * @param ftUtxos input ft utxos
     * @private
     */
    private async _prepareBurnTokens(
        {
            genesis,
            ftUtxos,
        }: {
            genesis: string
            ftUtxos: FtUtxo[]
        }) {
        let inputTokenAmountSum = BN.Zero
        let _ftUtxos = []
        for (let i = 0; i < ftUtxos.length; i++) {
            let ftUtxo = ftUtxos[i]
            _ftUtxos.push(ftUtxo)
            inputTokenAmountSum = ftUtxo.tokenAmount.add(inputTokenAmountSum)
        }

        ftUtxos = _ftUtxos
        await this.perfectFtUtxosInfo(ftUtxos, genesis)

        let tokenInputArray = ftUtxos
        // burn tx have only one output to receive satoshi
        let tokenUnlockType = TokenUnlockContractCheckFactory.getOptimumType(ftUtxos.length, 1)
        if (tokenUnlockType == TOKEN_UNLOCK_TYPE.UNSUPPORT) {
            throw new CodeError(
                ErrCode.EC_TOO_MANY_FT_UTXOS,
                'Too many token-utxos, should merge them to continue.'
            )
        }

        return {
            tokenInputArray,
            tokenUnlockType,
        }
    }

    /**
     * Fetch previous transactions for each ft utxo
     * @param ftUtxos ft utxos
     * @param genesis genesis of token
     * @private
     */
    private async perfectFtUtxosInfo(
        ftUtxos: FtUtxo[],
        genesis: string
    ): Promise<FtUtxo[]> {
        //Cache txHex to prevent redundant queries
        let cachedHexs: {
            [txid: string]: { waitingRes?: Promise<string>; hex?: string }
        } = {}

        //Get txHex
        for (let i = 0; i < ftUtxos.length; i++) {
            let ftUtxo = ftUtxos[i]
            if (!cachedHexs[ftUtxo.txId]) {
                cachedHexs[ftUtxo.txId] = {
                    waitingRes: this.api.getRawTxData(ftUtxo.txId), //async request
                }
            }
        }
        for (let id in cachedHexs) {
            //Wait for all async requests to complete
            if (cachedHexs[id].waitingRes && !cachedHexs[id].hex) {
                cachedHexs[id].hex = await cachedHexs[id].waitingRes
            }
        }
        ftUtxos.forEach((v) => {
            v.satotxInfo = v.satotxInfo || {}
            v.satotxInfo.txHex = cachedHexs[v.txId].hex
            v.satotxInfo.txId = v.txId
            v.satotxInfo.outputIndex = v.outputIndex
        })

        //Get preTxHex
        let curDataPartObj: ftProto.FormatedDataPart
        for (let i = 0; i < ftUtxos.length; i++) {
            let ftUtxo = ftUtxos[i]
            const tx = new mvc.Transaction(ftUtxo.satotxInfo.txHex)
            if (!curDataPartObj) {
                let tokenScript = tx.outputs[ftUtxo.outputIndex].script
                curDataPartObj = ftProto.parseDataPart(tokenScript.toBuffer())
            }
            //Find a valid preTx
            let prevTokenInputIndex = 0
            let input = tx.inputs.find((input, inputIndex) => {
                let script = new mvc.Script(input.script)
                if (script.chunks.length > 0) {
                    const lockingScriptBuf = TokenUtil.getLockingScriptFromPreimage(script.chunks[0].buf)
                    if (lockingScriptBuf) {
                        if (ftProto.getQueryGenesis(lockingScriptBuf) == genesis) {
                            prevTokenInputIndex = inputIndex
                            return true
                        }

                        let dataPartObj = ftProto.parseDataPart(lockingScriptBuf)
                        dataPartObj.sensibleID = curDataPartObj.sensibleID
                        const newScriptBuf = ftProto.updateScript(lockingScriptBuf, dataPartObj)
                        let genesisHash = toHex(mvc.crypto.Hash.sha256ripemd160(newScriptBuf))
                        if (genesisHash == curDataPartObj.genesisHash) {
                            prevTokenInputIndex = inputIndex
                            return true
                        }
                    }
                }
            })
            if (!input) {
                throw new CodeError(ErrCode.EC_INNER_ERROR, 'There is no valid preTx of the ftUtxo. ')
            }
            let preTxId = input.prevTxId.toString('hex')
            let preOutputIndex = input.outputIndex
            ftUtxo.satotxInfo.preTxId = preTxId
            ftUtxo.satotxInfo.preOutputIndex = preOutputIndex
            ftUtxo.satotxInfo.txInputsCount = tx.inputs.length

            ftUtxo.satoshis = tx.outputs[ftUtxo.outputIndex].satoshis
            ftUtxo.lockingScript = tx.outputs[ftUtxo.outputIndex].script

            // 新增字段 prevTokenInputIndex, prevTokenOutputIndex
            ftUtxo.prevTokenOutputIndex = input.outputIndex
            ftUtxo.prevTokenInputIndex = prevTokenInputIndex

            if (!cachedHexs[preTxId]) {
                cachedHexs[preTxId] = {
                    waitingRes: this.api.getRawTxData(preTxId),
                }
            }
        }
        for (let id in cachedHexs) {
            //Wait for all async requests to complete
            if (cachedHexs[id].waitingRes && !cachedHexs[id].hex) {
                cachedHexs[id].hex = await cachedHexs[id].waitingRes
            }
        }
        ftUtxos.forEach((v) => {
            v.satotxInfo.preTxHex = cachedHexs[v.satotxInfo.preTxId].hex

            const preTx = new mvc.Transaction(v.satotxInfo.preTxHex)
            let dataPartObj = ftProto.parseDataPart(
                preTx.outputs[v.satotxInfo.preOutputIndex].script.toBuffer()
            )
            v.preTokenAmount = new BN(dataPartObj.tokenAmount.toString())
            if (dataPartObj.tokenAddress == '0000000000000000000000000000000000000000') {
                v.preTokenAddress = this.zeroAddress
            } else {
                v.preTokenAddress = mvc.Address.fromPublicKeyHash(
                    Buffer.from(dataPartObj.tokenAddress, 'hex'),
                    this.network
                )
            }
            v.preLockingScript = preTx.outputs[v.satotxInfo.preOutputIndex].script

            // 新增字段 prevTokenTx,
            v.prevTokenTx = preTx
        })

        return ftUtxos
    }


    /**
     * composite a token transfer transaction and amount check transaction
     * @param codehash codehash of the token
     * @param genesis genesis of the token
     * @param receivers token receivers
     * @param ftUtxos input ftUtxos
     * @param ftPrivateKeys private keys of ftUtxos
     * @param ftChangeAddress change address of ftUtxos
     * @param utxos utxos for paying fee
     * @param utxoPrivateKeys private keys of utxos(fee paying)
     * @param changeAddress change address of utxos(fee paying)
     * @param middlePrivateKey
     * @param middleChangeAddress
     * @param isMerge whether to merge the token utxos
     * @param opreturnData opreturn data to be added to the transaction
     * @param minUtxoSet
     * @private
     */
    private async _transfer(
        {
            codehash,
            genesis,

            receivers,

            ftUtxos,
            ftPrivateKeys,
            ftChangeAddress,

            utxos,
            utxoPrivateKeys,
            changeAddress,

            middlePrivateKey,
            middleChangeAddress,

            isMerge,
            opreturnData,
            minUtxoSet,
        }: {
            codehash: string
            genesis: string

            receivers?: TokenReceiver[]

            ftUtxos: FtUtxo[]
            ftPrivateKeys: mvc.PrivateKey[]
            ftChangeAddress: mvc.Address

            utxos: Utxo[]
            utxoPrivateKeys: mvc.PrivateKey[]
            changeAddress: mvc.Address

            middlePrivateKey?: mvc.PrivateKey
            middleChangeAddress: mvc.Address

            isMerge?: boolean
            opreturnData?: any
            minUtxoSet: boolean
        }) {
        // limit the number of fee paying utxos
        if (utxos.length > 3) {
            throw new CodeError(
                ErrCode.EC_UTXOS_MORE_THAN_3,
                'Mvc utxos should be no more than 3 in the transfer operation, please merge it first '
            )
        }

        if (!middleChangeAddress) {
            middleChangeAddress = utxos[0].address
            middlePrivateKey = utxoPrivateKeys[0]
        }

        // preprocess the ftUtxos, fetch previous tx hex and parse the token amount. decide the token transfer type.
        let {tokenInputArray, tokenOutputArray, tokenTransferType} =
            await this._prepareTransferTokens({
                codehash,
                genesis,
                receivers,
                ftUtxos,
                ftChangeAddress,
                isMerge,
                minUtxoSet,
            })

        // calculate the fee
        let estimateSatoshis = this._calTransferEstimateFee({
            p2pkhInputNum: utxos.length,
            tokenInputArray,
            tokenOutputArray,
            tokenTransferType,
            opreturnData,
        })

        // if fee is not enough, throw error
        const balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
        if (balance < estimateSatoshis) {
            throw new CodeError(
                ErrCode.EC_INSUFFICIENT_MVC,
                `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
            )
        }

        ftUtxos = tokenInputArray
        const defaultFtUtxo = tokenInputArray[0]
        const ftUtxoTx = new mvc.Transaction(defaultFtUtxo.satotxInfo.txHex)
        const tokenLockingScript = ftUtxoTx.outputs[defaultFtUtxo.outputIndex].script

        //create transferCheck contract
        let tokenTransferCheckContract = TokenTransferCheckFactory.createContract(tokenTransferType)

        tokenTransferCheckContract.setFormatedDataPart({
            nSenders: tokenInputArray.length,
            receiverTokenAmountArray: tokenOutputArray.map((v) => v.tokenAmount),

            receiverArray: tokenOutputArray.map((v) => v.address),
            nReceivers: tokenOutputArray.length,
            tokenCodeHash: toHex(ftProto.getContractCodeHash(tokenLockingScript.toBuffer())),
            tokenID: toHex(ftProto.getTokenID(tokenLockingScript.toBuffer())),
        })

        const transferCheckTxComposer = new TxComposer()

        // add utxo to provide fee for transfer check transaction
        const transferCheck_p2pkhInputIndexs = utxos.map((utxo) => {
            const inputIndex = transferCheckTxComposer.appendP2PKHInput(utxo as any)
            transferCheckTxComposer.addSigHashInfo({
                inputIndex,
                address: utxo.address.toString(),
                sighashType,
                contractType: CONTRACT_TYPE.P2PKH,
            })
            return inputIndex
        })
        // add outputs for transfer check transaction
        const transferCheckOutputIndex = transferCheckTxComposer.appendOutput({
            lockingScript: tokenTransferCheckContract.lockingScript,
            satoshis: this.getDustThreshold(tokenTransferCheckContract.lockingScript.toBuffer().length),
        })
        // add change output for transfer check transaction
        let changeOutputIndex = transferCheckTxComposer.appendChangeOutput(
            middleChangeAddress,
            this.feeb
        )

        // unlock the fee utxo for transfer check transaction
        let unsignSigPlaceHolderSize = 0
        if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
            transferCheck_p2pkhInputIndexs.forEach((inputIndex) => {
                let privateKey = utxoPrivateKeys.splice(0, 1)[0]
                transferCheckTxComposer.unlockP2PKHInput(privateKey, inputIndex)
            })
        } else {
            //To supplement the size calculation when unsigned
            transferCheck_p2pkhInputIndexs.forEach((v) => {
                unsignSigPlaceHolderSize += P2PKH_UNLOCK_SIZE
            })
            //Each ftUtxo need to unlock with the size
            unsignSigPlaceHolderSize = unsignSigPlaceHolderSize * ftUtxos.length
        }

        // change utxo to the output of transfer check transaction
        utxos = [
            {
                txId: transferCheckTxComposer.getTxId(),
                satoshis: transferCheckTxComposer.getOutput(changeOutputIndex).satoshis,
                outputIndex: changeOutputIndex,
                address: middleChangeAddress,
            },
        ]
        utxoPrivateKeys = utxos.map((v) => middlePrivateKey).filter((v) => v)

        // transfer check utxo in order to unlock the token utxo
        let transferCheckUtxo = {
            txId: transferCheckTxComposer.getTxId(),
            outputIndex: transferCheckOutputIndex,
            satoshis: transferCheckTxComposer.getOutput(transferCheckOutputIndex).satoshis,
            lockingScript: transferCheckTxComposer.getOutput(transferCheckOutputIndex).script,
        }


        // build token transfer transaction
        const txComposer = new TxComposer()
        let prevouts = new Prevouts()

        // concat the token addresses and amounts for check
        let inputTokenScript: mvc.Script
        let inputTokenAmountArray = Buffer.alloc(0)
        let inputTokenAddressArray = Buffer.alloc(0)

        const ftUtxoInputIndexs = ftUtxos.map((ftUtxo) => {
            const inputIndex = txComposer.appendInput(ftUtxo)
            prevouts.addVout(ftUtxo.txId, ftUtxo.outputIndex)
            txComposer.addSigHashInfo({
                inputIndex,
                address: ftUtxo.tokenAddress.toString(),
                sighashType,
                contractType: CONTRACT_TYPE.BCP02_TOKEN,
            })
            inputTokenScript = ftUtxo.lockingScript
            inputTokenAddressArray = Buffer.concat([
                inputTokenAddressArray,
                ftUtxo.tokenAddress.hashBuffer,
            ])

            inputTokenAmountArray = Buffer.concat([
                inputTokenAmountArray,
                ftUtxo.tokenAmount.toBuffer({
                    endian: 'little',
                    size: 8,
                }),
            ])
            return inputIndex
        })

        //tx addInput utxo
        const p2pkhInputIndexs = utxos.map((utxo) => {
            const inputIndex = txComposer.appendP2PKHInput(utxo as any)
            prevouts.addVout(utxo.txId, utxo.outputIndex)
            txComposer.addSigHashInfo({
                inputIndex,
                address: utxo.address.toString(),
                sighashType,
                contractType: CONTRACT_TYPE.P2PKH,
            })
            return inputIndex
        })

        //添加transferCheck为最后一个输入
        const transferCheckInputIndex = txComposer.appendInput(transferCheckUtxo)
        prevouts.addVout(transferCheckUtxo.txId, transferCheckUtxo.outputIndex)

        // concat the token addresses and amounts for check
        let recervierArray = Buffer.alloc(0)
        let receiverTokenAmountArray = Buffer.alloc(0)
        let outputSatoshiArray = Buffer.alloc(0)
        const tokenOutputLen = tokenOutputArray.length

        for (let i = 0; i < tokenOutputLen; i++) {
            const tokenOutput = tokenOutputArray[i]
            const address = tokenOutput.address
            const outputTokenAmount = tokenOutput.tokenAmount

            const lockingScriptBuf = ftProto.getNewTokenScript(
                inputTokenScript.toBuffer(),
                address.hashBuffer,
                outputTokenAmount
            )
            let outputIndex = txComposer.appendOutput({
                lockingScript: mvc.Script.fromBuffer(lockingScriptBuf),
                satoshis: this.getDustThreshold(lockingScriptBuf.length),
            })
            recervierArray = Buffer.concat([recervierArray, address.hashBuffer])
            const tokenBuf = outputTokenAmount.toBuffer({
                endian: 'little',
                size: 8,
            })
            receiverTokenAmountArray = Buffer.concat([receiverTokenAmountArray, tokenBuf])
            const satoshiBuf = BN.fromNumber(txComposer.getOutput(outputIndex).satoshis).toBuffer({
                endian: 'little',
                size: 8,
            })
            outputSatoshiArray = Buffer.concat([outputSatoshiArray, satoshiBuf])
        }

        //tx addOutput OpReturn
        let opreturnScriptHex = ''
        if (opreturnData) {
            const opreturnOutputIndex = txComposer.appendOpReturnOutput(opreturnData)
            opreturnScriptHex = txComposer.getOutput(opreturnOutputIndex).script.toHex()
        }

        //The first round of calculations get the exact size of the final transaction, and then change again
        //Due to the change, the script needs to be unlocked again in the second round
        //let the fee be exact in the second round
        for (let c = 0; c < 2; c++) {
            txComposer.clearChangeOutput()
            const changeOutputIndex = txComposer.appendChangeOutput(
                changeAddress,
                this.feeb,
                unsignSigPlaceHolderSize
            )

            let tokenTxHeaderArray = Buffer.alloc(0)
            let tokenTxHashProofArray = Buffer.alloc(0)
            let tokenSatoshiBytesArray = Buffer.alloc(0)

            // process each ft utxo input, unlock the token utxo
            ftUtxoInputIndexs.forEach((inputIndex, idx) => {
                let ftUtxo = ftUtxos[idx]
                let senderPrivateKey = ftPrivateKeys[idx]

                let dataPartObj = ftProto.parseDataPart(ftUtxo.lockingScript.toBuffer())
                const dataPart = ftProto.newDataPart(dataPartObj)

                const tokenContract = TokenFactory.createContract(
                    this.transferCheckCodeHashArray,
                    this.unlockContractCodeHashArray
                )
                const amountCheckTx = transferCheckTxComposer.getTx()
                const amountCheckOutputIndex = 0
                const amountCheckTxOutputProofInfo = new TxOutputProof(
                    TokenUtil.getTxOutputProof(amountCheckTx, amountCheckOutputIndex)
                )
                const amountCheckScriptBuf = amountCheckTx.outputs[amountCheckOutputIndex].script.toBuffer()

                const prevTokenInputIndex = ftUtxo.prevTokenInputIndex // ???
                const prevTokenAddress = new Bytes(toHex(ftUtxo.preTokenAddress.hashBuffer))
                // const prevTokenAddress = new Bytes(TokenProto.getTokenAddress(scriptBuf).toString('hex'))
                const prevTokenAmount = BigInt(ftUtxo.preTokenAmount.toString(10))
                // const prevTokenAmount = TokenProto.getTokenAmount(scriptBuf)

                const tokenTx = new mvc.Transaction(ftUtxo.satotxInfo.txHex)

                const inputRes = TokenUtil.getTxInputProof(tokenTx, prevTokenInputIndex)
                const tokenTxInputProof = new TxInputProof(inputRes[0])
                const tokenTxHeader = inputRes[1] as Bytes // TODO:
                const prevTokenTxOutputProof = new TxOutputProof(
                    TokenUtil.getTxOutputProof(ftUtxo.prevTokenTx, ftUtxo.prevTokenOutputIndex)
                )

                const tokenTxInfoHex = TokenUtil.getTxInfoHex(tokenTx, ftUtxo.outputIndex)

                tokenTxHeaderArray = Buffer.concat([
                    tokenTxHeaderArray,
                    Buffer.from(tokenTxInfoHex.txHeader, 'hex'),
                ])

                const hashProofBuf = Buffer.from(tokenTxInfoHex.txHashProof, 'hex')
                tokenTxHashProofArray = Buffer.concat([
                    tokenTxHashProofArray,
                    TokenUtil.getUInt32Buf(hashProofBuf.length),
                    hashProofBuf,
                ])

                tokenSatoshiBytesArray = Buffer.concat([
                    tokenSatoshiBytesArray,
                    Buffer.from(tokenTxInfoHex.txSatoshi, 'hex'),
                ])

                // unlockFromContract
                const contractTxOutputProof = new TxOutputProof(TokenUtil.getEmptyTxOutputProof())

                tokenContract.setDataPart(toHex(dataPart))

                // unlock the token utxo
                const unlockingContract = tokenContract.unlock({
                    txPreimage: txComposer.getInputPreimage(inputIndex),
                    prevouts: new Bytes(prevouts.toHex()),

                    tokenInputIndex: inputIndex,
                    amountCheckHashIndex: tokenTransferType - 1,
                    amountCheckInputIndex: txComposer.getTx().inputs.length - 1,
                    // amountCheckInputIndex: ftUtxo.satotxInfo.txInputsCount - 1,
                    amountCheckTxOutputProofInfo,
                    amountCheckScript: new Bytes(amountCheckScriptBuf.toString('hex')),

                    prevTokenInputIndex,
                    prevTokenAddress,
                    prevTokenAmount,
                    tokenTxHeader,
                    tokenTxInputProof,
                    prevTokenTxOutputProof,

                    senderPubKey: new PubKey(
                        // ftUtxo.publicKey ? toHex(ftUtxo.publicKey.toBuffer()) : PLACE_HOLDER_PUBKEY
                        ftUtxo.publicKey ? ftUtxo.publicKey.toHex() : PLACE_HOLDER_PUBKEY
                    ),
                    senderSig: new Sig(
                        senderPrivateKey
                            ? toHex(txComposer.getTxFormatSig(senderPrivateKey, inputIndex))
                            : PLACE_HOLDER_SIG
                    ),

                    // contractInputIndex: transferCheckInputIndex,
                    // contractTxOutputProof,
                    contractInputIndex: 0,
                    contractTxOutputProof,

                    // checkInputIndex: transferCheckInputIndex,
                    // checkScriptTx: new Bytes(transferCheckTx.serialize(true)),
                    // nReceivers: tokenOutputLen,

                    operation: ftProto.OP_TRANSFER,
                })

                if (this.debug && senderPrivateKey) {
                    let txContext = {
                        tx: txComposer.getTx(),
                        inputIndex: inputIndex,
                        inputSatoshis: txComposer.getInput(inputIndex).output.satoshis,
                    }
                    let ret = unlockingContract.verify(txContext)
                    if (!ret.success) throw ret
                }

                txComposer.getInput(inputIndex).setScript(unlockingContract.toScript() as mvc.Script)
            })

            const tokenOutputSatoshis = txComposer.getOutput(0).satoshis

            let sub: any = transferCheckUtxo.lockingScript
            sub = sub.subScript(0)
            const txPreimage = new SigHashPreimage(
                toHex(
                    getPreimage(
                        txComposer.getTx(),
                        sub,
                        transferCheckUtxo.satoshis,
                        transferCheckInputIndex
                        // Signature.SIGHASH_ALL
                    )
                )
            )
            // unlock the token transfer check utxo
            let unlockingContract = tokenTransferCheckContract.unlock({
                // txPreimage: txComposer.getInputPreimage(transferCheckInputIndex),
                txPreimage,
                prevouts: new Bytes(prevouts.toHex()),
                tokenScript: new Bytes(inputTokenScript.toHex()),

                tokenTxHeaderArray: new Bytes(tokenTxHeaderArray.toString('hex')),
                tokenTxHashProofArray: new Bytes(tokenTxHashProofArray.toString('hex')),
                tokenSatoshiBytesArray: new Bytes(tokenSatoshiBytesArray.toString('hex')),

                inputTokenAddressArray: new Bytes(toHex(inputTokenAddressArray)),
                inputTokenAmountArray: new Bytes(toHex(inputTokenAmountArray)),
                // receiverSatoshiArray: new Bytes(toHex(outputSatoshiArray)),

                tokenOutputSatoshis,

                // same
                changeSatoshis: new Int(
                    changeOutputIndex != -1 ? txComposer.getOutput(changeOutputIndex).satoshis : 0
                ),
                changeAddress: new Ripemd160(toHex(changeAddress.hashBuffer)),
                opReturnScript: new Bytes(opreturnScriptHex),
            })

            if (this.debug) {
                let txContext = {
                    tx: txComposer.getTx(),
                    inputIndex: transferCheckInputIndex,
                    inputSatoshis: txComposer.getInput(transferCheckInputIndex).output.satoshis,
                }
                let ret = unlockingContract.verify(txContext)
                if (ret.success == false) throw ret
            }

            txComposer
                .getInput(transferCheckInputIndex)
                .setScript(unlockingContract.toScript() as mvc.Script)
        }

        if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
            p2pkhInputIndexs.forEach((inputIndex) => {
                let privateKey = utxoPrivateKeys.splice(0, 1)[0]
                txComposer.unlockP2PKHInput(privateKey, inputIndex)
            })
        }
        checkFeeRate(txComposer, this.feeb)

        return {transferCheckTxComposer, txComposer}
    }

    /**
     * burn the provided ft utxos, the utxo must be sent to the zero address in order to burn
     * @param codehash codehash of the token
     * @param genesis genesis of the token
     * @param ftUtxos ft utxos to burn(must be transferred to the zero address)
     * @param utxos utxos to pay the fee
     * @param utxoPrivateKeys private keys of the utxos(fee paying utxos)
     * @param changeAddress the address to receive the change satoshis
     * @param opreturnData opreturn data
     * @private
     */
    private async _burn(
        {
            codehash,
            genesis,
            ftUtxos,
            utxos,
            utxoPrivateKeys,
            changeAddress,
            opreturnData,
        }: {
            codehash: string
            genesis: string
            ftUtxos: FtUtxo[]
            utxos: Utxo[]
            utxoPrivateKeys: mvc.PrivateKey[]
            changeAddress: mvc.Address
            opreturnData?: any
        }) {
        if (utxos.length == 0) {
            throw new CodeError(ErrCode.EC_INSUFFICIENT_MVC, 'Mvc utxos should not be empty in the burn operation')
        }
        // limit the number of fee paying utxos
        if (utxos.length > 3) {
            throw new CodeError(
                ErrCode.EC_UTXOS_MORE_THAN_3,
                'Mvc utxos should be no more than 3 in the transfer operation, please merge it first '
            );
        }

        // check the ftUtxos must be sent to the zero address
        ftUtxos.forEach((ftUtxo) => {
            if (!ftUtxo.tokenAddress.hashBuffer.equals(BURN_ADDRESS)) {
                throw new CodeError(ErrCode.EC_CANNOT_BURN_NON_ZERO_ADDRESS, 'All ftUtxo must be sent to the zero address in order to burn')
            }
        })

        // preprocess the ftUtxos, fetch previous tx hex and parse the token amount. decide the token transfer type.
        const {tokenInputArray, tokenUnlockType} = await this._prepareBurnTokens({
            genesis,
            ftUtxos,
        })

        // calculate the fee
        let estimateSatoshis = this._calBurnEstimateFee({
            p2pkhInputNum: utxos.length,
            tokenInputArray,
            opreturnData,
            tokenUnlockType,
        })

        // if fee is not enough, throw error
        const balance = utxos.reduce((pre, cur) => pre + cur.satoshis, 0)
        if (balance < estimateSatoshis) {
            throw new CodeError(
                ErrCode.EC_INSUFFICIENT_MVC,
                `Insufficient balance.It take more than ${estimateSatoshis}, but only ${balance}.`
            )
        }

        ftUtxos = tokenInputArray
        const defaultFtUtxo = tokenInputArray[0]
        const ftUtxoTx = new mvc.Transaction(defaultFtUtxo.satotxInfo.txHex)
        const tokenLockingScript = ftUtxoTx.outputs[defaultFtUtxo.outputIndex].script

        //create transferCheck contract
        let tokenUnlockCheckContract = TokenUnlockContractCheckFactory.createContract(tokenUnlockType)

        tokenUnlockCheckContract.setFormatedDataPart({
            nSender: tokenInputArray.length,
            tokenCodeHash: toHex(ftProto.getContractCodeHash(tokenLockingScript.toBuffer())),
            tokenID: toHex(ftProto.getTokenID(tokenLockingScript.toBuffer())),
        })

        const unlockCheckTxComposer = new TxComposer()

        // add utxo to provide fee for transfer check transaction
        const unlockCheckP2pkhInputIndices = utxos.map((utxo) => {
            const inputIndex = unlockCheckTxComposer.appendP2PKHInput(utxo as any)
            unlockCheckTxComposer.addSigHashInfo({
                inputIndex,
                address: utxo.address.toString(),
                sighashType,
                contractType: CONTRACT_TYPE.P2PKH,
            })
            return inputIndex
        })
        // add outputs for unlock check transaction
        const unlockCheckOutputIndex = unlockCheckTxComposer.appendOutput({
            lockingScript: tokenUnlockCheckContract.lockingScript,
            satoshis: this.getDustThreshold(tokenUnlockCheckContract.lockingScript.toBuffer().length)
        })
        // add change
        let unlockCheckChangeOutputIndex = unlockCheckTxComposer.appendChangeOutput(utxos[0].address, this.feeb)

        // unlock the fee utxo for unlock check transaction
        let unsignSigPlaceHolderSize = 0
        if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
            unlockCheckP2pkhInputIndices.forEach((inputIndex) => {
                let privateKey = utxoPrivateKeys.splice(0, 1)[0]
                unlockCheckTxComposer.unlockP2PKHInput(privateKey, inputIndex)
            })
        } else {
            //To supplement the size calculation when unsigned
            unlockCheckP2pkhInputIndices.forEach((v) => {
                unsignSigPlaceHolderSize += P2PKH_UNLOCK_SIZE
            })
            //Each ftUtxo need to unlock with the size
            unsignSigPlaceHolderSize = unsignSigPlaceHolderSize * ftUtxos.length
        }

        // change utxo to the output of transfer check transaction
        utxos = [
            {
                txId: unlockCheckTxComposer.getTxId(),
                satoshis: unlockCheckTxComposer.getOutput(unlockCheckOutputIndex).satoshis,
                outputIndex: unlockCheckOutputIndex,
                address: utxos[0].address,
            },
        ]

        // unlock check utxo in order to unlock the token utxo
        let unlockCheckUtxo = {
            txId: unlockCheckTxComposer.getTxId(),
            outputIndex: unlockCheckChangeOutputIndex,
            satoshis: unlockCheckTxComposer.getOutput(unlockCheckChangeOutputIndex).satoshis,
            lockingScript: unlockCheckTxComposer.getOutput(unlockCheckChangeOutputIndex).script,
        }

        // build token burn transaction
        const txComposer = new TxComposer()
        let prevouts = new Prevouts()

        // concat the token addresses and amounts for check
        let inputTokenScript: mvc.Script
        let inputTokenAmountArray = Buffer.alloc(0)
        let inputTokenAddressArray = Buffer.alloc(0)

        const ftUtxoInputIndexs = ftUtxos.map((ftUtxo) => {
            const inputIndex = txComposer.appendInput(ftUtxo)
            prevouts.addVout(ftUtxo.txId, ftUtxo.outputIndex)
            txComposer.addSigHashInfo({
                inputIndex,
                address: ftUtxo.tokenAddress.toString(),
                sighashType,
                contractType: CONTRACT_TYPE.BCP02_TOKEN,
            })
            inputTokenScript = ftUtxo.lockingScript
            inputTokenAddressArray = Buffer.concat([
                inputTokenAddressArray,
                ftUtxo.tokenAddress.hashBuffer,
            ])

            inputTokenAmountArray = Buffer.concat([
                inputTokenAmountArray,
                ftUtxo.tokenAmount.toBuffer({
                    endian: 'little',
                    size: 8,
                }),
            ])
            return inputIndex
        })

        //tx addInput utxo
        const p2pkhInputIndexs = utxos.map((utxo) => {
            const inputIndex = txComposer.appendP2PKHInput(utxo as any)
            prevouts.addVout(utxo.txId, utxo.outputIndex)
            txComposer.addSigHashInfo({
                inputIndex,
                address: utxo.address.toString(),
                sighashType,
                contractType: CONTRACT_TYPE.P2PKH,
            })
            return inputIndex
        })

        //添加unlockCheck为最后一个输入
        const unlockCheckInputIndex = txComposer.appendInput(unlockCheckUtxo)
        prevouts.addVout(unlockCheckUtxo.txId, unlockCheckUtxo.outputIndex)

        // // concat the token addresses and amounts for check
        // // no receiver for token burn
        // let receiverArray = Buffer.alloc(0)
        // let receiverTokenAmountArray = Buffer.alloc(0)
        // let outputSatoshiArray = Buffer.alloc(0)

        //tx addOutput OpReturn
        if (opreturnData) {
            txComposer.appendOpReturnOutput(opreturnData);
        }

        //The first round of calculations get the exact size of the final transaction, and then change again
        //Due to the change, the script needs to be unlocked again in the second round
        //let the fee be exact in the second round
        for (let c = 0; c < 2; c++) {
            txComposer.clearChangeOutput()
            const changeOutputIndex = txComposer.appendChangeOutput(
                changeAddress,
                this.feeb,
                unsignSigPlaceHolderSize
            )

            let tokenTxHeaderArray = Buffer.alloc(0)
            let tokenTxHashProofArray = Buffer.alloc(0)
            let tokenSatoshiBytesArray = Buffer.alloc(0)

            // process each ft utxo input, unlock the token utxo
            ftUtxoInputIndexs.forEach((inputIndex, idx) => {
                let ftUtxo = ftUtxos[idx]

                let dataPartObj = ftProto.parseDataPart(ftUtxo.lockingScript.toBuffer())
                const dataPart = ftProto.newDataPart(dataPartObj)

                const tokenContract = TokenFactory.createContract(
                    this.transferCheckCodeHashArray,
                    this.unlockContractCodeHashArray
                )
                const amountCheckTx = unlockCheckTxComposer.getTx()
                const amountCheckOutputIndex = 0
                const amountCheckTxOutputProofInfo = new TxOutputProof(
                    TokenUtil.getTxOutputProof(amountCheckTx, amountCheckOutputIndex)
                )
                const amountCheckScriptBuf = amountCheckTx.outputs[amountCheckOutputIndex].script.toBuffer()

                // previous tx check
                const prevTokenInputIndex = ftUtxo.prevTokenInputIndex
                const prevTokenAmount = BigInt(ftUtxo.preTokenAmount.toString(10))
                const tokenTx = new mvc.Transaction(ftUtxo.satotxInfo.txHex)

                const inputRes = TokenUtil.getTxInputProof(tokenTx, prevTokenInputIndex)
                const tokenTxInputProof = new TxInputProof(inputRes[0])
                // TODO:
                const tokenTxHeader = inputRes[1] as Bytes
                const prevTokenTxOutputProof = new TxOutputProof(
                    TokenUtil.getTxOutputProof(ftUtxo.prevTokenTx, ftUtxo.prevTokenOutputIndex)
                )

                const tokenTxInfoHex = TokenUtil.getTxInfoHex(tokenTx, ftUtxo.outputIndex)

                tokenTxHeaderArray = Buffer.concat([
                    tokenTxHeaderArray,
                    Buffer.from(tokenTxInfoHex.txHeader, 'hex'),
                ])

                const hashProofBuf = Buffer.from(tokenTxInfoHex.txHashProof, 'hex')
                tokenTxHashProofArray = Buffer.concat([
                    tokenTxHashProofArray,
                    TokenUtil.getUInt32Buf(hashProofBuf.length),
                    hashProofBuf,
                ])

                tokenSatoshiBytesArray = Buffer.concat([
                    tokenSatoshiBytesArray,
                    Buffer.from(tokenTxInfoHex.txSatoshi, 'hex'),
                ])

                // unlockFromContract
                const contractTxOutputProof = getTxOutputProof(unlockCheckTxComposer.getTx(), unlockCheckOutputIndex)

                tokenContract.setDataPart(toHex(dataPart))

                // unlock the token utxo
                const unlockingContract = tokenContract.unlock({
                    txPreimage: txComposer.getInputPreimage(inputIndex),
                    prevouts: new Bytes(prevouts.toHex()),

                    tokenInputIndex: inputIndex,
                    amountCheckHashIndex: tokenUnlockType - 1,
                    amountCheckInputIndex: txComposer.getTx().inputs.length - 1,
                    // amountCheckInputIndex: ftUtxo.satotxInfo.txInputsCount - 1,
                    amountCheckTxOutputProofInfo,
                    amountCheckScript: new Bytes(amountCheckScriptBuf.toString('hex')),

                    prevTokenInputIndex,
                    prevTokenAddress: new Bytes(BURN_ADDRESS.toString('hex')),
                    prevTokenAmount,
                    tokenTxHeader,
                    tokenTxInputProof,
                    prevTokenTxOutputProof,

                    senderPubKey: new PubKey(
                        PLACE_HOLDER_PUBKEY
                    ),
                    senderSig: new Sig(
                        PLACE_HOLDER_SIG
                    ),

                    // contractInputIndex: transferCheckInputIndex,
                    // contractTxOutputProof,
                    contractInputIndex: unlockCheckInputIndex,
                    contractTxOutputProof: new TxOutputProof(contractTxOutputProof),

                    // checkInputIndex: transferCheckInputIndex,
                    // checkScriptTx: new Bytes(transferCheckTx.serialize(true)),
                    // nReceivers: tokenOutputLen,

                    operation: ftProto.FT_OP_TYPE.UNLOCK_FROM_CONTRACT,
                })

                if (this.debug) {
                    let txContext = {
                        tx: txComposer.getTx(),
                        inputIndex: inputIndex,
                        inputSatoshis: txComposer.getInput(inputIndex).output.satoshis,
                    }
                    let ret = unlockingContract.verify(txContext)
                    if (!ret.success) throw ret
                }

                txComposer.getInput(inputIndex).setScript(unlockingContract.toScript() as mvc.Script)
            })

            // since the token is burned, the token output satoshi is 0
            const tokenOutputSatoshis = 0
            const tokenOutputIndexArray = Buffer.alloc(0)
            const changeOutput = txComposer.getTx().outputs[changeOutputIndex];

            // prepare change output array for the unlock check utxo
            const otherOutputArray = Buffer.concat([
                getUInt64Buf(changeOutput.satoshis),
                writeVarint(changeOutput.script.toBuffer()),
            ])

            let sub: any = unlockCheckUtxo.lockingScript
            sub = sub.subScript(0)
            const txPreimage = new SigHashPreimage(
                toHex(
                    getPreimage(
                        txComposer.getTx(),
                        sub,
                        unlockCheckUtxo.satoshis,
                        unlockCheckInputIndex
                        // Signature.SIGHASH_ALL
                    )
                )
            )
            // unlock the token transfer check utxo
            let unlockingContract = tokenUnlockCheckContract.unlock(
                {
                    // txPreimage: txComposer.getInputPreimage(transferCheckInputIndex),
                    txPreimage,
                    prevouts: new Bytes(prevouts.toHex()),
                    tokenScript: new Bytes(inputTokenScript.toHex()),

                    tokenTxHeaderArray: new Bytes(tokenTxHeaderArray.toString('hex')),
                    tokenTxHashProofArray: new Bytes(tokenTxHashProofArray.toString('hex')),
                    tokenSatoshiBytesArray: new Bytes(tokenSatoshiBytesArray.toString('hex')),

                    inputTokenAddressArray: new Bytes(toHex(inputTokenAddressArray)),
                    inputTokenAmountArray: new Bytes(toHex(inputTokenAmountArray)),
                    nOutputs: unlockCheckTxComposer.getTx().outputs.length,
                    tokenOutputIndexArray: new Bytes(tokenOutputIndexArray.toString(('hex'))),
                    tokenOutputSatoshis,
                    otherOutputArray: new Bytes(toHex(otherOutputArray)),
                })

            if (this.debug) {
                let txContext = {
                    tx: txComposer.getTx(),
                    inputIndex: unlockCheckInputIndex,
                    inputSatoshis: txComposer.getInput(unlockCheckInputIndex).output.satoshis,
                }
                let ret = unlockingContract.verify(txContext)
                if (ret.success == false) throw ret
            }

            txComposer
                .getInput(unlockCheckInputIndex)
                .setScript(unlockingContract.toScript() as mvc.Script)
        }

        if (utxoPrivateKeys && utxoPrivateKeys.length > 0) {
            p2pkhInputIndexs.forEach((inputIndex) => {
                let privateKey = utxoPrivateKeys.splice(0, 1)[0]
                txComposer.unlockP2PKHInput(privateKey, inputIndex)
            })
        }
        checkFeeRate(txComposer, this.feeb)

        return {unlockCheckTxComposer, txComposer}
    }


    /**
     * calculate transfer fee for ft transfer
     * @param p2pkhInputNum
     * @param tokenInputArray
     * @param tokenOutputArray
     * @param tokenTransferType
     * @param opreturnData
     * @private
     */
    private _calTransferEstimateFee(
        {
            p2pkhInputNum = 10,
            tokenInputArray,
            tokenOutputArray,
            tokenTransferType,
            opreturnData,
        }: {
            p2pkhInputNum: number
            tokenInputArray: FtUtxo[]
            tokenOutputArray: { address: mvc.Address; tokenAmount: BN }[]
            tokenTransferType: TOKEN_TRANSFER_TYPE
            opreturnData: any
        }) {
        let inputTokenNum = tokenInputArray.length
        let outputTokenNum = tokenOutputArray.length
        let dummyTransferCheckContract = TokenTransferCheckFactory.getDummyInstance(tokenTransferType)
        let routeCheckLockingSize = TokenTransferCheckFactory.getLockingScriptSize(tokenTransferType)
        let routeCheckUnlockingSize = TokenTransferCheckFactory.calUnlockingScriptSize(
            tokenTransferType,
            p2pkhInputNum,
            inputTokenNum,
            outputTokenNum,
            opreturnData
        )
        let tokenUnlockingSize = TokenFactory.calUnlockingScriptSize(
            dummyTransferCheckContract,
            p2pkhInputNum,
            inputTokenNum,
            outputTokenNum
        )

        let tokenLockingSize = TokenFactory.getLockingScriptSize()

        let stx1 = new SizeTransaction(this.feeb, this.dustCalculator)
        for (let i = 0; i < p2pkhInputNum; i++) {
            stx1.addP2PKHInput()
        }
        stx1.addOutput(routeCheckLockingSize)
        stx1.addP2PKHOutput()

        let stx = new SizeTransaction(this.feeb, this.dustCalculator)
        for (let i = 0; i < inputTokenNum; i++) {
            stx.addInput(tokenUnlockingSize, tokenInputArray[i].satoshis)
        }
        for (let i = 0; i < p2pkhInputNum; i++) {
            stx.addP2PKHInput()
        }
        stx.addInput(
            routeCheckUnlockingSize,
            this.dustCalculator.getDustThreshold(routeCheckLockingSize)
        )

        for (let i = 0; i < outputTokenNum; i++) {
            stx.addOutput(tokenLockingSize)
        }
        if (opreturnData) {
            stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
        }
        stx.addP2PKHOutput()
        return stx1.getFee() + stx.getFee()
    }

    /**
     * calculate transfer fee for ft burn
     * this includes the fee for transfer check tx
     * @param p2pkhInputNum
     * @param tokenInputArray
     * @param opreturnData
     * @param tokenUnlockType
     * @private
     */
    private _calBurnEstimateFee(
        {
            p2pkhInputNum = 10,
            tokenInputArray,
            opreturnData,
            tokenUnlockType,
        }: {
            p2pkhInputNum: number
            tokenInputArray: FtUtxo[]
            opreturnData: any
            tokenUnlockType: TOKEN_UNLOCK_TYPE
        }) {
        let inputTokenNum = tokenInputArray.length
        let dummyTransferCheckContract = TokenUnlockContractCheckFactory.getDummyInstance(tokenUnlockType)
        let routeCheckLockingSize = TokenUnlockContractCheckFactory.getLockingScriptSize(tokenUnlockType)
        let routeCheckUnlockingSize = TokenUnlockContractCheckFactory.calUnlockingScriptSize(
            tokenUnlockType,
            p2pkhInputNum,
            inputTokenNum,
            1,
            opreturnData
        )
        let tokenUnlockingSize = TokenFactory.calUnlockingScriptSize(
            dummyTransferCheckContract,
            p2pkhInputNum,
            inputTokenNum,
            0
        )

        let stx1 = new SizeTransaction(this.feeb, this.dustCalculator)
        for (let i = 0; i < p2pkhInputNum; i++) {
            stx1.addP2PKHInput()
        }
        stx1.addOutput(routeCheckLockingSize)
        stx1.addP2PKHOutput()

        let stx = new SizeTransaction(this.feeb, this.dustCalculator)
        for (let i = 0; i < inputTokenNum; i++) {
            stx.addInput(tokenUnlockingSize, tokenInputArray[i].satoshis)
        }
        for (let i = 0; i < p2pkhInputNum; i++) {
            stx.addP2PKHInput()
        }
        stx.addInput(
            routeCheckUnlockingSize,
            this.dustCalculator.getDustThreshold(routeCheckLockingSize)
        )

        if (opreturnData) {
            stx.addOpReturnOutput(mvc.Script.buildSafeDataOut(opreturnData).toBuffer().length)
        }
        stx.addP2PKHOutput()
        return stx1.getFee() + stx.getFee()
    }

    private getDustThreshold(size: number) {
        return this.dustCalculator.getDustThreshold(size)
    }

    public async getBalance({
                                codehash,
                                genesis,
                                address,
                            }: {
        codehash: string
        genesis: string
        address: string
    }): Promise<string> {
        let {balance, pendingBalance} = await this.api.getFungibleTokenBalance(
            codehash,
            genesis,
            address
        )
        return BN.fromString(balance, 10).add(BN.fromString(pendingBalance, 10)).toString()
    }

    /**
     * Query token balance detail
     * @param codehash
     * @param genesis
     * @param address
     * @returns
     */
    public async getBalanceDetail({
                                      codehash,
                                      genesis,
                                      address,
                                  }: {
        codehash: string
        genesis: string
        address: string
    }): Promise<{
        balance: string
        pendingBalance: string
        utxoCount: number
        decimal: number
    }> {
        return await this.api.getFungibleTokenBalance(codehash, genesis, address)
    }

    /**
     * Query the Token list under this address. Get the balance of each token
     * @param address
     * @returns
     */
    public async getSummary(address: string) {
        return await this.api.getFungibleTokenSummary(address)
    }

    public async getFtUtxos(
        codehash: string,
        genesis: string,
        address: string,
        count: number = 20
    ): Promise<FungibleTokenUnspent[]> {
        return await this.api.getFungibleTokenUnspents(codehash, genesis, address, count)
    }

    public async getMergeEstimateFee({
                                         codehash,
                                         genesis,
                                         ownerWif,
                                         ownerPublicKey,
                                         ftUtxos,
                                         ftChangeAddress,
                                         opreturnData,
                                         utxoMaxCount = 3,
                                         minUtxoSet = true,
                                     }: {
        codehash: string
        genesis: string
        ownerWif?: string
        ownerPublicKey?: string | mvc.PublicKey
        ftUtxos?: ParamFtUtxo[]
        ftChangeAddress?: string | mvc.Address
        opreturnData?: any
        utxoMaxCount?: number
        minUtxoSet?: boolean
    }) {
        return await this.getTransferEstimateFee({
            codehash,
            genesis,
            senderWif: ownerWif,
            senderPublicKey: ownerPublicKey,
            ftUtxos,
            ftChangeAddress,
            opreturnData,
            receivers: [],
            isMerge: true,
            utxoMaxCount,
            minUtxoSet,
        })
    }

    public async getTransferEstimateFee({
                                            codehash,
                                            genesis,
                                            receivers,

                                            senderWif,
                                            senderPrivateKey,
                                            senderPublicKey,
                                            ftUtxos,
                                            ftChangeAddress,
                                            isMerge,
                                            opreturnData,
                                            utxoMaxCount = 3,
                                            minUtxoSet = true,
                                        }: {
        codehash: string
        genesis: string
        receivers?: TokenReceiver[]

        senderWif?: string
        senderPrivateKey?: string | mvc.PrivateKey
        senderPublicKey?: string | mvc.PublicKey
        ftUtxos?: ParamFtUtxo[]
        ftChangeAddress?: string | mvc.Address
        isMerge?: boolean
        opreturnData?: any
        utxoMaxCount?: number
        minUtxoSet?: boolean
    }) {
        let p2pkhInputNum = utxoMaxCount
        if (p2pkhInputNum > 3) {
            throw new CodeError(
                ErrCode.EC_UTXOS_MORE_THAN_3,
                'Mvc utxos should be no more than 3 in the transfer operation. '
            )
        }

        if (senderWif) {
            senderPrivateKey = mvc.PrivateKey.fromWIF(senderWif)
            senderPublicKey = senderPrivateKey.toPublicKey()
        } else if (senderPrivateKey) {
            senderPrivateKey = new mvc.PrivateKey(senderPrivateKey)
            senderPublicKey = senderPrivateKey.toPublicKey()
        } else if (senderPublicKey) {
            senderPublicKey = new mvc.PublicKey(senderPublicKey)
        }

        let utxos: Utxo[] = []
        for (let i = 0; i < p2pkhInputNum; i++) {
            utxos.push({
                txId: dummyTxId, //dummy
                outputIndex: i,
                satoshis: 1000,
                address: this.zeroAddress,
            })
        }

        let ftUtxoInfo = await this._pretreatFtUtxos(
            ftUtxos,
            codehash,
            genesis,
            senderPrivateKey as mvc.PrivateKey,
            senderPublicKey as mvc.PublicKey
        )
        if (ftChangeAddress) {
            ftChangeAddress = new mvc.Address(ftChangeAddress, this.network)
        } else {
            ftChangeAddress = ftUtxoInfo.ftUtxos[0].tokenAddress
        }

        let {tokenInputArray, tokenOutputArray, tokenTransferType} =
            await this._prepareTransferTokens({
                codehash,
                genesis,
                receivers,
                ftUtxos: ftUtxoInfo.ftUtxos,
                ftChangeAddress,
                isMerge,
                minUtxoSet,
            })

        let estimateSatoshis = this._calTransferEstimateFee({
            p2pkhInputNum: utxos.length,
            tokenInputArray,
            tokenOutputArray,
            tokenTransferType,
            opreturnData,
        })

        return estimateSatoshis
    }

    public static parseTokenScript(
        scriptBuf: Buffer,
        network: API_NET = API_NET.MAIN
    ): {
        codehash: string
        genesis: string
        sensibleId: string
        tokenName: string
        tokenSymbol: string
        decimalNum: number
        tokenAddress: string
        tokenAmount: any
        genesisHash: string
        sensibleID: ftProto.SensibleID
        protoVersion: number
        protoType: number
    } {
        if (!hasProtoFlag(scriptBuf)) {
            return null
        }
        const dataPart = ftProto.parseDataPart(scriptBuf)
        const tokenAddress = mvc.Address.fromPublicKeyHash(
            Buffer.from(dataPart.tokenAddress, 'hex'),
            network
        ).toString()
        const genesis = ftProto.getQueryGenesis(scriptBuf)
        const codehash = ftProto.getQueryCodehash(scriptBuf)
        const sensibleId = ftProto.getQuerySensibleID(scriptBuf)
        return {
            codehash,
            genesis,
            sensibleId,
            tokenName: dataPart.tokenName,
            tokenSymbol: dataPart.tokenSymbol,
            decimalNum: dataPart.decimalNum,
            tokenAddress,
            tokenAmount: dataPart.tokenAmount,
            genesisHash: dataPart.genesisHash,
            sensibleID: dataPart.sensibleID,
            protoVersion: dataPart.protoVersion,
            protoType: dataPart.protoType,
        }
    }
}
