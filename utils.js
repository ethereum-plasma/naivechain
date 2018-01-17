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

}

module.exports = {addHexPrefix, removeHexPrefix, bufferToHex};
