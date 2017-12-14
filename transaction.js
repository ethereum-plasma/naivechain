'use strict';

var CryptoJS = require("crypto-js");

class Transaction {
    constructor(utxoBlkNum, utxoTxIdx, newOwner, sig) {
        this.utxoBlkNum = utxoBlkNum;
        this.utxoTxIdx = utxoTxIdx;
        this.newOwner = newOwner;
        this.sig = sig;
    }

    get hash() {
        return CryptoJS.SHA256(this.utxoBlkNum + this.utxoTxIdx + this.newOwner + this.sig).toString();
    }

    isDeposit() {
        return this.utxoBlkNum == -1 && this.utxoTxIdx == -1;
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
        // add the transaction to tx pool
        txPool.push(tx);
    } else {
        throw "New transaction invalid";
    }
};

var isValidTransaction = (tx) => {
    if (tx.isDeposit()) {
        return true;
    } else {
        if (tx.utxoBlkNum > 0 && tx.utxoTxIdx >= 0 && tx.utxoTxIdx < 64) {
            for (var i = 0; i < utxo.length; i++) {
                if (utxo[i].utxoBlkNum == tx.utxoBlkNum && utxo[i].utxoTxIdx == tx.utxoTxIdx) {
                    return true;
                }
            }
        }
        return false;
    }
};

var hasTransactionInPool = (tx) => {
    for (var i = 0; i < txPool.length; i++) {
        if (txPool[i].hash == tx.hash) {
            return true;
        }
    }
    return false;
};

module.exports = {createTransaction, addTransactionToPool, hasTransactionInPool};
