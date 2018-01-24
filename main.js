'use strict';

var express = require("express");
var bodyParser = require('body-parser');

var block = require("./block");
var tx = require("./transaction");
var geth = require("./geth");
var utils = require("./utils");

var http_port = process.env.HTTP_PORT || 3001;

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    // Block related
    app.get('/blocks', (req, res) => {
        res.send(JSON.stringify(block.getBlocks().map(b => b.printBlock())));
    });
    app.post('/mineBlock', async (req, res) => {
        try {
            await block.generateNextBlock();
        } catch (e) {
            console.log(e);
        }
        res.send();
    });

    // Transaction related
    app.post('/transaction/create', (req, res) => {
        var rawTx = tx.createRawTransaction(req.body);
        console.log('New transaction created: ' + JSON.stringify(rawTx));
        res.send(rawTx.toString());
    });
    app.post('/transaction/sign', async (req, res) => {
        try {
            var signedTx = await tx.signRawTransaction(req.body);
            console.log('Transaction signed: ' + JSON.stringify(signedTx));
            res.send(signedTx.toString());
        } catch (e) {
            console.log(e);
            res.send(e);
        }
    });
    app.post('/transaction/send', async (req, res) => {
        try {
            var newTx = await tx.sendRawTransaction(req.body.rawTx);
            console.log('New Transaction added: ' + JSON.stringify(newTx));
            res.send(newTx.toString());
        } catch (e) {
            console.log(e);
            res.send(e);
        }
    });

    // Deposit related
    app.post('/deposit', (req, res) => {
        geth.deposit(req.body.address);
        res.send();
    });

    // Withdrawal related
    app.post('/withdraw/create', async (req, res) => {
        var p = block.getTransactionProofInBlock(req.body.blockNumber,
            req.body.txIndex);
        var withdrawalId = await geth.startWithdrawal(req.body.blockNumber,
            req.body.txIndex, p.tx, p.proof, req.body.address);
        res.send(withdrawalId);
    });
    app.post('/withdraw/challenge', async (req, res) => {
        var p = block.getTransactionProofInBlock(req.body.blockNumber,
            req.body.txIndex);
        await geth.challengeWithdrawal(req.body.withdrawalId,
            req.body.blockNumber, req.body.txIndex, p.tx, p.proof, req.body.address);
        res.send();
    });
    app.post('/withdraw/finalize', async (req, res) => {
        await geth.finalizeWithdrawal(req.body.address);
        res.send();
    });

    // Debug function
    app.get('/utxo', (req, res) => {
        res.send(tx.getUTXO());
    });
    app.get('/pool', (req, res) => {
        res.send(tx.getPool());
    });

    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

initHttpServer();
