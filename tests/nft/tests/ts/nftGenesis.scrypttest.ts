import { initContractHash, issueNft } from "./nftUtils"

describe('Test nftGenesis contract unlock In Javascript', () => {
    before(() => {
        initContractHash()
    });

    it('should success when issue nft', () => {
        issueNft(3, 0)
        issueNft(3, 1)
        issueNft(3, 2)
    });

    it('should failed when issue more nft', () => {
        issueNft(3, 3, {expected: false})
    });
})