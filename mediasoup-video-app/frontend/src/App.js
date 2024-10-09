import React, { useEffect, useState } from "react";
import { io as socketClient } from "socket.io-client";
import { Device } from "mediasoup-client";
const socketPromise = require("./lib/socket.io-promise").promise;

const SERVER_URL = "http://localhost:4000";

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
  const [ownProducerId, setOwnProducerId] = useState(null);

  // Initialize connection when the component is mounted
  useEffect(() => {
    if (!socket) {
      connect();
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [socket]);

  async function connect() {
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

    console.log("socket", socketServer);

    socketServer.on("connect", async () => {
      setConnectButton({ disabled: true, text: "Connected" });
      setWebcamButton({ disabled: false, text: "" });

      const data = await socketServer.request("getRouterRtpCapabilities");

      // Ensure device is loaded after receiving capabilities
      if (!device) {
        await loadDevice(data);
      }
    });

    socketServer.on("disconnect", () => {
      setConnectButton({ disabled: false, text: "Disconnected" });
    });

    socketServer.on("connect_error", (error) => {
      console.error(
        "could not connect to %s%s (%s)",
        SERVER_URL,
        opts.path,
        error.message
      );
      setConnectButton({ disabled: false, text: "Connection failed" });
    });

    socketServer.on("newProducer", () => {
      setWebcamButton({ disabled: false, text: "" });
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
        console.error("browser not supported");
      } else console.error("Error loading device:", error);
    }
  }

  async function publish(e) {
    e.preventDefault();
    if (!device) {
      console.error("Device not loaded yet.");
      return;
    }

    const data = await socket.request("createProducerTransport", {
      forceTcp: false,
      rtpCapabilities: device.rtpCapabilities,
    });

    if (data.error) {
      console.error(data.error);
      return;
    }

    const transport = device.createSendTransport(data);
    transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
      socket
        .request("connectProducerTransport", { dtlsParameters })
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
          });
          callback({ id });
          setOwnProducerId(id);
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
      setWebcamButton({ disabled: false, text: "failed" });
    }
  }

  async function getUserMedia() {
    if (!device.canProduce("video")) {
      console.error("Cannot produce video");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
    } catch (err) {
      console.error("getUserMedia() failed:", err.message);
      throw err;
    }
    return stream;
  }

  async function subscribe(e) {
    e.preventDefault();

    // Request the creation of a consumer transport
    const data = await socket.request("createConsumerTransport", {
      forceTcp: false,
    });

    if (data.error) {
      console.error("Error creating consumer transport:", data.error);
      return;
    }

    // Create the receiving transport
    const transport = device.createRecvTransport(data);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      socket
        .request("connectConsumerTransport", {
          transportId: transport.id,
          dtlsParameters,
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
            streams.forEach((stream) => {
              if (stream && stream.active) {
                const video = document.createElement("video");
                const row = document.createElement("tr");
                const td = document.createElement("td");
                video.srcObject = stream;
                video.autoplay = true;
                video.controls = false;
                td.appendChild(video);
                row.appendChild(td);
                document.querySelector("#videos").appendChild(row);
              }
            });
            await socket.request("resume");
            setSubscribeButton({ disabled: true, text: "subscribed" });
          } catch (err) {
            console.error("Failed to get media stream:", err);
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
    const streams = await consume(transport);
  }

  async function consume(transport) {
    const { rtpCapabilities } = device;

    // Request to consume streams, excluding own producerId
    const consumerDataList = await socket.request("consume", {
      rtpCapabilities,
      ownProducerId,
    });

    return Promise.all(
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

        // Add the consumer track to the media stream
        stream.addTrack(consumer.track);

        // Return the media stream to be used in the video element
        return stream;
      })
    );
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
    </div>
  );
};

export default App;
