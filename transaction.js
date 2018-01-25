'use strict';

var createKeccakHash = require('keccak');
var RLP = require('rlp');

var geth = require("./geth");
var utils = require("./utils");

class Transaction {
    constructor(blkNum1, txIndex1, oIndex1, sig1,
        blkNum2, txIndex2, oIndex2, sig2,
        newOwner1, denom1, newOwner2, denom2, fee) {
        // first input
        this.blkNum1 = blkNum1;  // 4 bytes
        this.txIndex1 = txIndex1;  // 1 byte
        this.oIndex1 = oIndex1;  // 1 byte
        this.sig1 = sig1;  // 65 bytes

        // second input
        this.blkNum2 = blkNum2;  // 4 bytes
        this.txIndex2 = txIndex2;  // 1 byte
        this.oIndex2 = oIndex2;  // 1 byte
        this.sig2 = sig2;  // 65 bytes

        // outputs
        this.newOwner1 = newOwner1;  // 20 bytes
        this.denom1 = denom1;  // 4 bytes
        this.newOwner2 = newOwner2;  // 20 bytes
        this.denom2 = denom2;  // 4 bytes

        this.fee = fee;
    }

    encode(includingSig) {
        var data = [
            this.blkNum1, this.txIndex1, this.oIndex1,
            this.blkNum2, this.txIndex2, this.oIndex2,
            this.newOwner1, this.denom1, this.newOwner2, this.denom2, this.fee
        ];
        if (includingSig) {
            data.push(this.sig1);
            data.push(this.sig2);
        }
        return RLP.encode(data);
    }

    toString(includingSig) {
        return utils.bufferToHex(this.encode(includingSig), false);
    }

    setSignature(sig) {
        this.sig1 = sig;
        if (this.blkNum2 != 0) {
            this.sig2 = sig;
        }
    }

    isDeposit() {
        return this.blkNum1 == 0 && this.blkNum2 == 0;
    }

    isWithdrawal() {
        return this.newOwner1 == 0 && this.newOwner2 == 0;
    }
}

class UTXO {
    constructor(blkNum, txIndex, oIndex, owner, denom) {
        this.blkNum = blkNum;
        this.txIndex = txIndex;
        this.oIndex = oIndex;
        this.owner = owner;
        this.denom = denom;
    }
}

var txPool = [];
var utxo = [];

var createDepositTransactions = async (blockNumber, txs, deposits) => {
    for (var i = 0; i < deposits.length; i++) {
        var owner = deposits[i].from;
        var amount = parseInt(deposits[i].amount);
        var tx = new Transaction(0, 0, 0, 0, 0, 0, 0, 0, owner, amount, 0, 0, 0);
        await updateUTXO(blockNumber, tx, txs);
    }
};

