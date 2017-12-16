'use strict';

var CryptoJS = require("crypto-js");

var tx = require("./transaction");
var Merkle = require("./merkle");

class Block {
    constructor(blockNumber, previousHash, sig, transactions) {
        var data = [];
        transactions.forEach(tx => data.push(tx));

        this.blockHeader = new BlockHeader(blockNumber, previousHash, data, sig);
        this.transactions = transactions;
    }
}

class BlockHeader {
    constructor(blockNumber, previousHash, data, sig) {
        this.blockNumber = blockNumber;
        this.previousHash = previousHash;
        this.merkleRoot = new Merkle(data).computeRootHash();
        this.sig = sig;
    }
}

var getGenesisBlock = () => {
    return new Block(0, "0", "sig1", []);
};

var calculateHashForBlock = (block) => {
    var blkHeader = block.blockHeader;
    var data = blkHeader.blockNumber + blkHeader.previousHash + blkHeader.merkleRoot + blkHeader.sig;
    block.transactions.forEach(tx => data += tx);
    return CryptoJS.SHA256(data).toString();
};

var blockchain = [getGenesisBlock()];

var generateNextBlock = (sig) => {
    var previousBlock = getLatestBlock();
    var previousHash = calculateHashForBlock(previousBlock);
    var nextIndex = previousBlock.blockHeader.blockNumber + 1;
    var transactions = tx.collectTransactions();
    return new Block(nextIndex, previousHash, sig, transactions);
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
