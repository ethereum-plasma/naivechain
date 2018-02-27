'use strict';

var createKeccakHash = require('keccak');
var RLP = require('rlp');

var geth = require("./geth");
var utils = require("./utils");

class Transaction {
    constructor(blkNum1, txIndex1, oIndex1, sig1,
        blkNum2, txIndex2, oIndex2, sig2,
        newOwner1, denom1, newOwner2, denom2, fee, type) {
        // first input
        this.blkNum1 = blkNum1;
        this.txIndex1 = txIndex1;
        this.oIndex1 = oIndex1;
        this.sig1 = sig1;

        // second input
        this.blkNum2 = blkNum2;
        this.txIndex2 = txIndex2;
        this.oIndex2 = oIndex2;
        this.sig2 = sig2;

        // outputs
        this.newOwner1 = newOwner1;
        this.denom1 = denom1;
        this.newOwner2 = newOwner2;
        this.denom2 = denom2;

        this.fee = fee;
        this.type = type;
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
        if (this.blkNum2 !== 0) {
            this.sig2 = sig;
        }
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

var TxType = {
    NORMAL: 0,
    DEPOSIT: 1,
    WITHDRAW: 2,
    MERGE: 3
};

var txPool = [];
var utxo = [];

var createDepositTransactions = async (blockNumber, txs, deposits) => {
    for (var i = 0; i < deposits.length; i++) {
        var owner = deposits[i].from;
        var amount = parseInt(deposits[i].amount);
        var tx = new Transaction(0, 0, 0, 0, 0, 0, 0, 0,
            owner, amount, 0, 0, 0, TxType.DEPOSIT);
        await updateUTXO(blockNumber, tx, txs);
        await createMergeTransactions(blockNumber, txs, tx.newOwner1);
    }
};

var createWithdrawalTransactions = async (blockNumber, txs, withdrawals) => {
    for (var i = 0; i < withdrawals.length; i++) {
        var blkNum = parseInt(withdrawals[i].exitBlockNumber);
        var txIndex = parseInt(withdrawals[i].exitTxIndex);
        var oIndex = parseInt(withdrawals[i].exitOIndex);
        var tx = new Transaction(blkNum, txIndex, oIndex, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, TxType.WITHDRAW);
        await updateUTXO(blockNumber, tx, txs);
    }
};

var createMergeTransactions = async (blockNumber, txs, owner) => {
    var indexes = getTwoUTXOsByAddress(owner);
    while (indexes[0] !== -1 && indexes[1] !== -1) {
        var utxoA = utxo[indexes[0]];
        var utxoB = utxo[indexes[1]];
        var tx = new Transaction(
            utxoA.blkNum, utxoA.txIndex, utxoA.oIndex, 0,
            utxoB.blkNum, utxoB.txIndex, utxoB.oIndex, 0,
            owner, utxoA.denom + utxoB.denom, 0, 0, 0, TxType.MERGE);
        await updateUTXO(blockNumber, tx, txs);
        indexes = getTwoUTXOsByAddress(owner);
    }
};

var createTransaction = async (data) => {
    var index = getUTXOByAddress(data.from);
    if (index === -1) {
        throw 'No asset found';
    }
    var blkNum1 = utxo[index].blkNum;
    var txIndex1 = utxo[index].txIndex;
    var oIndex1 = utxo[index].oIndex;

    var newOwner1 = data.to;
    var denom1 = utils.etherToWei(data.amount);
    var fee = utils.etherToWei(0.01);  // hard-coded fee to 0.01
    if (utxo[index].denom < denom1 + fee) {
        throw 'Insufficient funds';
    }
    var remain = utxo[index].denom - denom1 - fee;
    var newOwner2 = (remain > 0) ? data.from : 0;
    var denom2 = remain;

    var tx = new Transaction(
        blkNum1, txIndex1, oIndex1, 0, 0, 0, 0, 0,
        newOwner1, denom1, newOwner2, denom2, fee, TxType.NORMAL);
    var signature = await geth.signTransaction(tx.toString(false), data.from);
    tx.setSignature(signature);

    txPool.push(tx);
    return tx;
}

var getUTXOByAddress = (owner, start = 0) => {
    for (var i = start; i < utxo.length; i++) {
        if (utxo[i].owner === owner) {
            return i;
        }
    }
    return -1;
};

var getTwoUTXOsByAddress = (owner) => {
    var index1 = getUTXOByAddress(owner);
    var index2 = index1 !== -1 ? getUTXOByAddress(owner, index1 + 1) : -1;
    return [index1, index2];
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
    if (tx.type !== TxType.NORMAL) {
        return true;
    }

    var denom = 0;
    if (tx.blkNum1 !== 0) {
        var message = tx.toString(false);
        var index = getUTXOByIndex(tx.blkNum1, tx.txIndex1, tx.oIndex1);
        if (index !== -1 &&
            await geth.isValidSignature(message, tx.sig1, utxo[index].owner)) {
            denom += utxo[index].denom;
        } else {
            return false;
        }
    }
    if (tx.blkNum2 !== 0) {
        var message = tx.toString(false);
        var index = getUTXOByIndex(tx.blkNum2, tx.txIndex2, tx.oIndex2);
        if (index !== -1 ||
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
        if (tx.blkNum1 !== 0) {
            var index = getUTXOByIndex(tx.blkNum1, tx.txIndex1, tx.oIndex1);
            utxo.splice(index, 1);
        }
        if (tx.blkNum2 !== 0) {
            var index = getUTXOByIndex(tx.blkNum2, tx.txIndex2, tx.oIndex2);
            utxo.splice(index, 1);
        }
        var txIndex = collectedTxs.length;
        if (tx.newOwner1 !== 0 && tx.denom1 !== 0) {
            utxo.push(new UTXO(blockNumber, txIndex, 0, tx.newOwner1, tx.denom1));
        }
        if (tx.newOwner2 !== 0 && tx.denom2 !== 0) {
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
        await createMergeTransactions(blockNumber, txs, tx.newOwner1);
        await createMergeTransactions(blockNumber, txs, tx.newOwner2);

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
