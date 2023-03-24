import {ContractAdapter} from '../../common/ContractAdapter'
import {buildContractClass, Bytes, FunctionCall, SigHashPreimage, toHex} from '../../scryptlib'
import * as proto from '../contract-proto/tokenUnlockContractCheck.proto'
import {dummyCodehash} from "@/common/dummy";

export enum TOKEN_UNLOCK_TYPE {
    IN_2_OUT_5 = 1,
    IN_4_OUT_8,
    IN_8_OUT_12,
    IN_3_OUT_100,
    IN_20_OUT_5,
    UNSUPPORT,
}

const _tokenUnlockTypeInfos = [
    {
        type: TOKEN_UNLOCK_TYPE.IN_2_OUT_5,
        in: 2,
        out: 5,
        lockingScriptSize: 0,
    },
    {
        type: TOKEN_UNLOCK_TYPE.IN_4_OUT_8,
        in: 4,
        out: 8,
        lockingScriptSize: 0,
    },
    {
        type: TOKEN_UNLOCK_TYPE.IN_3_OUT_100,
        in: 3,
        out: 100,
        lockingScriptSize: 0,
    },
    {
        type: TOKEN_UNLOCK_TYPE.IN_8_OUT_12,
        in: 8,
        out: 12,
        lockingScriptSize: 0,
    },
    {
        type: TOKEN_UNLOCK_TYPE.IN_20_OUT_5,
        in: 20,
        out: 5,
        lockingScriptSize: 0,
    },
]

export class TokenUnlockContractCheck extends ContractAdapter {
    constuctParams: {
        unlockType: TOKEN_UNLOCK_TYPE
    }
    private _formatedDataPart: proto.FormatedDataPart

    constructor(constuctParams: { unlockType: TOKEN_UNLOCK_TYPE }) {
        let desc

        switch (constuctParams.unlockType) {
            case TOKEN_UNLOCK_TYPE.IN_2_OUT_5:
                desc = require('../contract-desc/tokenUnlockContractCheck_desc.json')
                break
            case TOKEN_UNLOCK_TYPE.IN_4_OUT_8:
                desc = require('../contract-desc/tokenUnlockContractCheck_4To8_desc.json')
                break
            case TOKEN_UNLOCK_TYPE.IN_8_OUT_12:
                desc = require('../contract-desc/tokenUnlockContractCheck_8To12_desc.json')
                break
            case TOKEN_UNLOCK_TYPE.IN_3_OUT_100:
                desc = require('../contract-desc/tokenUnlockContractCheck_3To100_desc.json')
                break
            case TOKEN_UNLOCK_TYPE.IN_20_OUT_5:
                desc = require('../contract-desc/tokenUnlockContractCheck_20To5_desc.json')
                break
            default:
                throw 'invalid unlockType'
        }

        let ClassObj = buildContractClass(desc)
        let contract = new ClassObj()
        super(contract)

        this.constuctParams = constuctParams
        this._formatedDataPart = {}
    }

    clone() {
        let contract = new TokenUnlockContractCheck(this.constuctParams)
        contract.setFormatedDataPart(this.getFormatedDataPart())
        return contract
    }

    public setFormatedDataPart(dataPart: proto.FormatedDataPart): void {
        this._formatedDataPart = Object.assign({}, this._formatedDataPart, dataPart)
        super.setDataPart(toHex(proto.newDataPart(this._formatedDataPart)))
    }

    public getFormatedDataPart() {
        return this._formatedDataPart
    }

    public unlock(
        {
            txPreimage,
            prevouts,
            tokenScript,
            tokenTxHeaderArray,
            tokenTxHashProofArray,
            tokenSatoshiBytesArray,
            inputTokenAddressArray,
            inputTokenAmountArray,
            nOutputs,
            tokenOutputIndexArray,
            tokenOutputSatoshis,
            otherOutputArray,

        }: {
            txPreimage: SigHashPreimage
            prevouts: Bytes
            tokenScript: Bytes
            tokenTxHeaderArray: Bytes
            tokenTxHashProofArray: Bytes
            tokenSatoshiBytesArray: Bytes
            inputTokenAddressArray: Bytes
            inputTokenAmountArray: Bytes
            nOutputs: number
            tokenOutputIndexArray: Bytes
            tokenOutputSatoshis: number
            otherOutputArray: Bytes
        }) {
        return this._contract.unlock(
            txPreimage,
            prevouts,
            tokenScript,
            tokenTxHeaderArray,
            tokenTxHashProofArray,
            tokenSatoshiBytesArray,
            inputTokenAddressArray,
            inputTokenAmountArray,
            nOutputs,
            tokenOutputIndexArray,
            tokenOutputSatoshis,
            otherOutputArray
        ) as FunctionCall
    }
}

export class TokenUnlockContractCheckFactory {

    public static tokenUnlockTypeInfos: {
        type: TOKEN_UNLOCK_TYPE
        in: number
        out: number
        lockingScriptSize: number
    }[] = _tokenUnlockTypeInfos

    public static getOptimumType(inCount: number, outCount: number) {
        if (inCount <= 2 && outCount <= 5) {
            return TOKEN_UNLOCK_TYPE.IN_2_OUT_5
        } else if (inCount <= 4 && outCount <= 8) {
            return TOKEN_UNLOCK_TYPE.IN_4_OUT_8
        } else if (inCount <= 8 && outCount <= 12) {
            return TOKEN_UNLOCK_TYPE.IN_8_OUT_12
        } else if (inCount <= 20 && outCount <= 5) {
            return TOKEN_UNLOCK_TYPE.IN_20_OUT_5
        } else if (inCount <= 3 && outCount <= 100) {
            return TOKEN_UNLOCK_TYPE.IN_3_OUT_100
        } else {
            return TOKEN_UNLOCK_TYPE.UNSUPPORT
        }
    }

    public static createContract(unlockType: TOKEN_UNLOCK_TYPE) {
        return new TokenUnlockContractCheck({unlockType})
    }

    public static getLockingScriptSize(unlockType: TOKEN_UNLOCK_TYPE) {
        return this.tokenUnlockTypeInfos.find((v) => v.type == unlockType).lockingScriptSize
    }

  public static calUnlockingScriptSize(
      checkType: TOKEN_UNLOCK_TYPE,
      mvcInputLen: number,
      tokenInputLen: number,
      tokenOutputLen: number,
      opreturnData: any
  ): number {
    // todo finish this
    return 1000
  }

    public static getDummyInstance(unlockType: TOKEN_UNLOCK_TYPE) {
        let v = this.tokenUnlockTypeInfos.find((v) => v.type == unlockType)
        let tokenInputArray = new Array(v.in).fill(0)

        let contract = this.createContract(v.type)
        contract.setFormatedDataPart({
            inputTokenIndexArray: tokenInputArray,
            tokenCodeHash: toHex(dummyCodehash),
            tokenID: toHex(dummyCodehash),
        })
        return contract
    }
}
