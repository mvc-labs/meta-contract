import {Net} from '.'
import * as Utils from './utils'
import fetch from 'node-fetch'

type HttpConfig = {
    timeout?: number
    headers?: any
}

enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
}

type RequestData = {
    uri: string
    method: HttpMethod
    timeout: number
    gzip: boolean
    headers: any
}
type FetchOptions = {
    uri: string
    method: HttpMethod
    timeout: number
    compress?: boolean
    headers: any
    body?: any
    gzip?: boolean
}

export class ServerNet {

    static handleCallback = (resolve: Function, reject: Function, reqData: RequestData) => {
        const url = reqData.uri
        const options: FetchOptions = reqData
        options.compress = reqData.gzip
        delete options.uri
        delete options.gzip

        fetch(url, options)
            .then((res: any) => {
                if (res.status >= 200 && res.status < 300) {
                    resolve(res.json())
                } else {
                    console.log('request failed.', reqData)
                    reject(
                        new Error(
                            `RequestError: statuCode:${res.statusCode} statusMessage:${res.statusMessage} body:${res.json()}`
                        )
                    )
                }
            })
            .catch((err: any) => {
                console.log('request failed.', reqData)
                reject(err)
            })
    }

    static httpGet(url: string, params: any, cb?: Function, config?: any) {
        let str = ''
        let cnt = 0
        for (var id in params) {
            if (cnt != 0) str += '&'
            str += id + '=' + params[id]
            cnt++
        }
        if (str) {
            url += '?' + str
        }
        config = config || {}
        let headers = config.headers || {}
        let timeout: number = config.timeout || Net.timeout
        let reqData = {
            uri: url,
            method: HttpMethod.GET,
            timeout,
            gzip: true,
            headers,
        }

        if (typeof cb === 'function') {
            this.handleCallback(
                (result: any) => Utils.invokeCallback(cb, null, result),
                (err: any) => Utils.invokeCallback(cb, err),
                reqData
            )
            return
        }

        return new Promise((resolve, reject) => {
            this.handleCallback(resolve, reject, reqData)
        })
    }

    static async httpPost(url: string, params: any, cb?: Function, config?: HttpConfig) {
        let postData: any
        config = config || {}
        let headers = config.headers || {}
        let timeout = config.timeout || Net.timeout
        headers['content-type'] = headers['content-type'] || 'application/json'
        if (headers['content-type'] == 'application/x-www-form-urlencoded') {
            let arr = []
            for (var id in params) {
                arr.push(`${id}=${params[id]}`)
            }
            postData = arr.join('&')
        } else if (headers['content-type'] == 'text/plain') {
            postData = params
        } else {
            postData = JSON.stringify(params)
        }
        if (headers['content-encoding'] == 'gzip') {
            postData = await Utils.gzip(Buffer.from(postData))
        }

        const reqData = {
            uri: url,
            method: HttpMethod.POST,
            body: postData,
            headers: headers,
            timeout: timeout,
            gzip: true,
        }

        if (typeof cb === 'function') {
            this.handleCallback(
                (result: any) => Utils.invokeCallback(cb, null, result),
                (err: any) => Utils.invokeCallback(cb, err),
                reqData
            )
            return
        }

        return new Promise((resolve, reject) => {
            this.handleCallback(resolve, reject, reqData)
        })
    }
}
