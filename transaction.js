'use strict';

var crypto = require('crypto');

var geth = require("./geth");
var utils = require("./utils");

class Transaction {
    constructor(utxoBlkNum, utxoTxIdx, newOwner, sig) {
        this.utxoBlkNum = utxoBlkNum;  // 4 bytes
        this.utxoTxIdx = utxoTxIdx;  // 1 byte
        this.newOwner = newOwner;  // 20 bytes
        this.sig = sig;  // 65 bytes
    }

    get hash() {
        return crypto.createHash('sha256').update(this.toString()).digest('hex');
    }

    toString() {
        var blkNumHex = this.utxoBlkNum.toString(16).padStart(8, "0");
        var txIdxHex = this.utxoTxIdx.toString(16).padStart(2, "0");
        return blkNumHex + txIdxHex + this.newOwner + this.sig;
    }

    isDeposit() {
        return this.utxoBlkNum == 0;
    }

    setSignature(signature) {
        this.sig = signature;
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

var createRawTransaction = (data) => {
    var sig = data.hasOwnProperty('sig') ? utils.removeHexPrefix(data.sig) : "";
    var owner = utils.removeHexPrefix(data.newOwner);
    return new Transaction(data.utxoBlkNum, data.utxoTxIdx, owner, sig);
};

var constructTransactionFromString = (rawTx) => {
    if (rawTx.length == 50 || rawTx.length == 180) {
        var utxoBlkNum = rawTx.substring(0, 8);
        var utxoTxIdx = rawTx.substring(8, 10);
        var newOwner = rawTx.substring(10, 50);
        var sig = rawTx.length == 180 ? rawTx.substring(50, 180) : "";
        return new Transaction(utxoBlkNum, utxoTxIdx, newOwner, sig);
    } else {
        throw 'Given transaction string is invalid.';
    }
};

var signRawTransaction = async (data) => {
    try {
        var tx = constructTransactionFromString(data.rawTx);
        var signature = await geth.signRegularTransaction(tx.toString(), data.address);
        tx.setSignature(utils.removeHexPrefix(signature));
        return tx;
    } catch (e) {
        throw e;
    }
};

var sendRawTransaction = async (rawTx) => {
    try {
        var tx = constructTransactionFromString(rawTx);
        if (!hasTransactionInPool(tx)) {
            try {
                await addTransactionToPool(tx);
                return tx;
            } catch (e) {
                throw e;
            }
        } else {
            throw 'Transaction is already in pool. Do nothing.';
        }
    } catch (e) {
        throw e;
    }
};

var addTransactionToPool = async (tx) => {
    if (await isValidTransaction(tx)) {
        // Add the transaction to transaction pool.
        txPool.push(tx);
    } else {
        throw 'New transaction is invalid.';
    }
};

var getTransactionIdxInUTXO = async (tx, utxo) => {
    var message = tx.toString().substring(0, 50);
    var sigWithPrefix = utils.addHexPrefix(tx.sig);
    for (var i = 0; i < utxo.length; i++) {
        if (utxo[i].blockNumber == tx.utxoBlkNum &&
            utxo[i].txIndex == tx.utxoTxIdx &&
            await geth.isValidSignature(message, sigWithPrefix, utxo[i].owner)) {
            return i;
        }
    }
    return -1;
};

var isValidTransaction = async (tx) => {
    if (tx.isDeposit()) {
        // `isValidTransaction` is used before adding a transaction to pool.
        // Deposit transaction shouldn't be added to pool.
        return false;
    } else {
        return await getTransactionIdxInUTXO(tx, utxo) != -1;
    }
};

var isValidBlockContent = async (newBlock) => {
    var utxoCopy = utxo.slice();
    var txPoolCopy = txPool.slice();

    var blockNumberHex = newBlock.blockHeader.blockNumber.toString(16).padStart(8, "0");
    var txs = newBlock.transactions;
    for (var i = 0; i < txs.length; i++) {
        // Ignore the empty transaction.
        if (txs[i] == "") {
            continue;
        }

        var indexHex = i.toString(16).padStart(2, "0");
        try {
            var tx = constructTransactionFromString(txs[i]);
        } catch (e) {
            return false;
        }

        // Update UTXO set.
        if (tx.isDeposit()) {
            // deposit transaction
            utxoCopy.push(new UTXO(blockNumberHex, indexHex, tx.newOwner));
        } else {
            // regular transaction
            var idx = await getTransactionIdxInUTXO(tx, utxoCopy);
            if (idx == -1) {
                // Transaction doesn't match any utxo.
                return false;
            }
            utxoCopy.splice(idx, 1);
            utxoCopy.push(new UTXO(blockNumberHex, indexHex, tx.newOwner));
        }

        // Update transaction pool.
        for (var j = 0; j < txPoolCopy.length; j++) {
            if (txPoolCopy[j].toString() == txs[i]) {
                txPoolCopy.splice(j, 1);
                break;
            }
        }
    }

    // All transactions are valid. Update both UTXO and transaction pool.
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

var createDepositTransactions = async (deposits) => {
    var depositTxs = [];
    for (var i = 0; i < deposits.length; i++) {
        // Set both `utxoBlkNum` and `utxoTxIdx` to 0 indicating that it is a deposit transaction.
        var tx = new Transaction(0, 0, utils.removeHexPrefix(deposits[i].from), "");
        var signature = await geth.signDepositTransaction(tx.toString());
        tx.setSignature(utils.removeHexPrefix(signature));
        depositTxs.push(tx.toString());
    }
    return depositTxs;
};

var removeWithdrawalUTXOs = (withdrawals) => {
    for (var i = 0; i < withdrawals.length; i++) {
        for (var j = 0; j < utxo.length; j++) {
            if (utxo[j].blockNumber == parseInt(withdrawals[i].blockNumber) &&
                utxo[j].txIndex == parseInt(withdrawals[i].txIndex)) {
                utxo.splice(j, 1);
            }
        }
    }
};

var collectTransactions = async (deposits, withdrawals) => {
    var utxoCopy = utxo.slice();
    var txs = [];

    if (deposits.length > 0) {
        console.log('Deposit transactions found.');
        console.log(deposits);
        txs = await createDepositTransactions(deposits);
    }

    if (withdrawals.length > 0) {
        console.log('Withdrawals detected.');
        console.log(withdrawals);
        removeWithdrawalUTXOs(withdrawals);
    }

    for (var i = 0; i < txPool.length; i++) {
        var tx = txPool[i];
        var idx = await getTransactionIdxInUTXO(tx, utxoCopy);
        if (idx != -1) {
            // Remove the utxo to avoid double spending.
            utxoCopy.splice(idx, 1);
            txs.push(tx.toString());
        }

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

module.exports = {createRawTransaction, signRawTransaction, sendRawTransaction,
    collectTransactions, isValidBlockContent, getUTXO, getPool};
