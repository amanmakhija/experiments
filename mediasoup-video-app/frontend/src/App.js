import React, { useEffect, useRef, useState } from "react";
import { io as socketClient } from "socket.io-client";
import { Device } from "mediasoup-client";
import axios from "axios";
const socketPromise = require("./lib/socket.io-promise").promise;

const SERVER_URL = `https://${window.location.hostname}:4000`;

const originalLog = console.log;
console.log = (...message) => {
  // Call the original console.log with the message
  originalLog(...message);

  // Send the log data to the server using axios
  axios
    .post("/logger", {
      message: message
        .map((m) => (typeof m === "object" ? JSON.stringify(m) : m.toString()))
        .join(", "),
    })
    .then(() => {
      originalLog("Log sent to the server");
    })
    .catch((error) => {
      originalLog("Error sending log to the server:", error);
    });
};

const App = () => {
  const [connectButton, setConnectButton] = useState({
    disabled: false,
    text: "",
  });
  const [webcamButton, setWebcamButton] = useState({
    disabled: true,
    text: "",
  });
  const [subscribeButton, setSubscribeButton] = useState({
    disabled: true,
    text: "",
  });
  const [device, setDevice] = useState(null);
  const [socket, setSocket] = useState(null);
  const [userId, setUserId] = useState(null);
  // const hasSubscribed = useRef(false);

  // Initialize connection when the component is mounted
  useEffect(() => {
    if (!socket) {
      setUserId(() => {
        // requesting user id from user
        const id = prompt("Enter your user id");
        connect(id);
        return id;
      });
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  async function connect(id) {
    setConnectButton({ disabled: true, text: "Connecting..." });

    const opts = {
      path: "/server",
      transports: ["websocket"],
    };
    let socketServer = socket;

    if (!socket) {
      socketServer = socketClient(SERVER_URL, opts);
      socketServer.request = socketPromise(socketServer);
      setSocket(socketServer);
    }

    socketServer.on("connect", async () => {
      setConnectButton({ disabled: true, text: "Connected" });
      setWebcamButton({ disabled: false, text: "" });

      const data = await socketServer.request("getRouterRtpCapabilities");

      // Ensure device is loaded after receiving capabilities
      if (!device) {
        await loadDevice(data);
      }

      // Register the user id
      socketServer.emit("registeruser", { userId: id });
    });

    socketServer.on("disconnect", { userId }, () => {
      setConnectButton({ disabled: false, text: "Disconnected" });
    });

    socketServer.on("connect_error", (error) => {
      console.log(
        "could not connect to %s%s (%s)",
        SERVER_URL,
        opts.path,
        error.message
      );
      setConnectButton({ disabled: false, text: "Connection failed" });
    });

    socketServer.on("newProducer", async (userId) => {
      console.log("new producer", userId);
      // if (hasSubscribed.current) {
      //   console.log("subscribing to new producer", userId);
      //   await subscribe(null, userId);
      // }
    });

    socketServer.on("producerDisconnected", (userId) => {
      console.log("producer disconnected", userId);
      const video = document.getElementById(userId);
      if (video) {
        video.remove();
      }
    });
  }

  async function loadDevice(routerRtpCapabilities) {
    try {
      if (!device) {
        const newDevice = new Device();
        await newDevice.load({ routerRtpCapabilities });
        setDevice(newDevice); // Set the device after loading
      }
    } catch (error) {
      if (error.name === "UnsupportedError") {
        console.log("browser not supported");
      } else console.log("Error loading device:", error);
    }
  }

  async function publish(e) {
    e.preventDefault();
    if (!device) {
      console.log("Device not loaded yet.");
      return;
    }

    const data = await socket.request("createProducerTransport", {
      forceTcp: false,
      rtpCapabilities: device.rtpCapabilities,
      userId,
    });

    if (data.error) {
      console.log(data.error);
      return;
    }

    const transport = device.createSendTransport(data);
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      socket
        .request("connectProducerTransport", { dtlsParameters, userId })
        .then(callback)
        .catch(errback);
    });

    transport.on(
      "produce",
      async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { id } = await socket.request("produce", {
            transportId: transport.id,
            kind,
            rtpParameters,
            userId,
          });
          callback({ id });
        } catch (err) {
          errback(err);
        }
      }
    );

    transport.on("connectionstatechange", (state) => {
      switch (state) {
        case "connecting":
          setWebcamButton({ disabled: true, text: "publishing..." });
          break;

        case "connected":
          document.querySelector("#local_video").srcObject = stream;
          setWebcamButton({ disabled: true, text: "published" });
          setSubscribeButton({ disabled: false, text: "" });
          break;

        case "failed":
          transport.close();
          setWebcamButton({ disabled: false, text: "failed" });
          break;

        default:
          break;
      }
    });

    let stream;
    try {
      stream = await getUserMedia();
      const videoTrack = stream.getVideoTracks()[0];
      // const audioTrack = stream.getAudioTracks()[0];

      // if (audioTrack) {
      //   const audioParams = { track: audioTrack };
      //   await transport.produce(audioParams);
      // }

      if (videoTrack) {
        const videoParams = { track: videoTrack };
        await transport.produce(videoParams);
      }
    } catch (err) {
      console.log("Failed to get media stream:", err);
      setWebcamButton({ disabled: false, text: "failed" });
    }
  }

  async function getUserMedia() {
    if (!device.canProduce("video")) {
      console.log("Cannot produce video");
      return;
    }

    const constraints = {
      video: {
        facingMode: "user", // or "environment" for back camera
      },
    };

    try {
      return navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.log("getUserMedia() failed:", err.message);
      throw err;
    }
  }

  async function subscribe(e) {
    if (e) e.preventDefault();

    // Request the creation of a consumer transport
    const data = await socket.request("createConsumerTransport", {
      forceTcp: false,
      userId,
    });

    if (data.error) {
      console.log("Error creating consumer transport:", data.error);
      return;
    }

    // Create the receiving transport
    const transport = device.createRecvTransport(data);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      socket
        .request("connectConsumerTransport", {
          transportId: transport.id,
          dtlsParameters,
          userId,
        })
        .then(callback)
        .catch(errback);
    });

    transport.on("connectionstatechange", async (state) => {
      switch (state) {
        case "connecting":
          setSubscribeButton({ disabled: true, text: "subscribing..." });
          break;

        case "connected":
          // This is where we will handle the media once the connection is made
          try {
            // Ensure the stream is awaited properly
            await socket.request("resume");
            // hasSubscribed.current = true;
            setSubscribeButton({ disabled: true, text: "subscribed" });
          } catch (err) {
            console.log("Failed to get media stream:", err);
          }
          break;

        case "failed":
          transport.close();
          setSubscribeButton({ disabled: false, text: "failed" });
          break;

        default:
          break;
      }
    });

    // Await the consumer function
    await consume(transport);
  }

  async function consume(transport) {
    const { rtpCapabilities } = device;

    // Request to consume streams, excluding own producerId
    const consumerDataList = await socket.request("consume", {
      rtpCapabilities,
      userId,
    });

    Object.keys(consumerDataList).map(async (key) => {
      // Create a MediaStream object to hold the incoming media
      const stream = new MediaStream();

      // Iterate through each consumerData and add tracks to the MediaStream
      const { producerId, id, kind, rtpParameters } = consumerDataList[key];

      const consumer = await transport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });

      stream.addTrack(consumer.track);

      const row = document.createElement("tr");
      const td = document.createElement("td");
      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;
      video.controls = false;
      td.appendChild(video);
      row.appendChild(td);
      row.id = key;
      document.querySelector("#videos").appendChild(row);
    });
  }

  return (
    <div className="App">
      <h1>MediaSoup WebRTC Call</h1>
      <table id="videos">
        <tr>
          <td>
            <div>Local</div>
            <video id="local_video" autoPlay muted></video>
          </td>
        </tr>
        <tr>Remote</tr>
      </table>
      <br />
      <table>
        <tr>
          <td>
            <fieldset>
              <legend>Connection</legend>
              <div>
                <button onClick={connect} disabled={connectButton.disabled}>
                  Connect
                </button>{" "}
                <span>{connectButton.text}</span>
              </div>
            </fieldset>
          </td>
          <td>
            <fieldset>
              <legend>Publishing</legend>
              <div>
                <button onClick={publish} disabled={webcamButton.disabled}>
                  Start Webcam
                </button>
                <span>{webcamButton.text}</span>
              </div>
            </fieldset>
          </td>
          <td>
            <fieldset>
              <legend>Subscription</legend>
              <div>
                <button onClick={subscribe} disabled={subscribeButton.disabled}>
                  Subscribe
                </button>{" "}
                <span>{subscribeButton.text}</span>
              </div>
            </fieldset>
          </td>
        </tr>
      </table>
      <div id="logs"></div>
    </div>
  );
};

export default App;
