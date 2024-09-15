const { ExpressPeerServer } = require("peer");
var fs = require("fs");
const http = require("http");
var https = require("https");
const express = require("express");
const cors = require("cors");

// var privateKey = fs.readFileSync("selfsigned.key", "utf8");
// var certificate = fs.readFileSync("selfsigned.crt", "utf8");

// var credentials = { key: privateKey, cert: certificate };

const app = express();
app.use(cors());

var httpServer = http.createServer(app);
var httpsServer = https.createServer(app);

const peerServer = ExpressPeerServer(httpServer, { path: "/peerjs" });

app.use("/peer-to-peer", peerServer);

// httpServer.listen(80, () => {
//   console.log("HTTP Server running on port 80");
// });

httpServer.listen(9000, () => {
  console.log("HTTPS Server running on port 9000");
});
