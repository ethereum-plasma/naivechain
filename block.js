'use strict';

var CryptoJS = require("crypto-js");

var tx = require("./transaction");
var geth = require("./geth");
var utils = require("./utils");

var Merkle = require("./merkle");

class Block {
    constructor(blockNumber, previousHash, transactions) {
        var data = [];
        transactions.forEach(tx => data.push(tx.toString()));

        this.blockHeader = new BlockHeader(blockNumber, previousHash, data);
        this.transactions = transactions;
    }
}

class BlockHeader {
    constructor(blockNumber, previousHash, data) {
        this.blockNumber = blockNumber;  // 4 bytes
        this.previousHash = previousHash;  // 32 bytes
        this.merkleRoot = new Merkle(data).computeRootHash();  // 32 bytes
        this.sigR = '';  // 32 bytes
        this.sigS = '';  // 32 bytes
        this.sigV = '';  // 1 byte
    }

    setSignature(signature) {
        var sig = utils.removeHexPrefix(signature);
        var sigR = sig.substring(0, 64);
        var sigS = sig.substring(64, 128);
        var sigV = parseInt(sig.substring(128, 130), 16);
        if (sigV < 27) {
            sigV += 27;
        }
        this.sigR = sigR;
        this.sigS = sigS;
        this.sigV = sigV.toString(16).padStart(2, "0");
    }
}

var getGenesisBlock = () => {
    return new Block(0, '0', []);
};

var blockchain = [getGenesisBlock()];

var getRawBlockHeader = (header, includingSig) => {
    var blkNumHexString = header.blockNumber.toString(16).padStart(8, '0');
    var rawBlockHeader = blkNumHexString + header.previousHash + header.merkleRoot;
    if (includingSig) {
        rawBlockHeader += header.sigR + header.sigS + header.sigV;
    }
    return rawBlockHeader;
}

var calculateHashForBlock = (block) => {
    return CryptoJS.SHA256(getRawBlockHeader(block.blockHeader, true)).toString();
};

var generateNextBlock = async () => {
    var previousBlock = getLatestBlock();
    var previousHash = calculateHashForBlock(previousBlock);
    var nextIndex = previousBlock.blockHeader.blockNumber + 1;

    // Query contract past event for deposit transactions and build a new block.
    var deposits = await geth.getDeposits(nextIndex - 1);
    var transactions = await tx.collectTransactions(deposits);
    var rawBlock = new Block(nextIndex, previousHash, transactions);

    // Operator signs the block.
    var messageToSign = utils.addHexPrefix(getRawBlockHeader(rawBlock.blockHeader, false));
    try {
        var signature = await geth.signBlock(messageToSign);
        rawBlock.blockHeader.setSignature(signature);

        // Submit the block header to plasma contract.
        var hexPrefixHeader = utils.addHexPrefix(getRawBlockHeader(rawBlock.blockHeader, true));
        geth.submitBlockHeader(hexPrefixHeader);

        await addBlock(rawBlock);
    } catch (e) {
        throw e;
    }
};

var addBlock = async (newBlock) => {
    if (await isValidNewBlock(newBlock, getLatestBlock())) {
        console.log('Block added: ' + JSON.stringify(newBlock));
        blockchain.push(newBlock);
    } else {
        throw "New block invalid";
    }
};

var isValidNewBlock = async (newBlock, previousBlock) => {
    if (previousBlock.blockHeader.blockNumber + 1 !== newBlock.blockHeader.blockNumber) {
        console.log('Block number is invalid.');
        return false;
    } else if (calculateHashForBlock(previousBlock) !== newBlock.blockHeader.previousHash) {
        console.log('Previous block hash is invalid.');
        return false;
    } else if (await !tx.isValidBlockContent(newBlock)) {
        console.log('Transactions in block are invalid.');
        return false;
    }
    return true;
};

var replaceChain = async (newBlocks) => {
    if (await isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain.');
        blockchain = newBlocks;
    } else {
        throw "Received blockchain is invalid.";
    }
};

var isValidChain = async (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (await isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var getBlocks = () => blockchain;

module.exports = {addBlock, replaceChain, getLatestBlock, getBlocks,
    generateNextBlock, calculateHashForBlock};
