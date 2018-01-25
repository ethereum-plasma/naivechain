'use strict';

var express = require("express");
var bodyParser = require('body-parser');

var block = require("./block");
var tx = require("./transaction");
var geth = require("./geth");

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
    app.post('/transact', async (req, res) => {
        var rawTx = await tx.createTransaction(req.body);
        console.log('New transaction created: ' + JSON.stringify(rawTx));
        res.send(rawTx.toString(true));
    });

    // Deposit related
    app.post('/deposit', (req, res) => {
        geth.deposit(req.body.address, req.body.amount);
        res.send();
    });

    // Withdrawal related
    app.post('/withdraw/create', async (req, res) => {
        var p = block.getTransactionProofInBlock(req.body.blkNum,
            req.body.txIndex);
        var withdrawalId = await geth.startWithdrawal(req.body.blkNum,
            req.body.txIndex, req.body.oIndex, p.tx, p.proof, req.body.from);
        res.send(withdrawalId);
    });
    app.post('/withdraw/challenge', async (req, res) => {
        var p = block.getTransactionProofInBlock(req.body.blkNum,
            req.body.txIndex);
        await geth.challengeWithdrawal(req.body.withdrawalId, req.body.blkNum,
            req.body.txIndex, req.body.oIndex, p.tx, p.proof, req.body.address);
        res.send();
    });
    app.post('/withdraw/finalize', async (req, res) => {
        await geth.finalizeWithdrawal(req.body.from);
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
