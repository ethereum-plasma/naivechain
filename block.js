'use strict';

var CryptoJS = require("crypto-js");
var stripHexPrefix = require('strip-hex-prefix');

var tx = require("./transaction");
var geth = require("./geth");

var Merkle = require("./merkle");

class Block {
    constructor(blockNumber, previousHash, transactions) {
        var data = [];
        transactions.forEach(tx => data.push(tx));

        this.blockHeader = new BlockHeader(blockNumber, previousHash, data);
        this.transactions = transactions;
    }
}

class BlockHeader {
    constructor(blockNumber, previousHash, data) {
        this.blockNumber = blockNumber;  // 4 bytes
        this.previousHash = previousHash;  // 32 bytes
        this.merkleRoot = new Merkle(data).computeRootHash();  // 32 bytes
        this.sigR = "";  // 32 bytes
        this.sigS = "";  // 32 bytes
        this.sigV = "";  // 1 byte
    }

    setSignature(signature) {
        var sig = stripHexPrefix(signature);
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
    return new Block(0, "0", []);
};

var blockchain = [getGenesisBlock()];

var getRawBlockHeader = (header, includingSig) => {
    var blkNumHexString = header.blockNumber.toString(16).padStart(8, "0");
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
    var transactions = tx.collectTransactions();
    var rawBlock = new Block(nextIndex, previousHash, transactions);
    var messageToSign = '0x' + getRawBlockHeader(rawBlock.blockHeader, false);
    try {
        var signature = await geth.signBlock(messageToSign);
        rawBlock.blockHeader.setSignature(signature);
        var hexPrefixHeader = '0x' + getRawBlockHeader(rawBlock.blockHeader, true);
        geth.submitBlockHeader(hexPrefixHeader);
        addBlock(rawBlock);
    } catch (e) {
        throw e;
    }
};

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        console.log('Block added: ' + JSON.stringify(newBlock));
        blockchain.push(newBlock);
    } else {
        throw "New block invalid";
    }
};

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.blockHeader.blockNumber + 1 !== newBlock.blockHeader.blockNumber) {
        console.log('invalid block number');
        return false;
    } else if (calculateHashForBlock(previousBlock) !== newBlock.blockHeader.previousHash) {
        console.log('invalid previous hash');
        return false;
    } else if (!tx.isValidBlockContent(newBlock)) {
        console.log('invalid block content');
        return false;
    }
    return true;
};

var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
    } else {
        throw "Received blockchain invalid";
    }
};

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
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
