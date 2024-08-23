const { ExpressPeerServer } = require("peer");
const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());

const server = app.listen(3001);

const peerServer = ExpressPeerServer(server, { path: "/peerjs" });

app.use("/peer-to-peer", peerServer);
