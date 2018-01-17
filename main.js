'use strict';

var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var block = require("./block");
var tx = require("./transaction");
var geth = require("./geth");
var utils = require("./utils");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2,
    RESPONSE_TRANSACTION: 3
};

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
            broadcast(responseLatestMsg());
        } catch (e) {
            console.log(e);
        }
        res.send();
    });

    // Peer related
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
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
            broadcast(responseTxMsg(newTx));
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

var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('Listening websocket p2p port on: ' + p2p_port);
};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
            case MessageType.RESPONSE_TRANSACTION:
                handleTransactionResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = async (message) => {
    var receivedBlocks = message.data.map(m => block.constructBlockFromString(m))
                                     .sort((b1, b2) => (b1.blockHeader.blockNumber - b2.blockHeader.blockNumber));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = block.getLatestBlock();
    if (latestBlockReceived.blockHeader.blockNumber > latestBlockHeld.blockHeader.blockNumber) {
        console.log('Blockchain possibly behind. We got: ' +
        latestBlockHeld.blockHeader.blockNumber + ' Peer got: ' +
        latestBlockReceived.blockHeader.blockNumber);
        if (latestBlockHeld.hash === latestBlockReceived.blockHeader.previousHash) {
            try {
                block.addBlock(latestBlockReceived);
                console.log('We can append the received block to our chain.');
                broadcast(responseLatestMsg());
            } catch (e) {
                console.log(e);
            }
        } else if (receivedBlocks.length === 1) {
            console.log('We have to query the chain from our peer.');
            broadcast(queryAllMsg());
        } else {
            console.log('Received blockchain is longer than current blockchain.');
            try {
                await block.replaceChain(receivedBlocks);
                broadcast(responseLatestMsg());
            } catch (e) {
                console.log(e);
            }
        }
    } else {
        console.log('Received blockchain is not longer than received blockchain. Do nothing.');
    }
};

var handleTransactionResponse = async (message) => {
    try {
        var receivedTx = await tx.sendRawTransaction(message.data);
        broadcast(responseTxMsg(receivedTx));
    } catch (e) {
        console.log(e);
    }
};

var queryChainLengthMsg = () => ({
    'type': MessageType.QUERY_LATEST
});
var queryAllMsg = () => ({
    'type': MessageType.QUERY_ALL
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': [block.getLatestBlock().toString()]
});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': block.getBlocks().map(b => b.toString())
});
var responseTxMsg = (tx) => ({
    'type': MessageType.RESPONSE_TRANSACTION,
    'data': tx.toString()
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
