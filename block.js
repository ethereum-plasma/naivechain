'use strict';

var crypto = require('crypto');

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

    get hash() {
        return crypto.createHash('sha256').update(this.toString()).digest('hex');
    }

    toString() {
        var txsHex = "";
        this.transactions.forEach(tx => txsHex += tx);
        return this.blockHeader.toString(true) + txsHex;
    }

    printBlock() {
        return {
            'blockNumber': this.blockHeader.blockNumber,
            'previousHash': this.blockHeader.previousHash,
            'merkleRoot': this.blockHeader.merkleRoot,
            'signature': this.blockHeader.sigR + this.blockHeader.sigS + this.blockHeader.sigV,
            'transactions': this.transactions.filter(tx => tx.length > 0)
        };
    }
}

class BlockHeader {
    constructor(blockNumber, previousHash, data) {
        this.blockNumber = blockNumber;  // 4 bytes
        this.previousHash = previousHash;  // 32 bytes
        if (blockNumber == 0) {
            this.merkle = null;
            this.merkleRoot = "";
        } else {
            this.merkle = new Merkle(data);
            this.merkle.makeTree();
            this.merkleRoot = utils.bufferToHex(this.merkle.getRoot(), false);  // 32 bytes
        }
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

    toString(includingSig) {
        var blkNumHexString = this.blockNumber.toString(16).padStart(8, "0");
        var rawBlockHeader = blkNumHexString + this.previousHash + this.merkleRoot;
        if (includingSig) {
            rawBlockHeader += this.sigR + this.sigS + this.sigV;
        }
        return rawBlockHeader;
    }
}

var constructBlockFromString = (rawBlock) => {
    var blockNumber = parseInt(rawBlock.substring(0, 8));
    var previousHash = rawBlock.substring(8, 72);
    var sig = rawBlock.length == 72 ? "" : rawBlock.substring(136, 266);

    var data = [];
    var idx = 266;
    while (idx + 180 <= rawBlock.length) {
        data.push(rawBlock.substring(idx, idx + 180));
        idx += 180;
    }
    var len = data.length;
    for (var i = len; i < 256; i++) {
        data.push("");
    }

    var block = new Block(blockNumber, previousHash, data);
    if (sig != "") {
        block.blockHeader.setSignature(sig);
    }
    return block;
};

var getGenesisBlock = () => {
    // Create a hard coded genesis block.
    return new Block(0, '46182d20ccd7006058f3e801a1ff3de78b740b557bba686ced70f8e3d8a009a6', []);
};

var blockchain = [getGenesisBlock()];

var generateNextBlock = async () => {
    var previousBlock = getLatestBlock();
    var previousHash = previousBlock.hash;
    var nextIndex = previousBlock.blockHeader.blockNumber + 1;

    // Query contract past event for deposits and withdrawals.
    var deposits = await geth.getDeposits(nextIndex - 1);
    var withdrawals = await geth.getWithdrawals(nextIndex - 1);
    var transactions = await tx.collectTransactions(deposits, withdrawals);
    var rawBlock = new Block(nextIndex, previousHash, transactions);

    // Operator signs the block.
    var messageToSign = utils.addHexPrefix(rawBlock.blockHeader.toString(false));
    try {
        var signature = await geth.signBlock(messageToSign);
        rawBlock.blockHeader.setSignature(signature);

        // Submit the block header to plasma contract.
        var hexPrefixHeader = utils.addHexPrefix(rawBlock.blockHeader.toString(true));
        geth.submitBlockHeader(hexPrefixHeader);

        await addBlock(rawBlock);
    } catch (e) {
        throw e;
    }
};

var addBlock = async (newBlock) => {
    if (await isValidNewBlock(newBlock, getLatestBlock())) {
        console.log('New block added.');
        console.log(newBlock.printBlock());
        blockchain.push(newBlock);
    } else {
        throw "New block is invalid.";
    }
};

var isValidNewBlock = async (newBlock, previousBlock) => {
    if (previousBlock.blockHeader.blockNumber + 1 !== newBlock.blockHeader.blockNumber) {
        console.log('Block number is invalid.');
        return false;
    } else if (previousBlock.hash !== newBlock.blockHeader.previousHash) {
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
    if (blockchainToValidate[0].toString() !== blockchain[0].toString()) {
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

var getTransactionProofInBlock = (blockNumber, txIndex) => {
    var block = getBlock(blockNumber);
    var tx = utils.addHexPrefix(block.transactions[txIndex]);
    var proof = utils.bufferToHex(Buffer.concat(block.blockHeader.merkle.getProof(txIndex)), true);
    return {
        root: block.blockHeader.merkleRoot,
        tx: tx,
        proof: proof
    };
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var getBlocks = () => blockchain;
var getBlock = (index) => blockchain[index];

module.exports = {addBlock, replaceChain, getLatestBlock, getBlocks,
    generateNextBlock, getTransactionProofInBlock, constructBlockFromString};
