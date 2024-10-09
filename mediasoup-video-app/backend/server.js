const fs = require("fs");
const http = require("http");
const config = require("./config");
const express = require("express");
const socketIO = require("socket.io");
const mediasoup = require("mediasoup");

// Global variables
let worker;
let webServer;
let expressApp;
let socketServer;
let producer = {};
let mediasoupRouter;
let globalConsumers = {};
let producerTransport = {};
let consumerTransport = {};

(async () => {
  try {
    await runExpressApp();
    await runWebServer();
    await runSocketServer();
    await runMediasoupWorker();
  } catch (err) {
    console.error(err);
  }
})();

async function runExpressApp() {
  expressApp = express();
  expressApp.use(express.json());
  expressApp.use(express.static(__dirname));

  expressApp.get("/", (req, res) => {
    res.json({ message: "Hello from mediasoup server" });
  });

  expressApp.use((error, req, res, next) => {
    if (error) {
      console.warn("Express app error,", error.message);

      error.status = error.status || (error.name === "TypeError" ? 400 : 500);

      res.statusMessage = error.message;
      res.status(error.status).send(String(error));
    } else {
      next();
    }
  });
}

async function runWebServer() {
  const { sslKey, sslCrt } = config;
  if (!fs.existsSync(sslKey) || !fs.existsSync(sslCrt)) {
    console.error("SSL files are not found. check your config.js file");
    process.exit(0);
  }
  const tls = {
    cert: fs.readFileSync(sslCrt),
    key: fs.readFileSync(sslKey),
  };
  webServer = http.createServer(expressApp);
  webServer.on("error", (err) => {
    console.error("starting web server failed:", err.message);
  });

  await new Promise((resolve) => {
    const { listenIp, listenPort } = config;
    webServer.listen(listenPort, listenIp, () => {
      const listenIps = config.mediasoup.webRtcTransport.listenIps[0];
      const ip = listenIps.announcedIp || listenIps.ip;
      console.log("server is running");
      resolve();
    });
  });
}

async function runSocketServer() {
  socketServer = socketIO(webServer, {
    serveClient: false,
    path: "/server",
    log: false,
  });

  socketServer.on("connection", (socket) => {
    console.log("client connected", socket.id);

    // inform the client about existence of producer
    if (producer) {
      socket.emit("newProducer");
    }

    socket.on("disconnect", () => {
      console.log("client disconnected", socket.id);
      delete producer[socket.id];
      delete globalConsumers[socket.id];
    });

    socket.on("connect_error", (err) => {
      console.error("client connection error", err);
    });

    socket.on("getRouterRtpCapabilities", (data, callback) => {
      callback(mediasoupRouter.rtpCapabilities);
    });

    socket.on("createProducerTransport", async (data, callback) => {
      try {
        const { transport, params } = await createWebRtcTransport();
        producerTransport[socket.id] = transport;
        callback(params);
      } catch (err) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on("createConsumerTransport", async (data, callback) => {
      try {
        const { transport, params } = await createWebRtcTransport();
        consumerTransport[socket.id] = transport;
        callback(params);
      } catch (err) {
        console.error(err);
        callback({ error: err.message });
      }
    });

    socket.on("connectProducerTransport", async (data, callback) => {
      await producerTransport[socket.id].connect({
        dtlsParameters: data.dtlsParameters,
      });
      callback();
    });

    socket.on("connectConsumerTransport", async (data, callback) => {
      await consumerTransport[socket.id].connect({
        dtlsParameters: data.dtlsParameters,
      });
      callback();
    });

    socket.on("produce", async (data, callback) => {
      const { kind, rtpParameters } = data;
      const newProducer = await producerTransport[socket.id].produce({
        kind,
        rtpParameters,
      });
      producer[socket.id] = newProducer;
      callback({ id: socket.id });

      // inform clients about new producer
      socket.broadcast.emit("newProducer");
    });

    socket.on("consume", async (data, callback) => {
      let consumers = {};
      try {
        // Iterate over all producers and create consumers for them
        for (const producerId of Object.keys(producer)) {
          // Skip consuming your own stream
          if (producerId === data.ownProducerId) continue;

          const consumerData = await createConsumer(
            producer[producerId],
            data.rtpCapabilities,
            socket.id
          );

          if (consumerData) {
            consumers[producerId] = consumerData; // Collect consumer data
          }
        }

        // Send all the consumers back
        callback(consumers);
      } catch (err) {
        console.error("Error in consume:", err);
        callback({ error: err.message });
      }
    });

    socket.on("resume", async (data, callback) => {
      try {
        // Iterate over all the consumers for each socket
        Object.keys(globalConsumers).forEach(async (socketId) => {
          const socketConsumers = globalConsumers[socketId];
          Object.keys(socketConsumers).forEach(async (producerId) => {
            const consumer = socketConsumers[producerId];
            if (consumer && typeof consumer.resume === "function") {
              await consumer.resume();
            }
          });
        });
        callback();
      } catch (error) {
        console.error("Error resuming consumers:", error);
        callback({ error: error.message });
      }
    });
  });
}

async function runMediasoupWorker() {
  worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  });

  worker.on("died", () => {
    console.error(
      "mediasoup worker died, exiting in 2 seconds... [pid:%d]",
      worker.pid
    );
    setTimeout(() => process.exit(1), 2000);
  });

  const mediaCodecs = config.mediasoup.router.mediaCodecs;
  mediasoupRouter = await worker.createRouter({ mediaCodecs });
}

async function createWebRtcTransport() {
  const { maxIncomingBitrate, initialAvailableOutgoingBitrate } =
    config.mediasoup.webRtcTransport;

  const transport = await mediasoupRouter.createWebRtcTransport({
    listenIps: config.mediasoup.webRtcTransport.listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate,
  });
  if (maxIncomingBitrate) {
    try {
      await transport.setMaxIncomingBitrate(maxIncomingBitrate);
    } catch (error) {}
  }
  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
}

async function createConsumer(producer, rtpCapabilities, socketId) {
  if (
    !mediasoupRouter.canConsume({
      producerId: producer.id,
      rtpCapabilities,
    })
  ) {
    console.error("Cannot consume producer:", producer.id);
    return null; // Return null if consumption is not possible
  }

  try {
    // Create the consumer for the given producer
    const consumer = await consumerTransport[socketId].consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: producer.kind === "video", // Start paused if it's a video
    });

    // If the socket has no consumers yet, initialize the object
    if (!globalConsumers[socketId]) {
      globalConsumers[socketId] = {};
    }

    // Store this consumer for the current producerId under the socketId
    globalConsumers[socketId][producer.id] = consumer;

    // Return consumer data
    return {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  } catch (error) {
    console.error("Failed to consume producer:", producer.id, error);
    return null;
  }
}
