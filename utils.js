'use strict';

var Web3 = require("web3");

var addHexPrefix = (msg) => {
    return '0x' + msg;
};

var removeHexPrefix = (msg) => {
    if (Web3.utils.isHexStrict(msg)) {
        return msg.slice(2);
    } else {
        return msg;
    }
};

var bufferToHex = (buf, withPrefix) => {
    if (withPrefix) {
        return addHexPrefix(buf.toString('hex'));
    } else {
        return buf.toString('hex');
    }
};

var weiToEther = (data) => {
    return data / 1000000000000000000;
};

var etherToWei = (data) => {
    return data * 1000000000000000000;
};

module.exports = {addHexPrefix, removeHexPrefix, bufferToHex, weiToEther,
    etherToWei};
