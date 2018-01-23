'use strict';

var createKeccakHash = require('keccak');

class Merkle {
    constructor(data) {
        this.isReady = false;
        this.leaves = data.map(str => this._hash(this._getBuffer(str)));
        this.levels = [];
    }

    makeTree() {
        this.isReady = false;
        this.levels.unshift(this.leaves);
        while (this.levels[0].length > 1) {
            this.levels.unshift(this._getNextLevel());
        }
        this.isReady = true;
    }

    getRoot() {
        return this.isReady ? this.levels[0][0] : null;
    }

    getProof(index) {
        var proof = [];
        for (var i = this.levels.length - 1; i > 0; i--) {
            var isRightNode = index % 2;
            var siblingIndex = isRightNode ? (index - 1) : (index + 1);
            proof.push(new Buffer(isRightNode ? [0x00] : [0x01]));
            proof.push(this.levels[i][siblingIndex]);
            index = Math.floor(index / 2);
        }
        return proof;
    }

    _hash(value) {
        return createKeccakHash('keccak256').update(value).digest();
    }

    _getBuffer(value) {
        return new Buffer(value, 'hex');
    }

    _getNextLevel() {
        var nodes = [];
        for (var i = 0; i < this.levels[0].length - 1; i += 2) {
            var left = this.levels[0][i];
            var right = this.levels[0][i + 1];
            nodes.push(this._hash(Buffer.concat([left, right])));
        }
        return nodes;
    }
}

module.exports = Merkle;
