'use strict';

var Web3 = require("web3");

var contractAbi = require("./contract/abi.json");
var contractConfig = require("./contract/config");

var provider = new Web3.providers.HttpProvider('http://localhost:8545');
var web3 = new Web3(provider);

var plasmaContract = new web3.eth.Contract(contractAbi, contractConfig.plasmaContractAddress, {gas: 1000000});

var submitBlockHeader = async (header) => {
    var gasCost = await plasmaContract.methods.submitBlockHeader(header)
                     .estimateGas({from: contractConfig.plasmaOperatorAddress, gas: 1e8});
    var result = await plasmaContract.methods.submitBlockHeader(header)
                    .send({from: contractConfig.plasmaOperatorAddress, gas: gasCost});
    var ev = result.events.HeaderSubmittedEvent.returnValues;
    console.log(ev);
};

var signBlock = async (message) => {
    return await web3.eth.sign(message, contractConfig.plasmaOperatorAddress);
};

module.exports = {signBlock, submitBlockHeader};
