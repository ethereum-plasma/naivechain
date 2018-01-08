'use strict';

var Web3 = require("web3");

var utils = require("./utils");
var contractAbi = require("./contract/abi.json");
var contractConfig = require("./contract/config");

var provider = new Web3.providers.HttpProvider('http://localhost:8545');
var web3 = new Web3(provider);

var plasmaContract = new web3.eth.Contract(contractAbi, contractConfig.plasmaContractAddress, {gas: 1000000});

var submitBlockHeader = async (header) => {
    var gasCost = await plasmaContract.methods.submitBlockHeader(header).estimateGas({
        from: contractConfig.plasmaOperatorAddress, gas: 1e8
    });
    var result = await plasmaContract.methods.submitBlockHeader(header).send({
        from: contractConfig.plasmaOperatorAddress, gas: gasCost
    });
    var ev = result.events.HeaderSubmittedEvent.returnValues;
    console.log(ev);
};

var signBlock = async (message) => {
    return await web3.eth.sign(message, contractConfig.plasmaOperatorAddress);
};

var signDepositTransaction = async (message) => {
    return await web3.eth.sign(message, contractConfig.plasmaOperatorAddress);
};

var signRegularTransaction = async (message, address) => {
    return await web3.eth.sign(message, address);
};

var isValidSignature = async (message, signature, address) => {
    var hash = await web3.eth.accounts.hashMessage(message);
    var signer =  await web3.eth.accounts.recover(hash, signature);
    return address.toLowerCase() == utils.removeHexPrefix(signer).toLowerCase();
};

var deposit = async (address) => {
    var gasCost = await plasmaContract.methods.deposit().estimateGas({
        from: address, value: 1000000000000000000, gas: 1e8
    });
    var result = await plasmaContract.methods.deposit().send({
        from: address, value: 1000000000000000000, gas: gasCost
    });
    console.log(result);
};

var getDeposits = async (blockNumber) => {
    var depositEvents =  await plasmaContract.getPastEvents('DepositEvent', {
        filter: {n: blockNumber.toString()},
        fromBlock: 0,
        toBlock: 'latest'
    });

    var deposits = [];
    depositEvents.forEach(ev => deposits.push(ev.returnValues));
    deposits.sort((d1, d2) => (d1.ctr - d2.ctr));
    return deposits;
}

module.exports = {signBlock, signDepositTransaction, signRegularTransaction,
    submitBlockHeader, deposit, getDeposits, isValidSignature};