var createWithdrawalTransactions = async (blockNumber, txs, withdrawals) => {
    for (var i = 0; i < withdrawals.length; i++) {
        var blkNum = parseInt(withdrawals[i].blockNumber);
        var txIndex = parseInt(withdrawals[i].txIndex);
        var oIndex = parseInt(withdrawals[i].outputIndex);
        var tx = new Transaction(blkNum, txIndex, oIndex, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        await updateUTXO(blockNumber, tx, txs);
    }
};

var createTransaction = async (data) => {
    // TODO: The transaction creation process should be re-designed.
    // In the future, user should only have one UTXO and this function should
    // query for him by his address.
    var blkNum1 = data.blkNum1;
    var txIndex1 = data.txIndex1;
    var oIndex1 = data.oIndex1;
    var blkNum2 = data.hasOwnProperty('blkNum2') ? data.blkNum2 : 0;
    var txIndex2 = data.hasOwnProperty('txIndex2') ? data.txIndex2 : 0;
    var oIndex2 = data.hasOwnProperty('oIndex2') ? data.oIndex2 : 0;

    var newOwner1 = data.newOwner;
    var denom1 = utils.etherToWei(data.amount);
    var fee = utils.etherToWei(0.01);
    var denom = getUTXODenom(blkNum1, txIndex1, oIndex1);
    if (blkNum2 != 0) {
        denom += getUTXODenom(blkNum2, txIndex2, oIndex2);
    }
    var remain = denom - denom1 - fee;
    var newOwner2 = (remain > 0) ? data.from : 0;
    var denom2 = remain;

    var tx = new Transaction(
        blkNum1, txIndex1, oIndex1, 0,
        blkNum2, txIndex2, oIndex2, 0,
        newOwner1, denom1, newOwner2, denom2, fee);
    var signature = await geth.signTransaction(tx.toString(false), data.from);
    tx.setSignature(signature);

    txPool.push(tx);
    return tx;
}

var getUTXODenom = (blkNum, txIndex, oIndex) => {
    for (var i = 0; i < utxo.length; i++) {
        if (utxo[i].blkNum == blkNum &&
            utxo[i].txIndex == txIndex &&
            utxo[i].oIndex == oIndex) {
            return utxo[i].denom;
        }
    }
    return 0;
};

var getUTXOByIndex = (blkNum, txIndex, oIndex) => {
    for (var i = 0; i < utxo.length; i++) {
        if (utxo[i].blkNum === blkNum &&
            utxo[i].txIndex === txIndex &&
            utxo[i].oIndex === oIndex) {
            return i;
        }
    }
    return -1;
};

var isValidTransaction = async (tx) => {
    if (tx.isDeposit() || tx.isWithdrawal()) {
        return true;
    }

    var denom = 0;
    if (tx.blkNum1 != 0) {
        var message = tx.toString(false);
        var index = getUTXOByIndex(tx.blkNum1, tx.txIndex1, tx.oIndex1);
        if (index != -1 &&
            await geth.isValidSignature(message, tx.sig1, utxo[index].owner)) {
            denom += utxo[index].denom;
        } else {
            return false;
        }
    }
    if (tx.blkNum2 != 0) {
        var message = tx.toString(false);
        var index = getUTXOByIndex(tx.blkNum2, tx.txIndex2, tx.oIndex2);
        if (index != -1 ||
            await geth.isValidSignature(message, tx.sig2, utxo[index].owner)) {
            denom += utxo[index].denom;
        } else {
            return false;
        }
    }
    return denom === tx.denom1 + tx.denom2 + tx.fee;
}

var updateUTXO = async (blockNumber, tx, collectedTxs) => {
    if (await isValidTransaction(tx)) {
        if (tx.blkNum1 != 0) {
            var index = getUTXOByIndex(tx.blkNum1, tx.txIndex1, tx.oIndex1);
            utxo.splice(index, 1);
        }
        if (tx.blkNum2 != 0) {
            var index = getUTXOByIndex(tx.blkNum2, tx.txIndex2, tx.oIndex2);
            utxo.splice(index, 1);
        }
        var txIndex = collectedTxs.length;
        if (tx.newOwner1 != 0 && tx.denom1 != 0) {
            utxo.push(new UTXO(blockNumber, txIndex, 0, tx.newOwner1, tx.denom1));
        }
        if (tx.newOwner2 != 0 && tx.denom2 != 0) {
            utxo.push(new UTXO(blockNumber, txIndex, 1, tx.newOwner2, tx.denom2));
        }
        collectedTxs.push(tx.toString(true));
    }
};

var collectTransactions = async (blockNumber, deposits, withdrawals) => {
    var utxoCopy = utxo.slice();
    var txs = [];

    if (deposits.length > 0) {
        console.log('Deposit transactions found.');
        console.log(deposits);
        await createDepositTransactions(blockNumber, txs, deposits);
    }

    if (withdrawals.length > 0) {
        console.log('Withdrawals detected.');
        console.log(withdrawals);
        await createWithdrawalTransactions(blockNumber, txs, withdrawals);
    }

    for (var i = 0; i < txPool.length; i++) {
        var tx = txPool[i];
        await updateUTXO(blockNumber, tx, txs);

        // Limit transactions per block to power of 2 on purpose for the
        // convenience of building Merkle tree.
        if (txs.length >= 256) {
            break;
        }
    }

    // Fill empty string if transactions are less than 256.
    var len = txs.length;
    for (var i = len; i < 256; i++) {
        txs.push("");
    }

    return txs;
};

var getUTXO = () => {
    return utxo;
};

var getPool = () => {
    return txPool;
};

module.exports = {createTransaction, collectTransactions, getUTXO, getPool};
