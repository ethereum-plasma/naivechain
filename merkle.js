'use strict';

var CryptoJS = require("crypto-js");

class Merkle {
    constructor(data) {
        this.data = data.map(str => CryptoJS.SHA256(str).toString());
    }

    computeRootHash() {
        while (this.data.length > 1) {
            var temp = [];
            var isOdd = this.data.length % 2 == 1;
            for (var i = 0; i < this.data.length - 1; i += 2) {
                var left = this.data[i];
                var right = this.data[i + 1];
                temp.push(CryptoJS.SHA256(left + right).toString());
            }
            if (isOdd) {
                temp.push(this.data[this.data.length - 1]);
            }
            this.data = temp;
        }
        return this.data[0];
    }
}

module.exports = Merkle;
