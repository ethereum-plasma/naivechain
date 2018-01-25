'use strict';

var crypto = require('crypto');

var tx = require("./transaction");
var geth = require("./geth");
var utils = require("./utils");

var Merkle = require("./merkle");

class Block {
    constructor(blockNumber, previousHash, transactions) {
        var data = [];
        transactions.forEach(tx => data.push(tx.toString(true)));

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

var getGenesisBlock = () => {
    // Create a hard coded genesis block.
    return new Block(0, '46182d20ccd7006058f3e801a1ff3de78b740b557bba686ced70f8e3d8a009a6', []);
};

var blockchain = [getGenesisBlock()];

var generateNextBlock = async () => {
    var previousBlock = getLatestBlock();
    var previousHash = previousBlock.hash;
    var nextIndex = previousBlock.blockHeader.blockNumber + 1;

    // Query contract past event for deposits / withdrawals and collect transactions.
    var deposits = await geth.getDeposits(nextIndex - 1);
    var withdrawals = await geth.getWithdrawals(nextIndex - 1);
    var transactions = await tx.collectTransactions(nextIndex, deposits, withdrawals);
    var newBlock = new Block(nextIndex, previousHash, transactions);

    // Operator signs the new block.
    var messageToSign = utils.addHexPrefix(newBlock.blockHeader.toString(false));
    var signature = await geth.signBlock(messageToSign);
    newBlock.blockHeader.setSignature(signature);

    // Add the new block to blockchain.
    console.log('New block added.');
    console.log(newBlock.printBlock());
    blockchain.push(newBlock);

    // Submit the block header to plasma contract.
    var hexPrefixHeader = utils.addHexPrefix(newBlock.blockHeader.toString(true));
    geth.submitBlockHeader(hexPrefixHeader);
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

module.exports = {getLatestBlock, getBlocks, generateNextBlock,
    getTransactionProofInBlock};
