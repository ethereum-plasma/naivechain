'use strict';

var CryptoJS = require("crypto-js");

class Transaction {
    constructor(utxoBlkNum, utxoTxIdx, newOwner, sig) {
        this.utxoBlkNum = utxoBlkNum;  // 4 bytes
        this.utxoTxIdx = utxoTxIdx;  // 1 byte
        this.newOwner = newOwner;  // 20 bytes
        this.sig = sig;
    }

    get hash() {
        return CryptoJS.SHA256(this.toString()).toString();
    }

    toString() {
        var blkNumHex = ('0000000' + this.utxoBlkNum.toString(16)).slice(-8);
        var txIdxHex = ('0' + this.utxoTxIdx.toString(16)).slice(-2);
        return blkNumHex + txIdxHex + this.newOwner + this.sig;
    }

    isDeposit() {
        return this.utxoBlkNum == 0;
    }
}

class UTXO {
    constructor(blockNumber, txIndex, owner) {
        this.blockNumber = blockNumber;
        this.txIndex = txIndex;
        this.owner = owner;
    }
}

var txPool = [];
var utxo = [];

var createTransaction = (data) => {
    return new Transaction(data.utxoBlkNum, data.utxoTxIdx, data.newOwner, data.sig);
};

var addTransactionToPool = (tx) => {
    if (isValidTransaction(tx)) {
        console.log('Tx added: ' + JSON.stringify(tx));
        // Add the transaction to transaction pool.
        txPool.push(tx);
    } else {
        throw "New transaction invalid";
    }
};

var isValidTransaction = (tx) => {
    if (tx.isDeposit()) {
        return true;
    } else {
        for (var i = 0; i < utxo.length; i++) {
            if (utxo[i].blockNumber == tx.utxoBlkNum &&
                utxo[i].txIndex == tx.utxoTxIdx) {
                return true;
            }
        }
        return false;
    }
};

var isValidBlockContent = (newBlock) => {
    var utxoCopy = utxo.slice();
    var txPoolCopy = txPool.slice();

    var txs = newBlock.transactions;
    for (var i = 0; i < txs.length; i++) {
        var blkNum = txs[i].substring(0, 8);
        var txIdx = txs[i].substring(8, 10);
        var newOwner = txs[i].substring(10, 50);

        // Update UTXO set.
        if (blkNum == 0) {
            // deposit transaction
            utxoCopy.push(new UTXO(newBlock.blockHeader.blockNumber, i, newOwner));
        } else {
            // regular transaction
            var idx = 0;
            while (idx < utxoCopy.length) {
                if (utxoCopy[idx].blockNumber == blkNum &&
                    utxoCopy[idx].txIndex == txIdx) {
                    utxoCopy.splice(idx, 1);
                    utxoCopy.push(new UTXO(newBlock.blockHeader.blockNumber, i, newOwner));
                    break;
                }
                idx++;
            }
            if (idx == utxoCopy.length) {
                // Transaction doesn't match any utxo.
                return false;
            }
        }

        // Update transaction pool.
        for (var j = 0; j < txPoolCopy.length; j++) {
            if (txPoolCopy[j].toString() == txs[i]) {
                txPoolCopy.splice(j, 1);
                break;
            }
        }
    }

    // All transactions are valid. Update both UTXO and transaction poll.
    utxo = utxoCopy;
    txPool = txPoolCopy;
    return true;
};

var hasTransactionInPool = (tx) => {
    for (var i = 0; i < txPool.length; i++) {
        if (txPool[i].hash == tx.hash) {
            return true;
        }
    }
    return false;
};

var collectTransactions = () => {
    var utxoCopy = utxo.slice();

    var regularTxs = [];
    var depositTxs = [];
    for (var i = 0; i < txPool.length; i++) {
        if (txPool[i].isDeposit()) {
            depositTxs.push(txPool[i]);
        } else {
            if (regularTxs.length < 64) {
                for (var j = 0; j < utxoCopy.length; j++) {
                    if (utxoCopy[j].blockNumber == txPool[i].utxoBlkNum &&
                        utxoCopy[j].txIndex == txPool[i].utxoTxIdx) {
                        // Removing the utxo to avoid double spending.
                        utxoCopy.splice(j, 1);
                        regularTxs.push(txPool[i]);
                        break;
                    }
                }
            }
        }
    }

    var txs = [];
    regularTxs.forEach(rTx => txs.push(rTx.toString()));

    // Fill empty string if regular transactions are less than 64
    var len = regularTxs.length;
    for (var i = len; i < 64; i++) {
        txs.push("");
    }

    depositTxs.forEach(dTx => txs.push(dTx.toString()));
    return txs;
};

module.exports = {createTransaction, addTransactionToPool, hasTransactionInPool,
    collectTransactions, isValidBlockContent};
