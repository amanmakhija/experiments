"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection } from "peerjs";

const peerVideoElement: Record<string, HTMLVideoElement> = {};
const peerDataConnection: Record<string, DataConnection> = {};
const connectedPeers: string[] = [];
const peerToCall: string[] = [];

let peerID: string;

interface Data {
  type: string;
  muted: boolean;
  peers: string[];
}

const Home = () => {
  const peerIDRef = useRef<string>("");
  const [remotePeerID, setRemotePeerID] = useState<string>("");

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const isPeerConnectedRef = useRef<boolean>(false);
  const [isIncomingAudioMuted, setIsIncomingAudioMuted] =
    useState<boolean>(false);
  const [isIncomingVideoMuted, setIsIncomingVideoMuted] =
    useState<boolean>(true);

  const peerInstanceRef = useRef<Peer | null>(null);
  const [peerInstance, setPeerInstance] = useState<Peer | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!peerInstance) {
      // getting the constant peer ID for the user
      const peer = new Peer(peerID, {
        host: "peer.himanshujangid.com",
        path: "/peer-to-peer/peerjs",
        port: 443,
      });

      peerInstanceRef.current = peer;
      setPeerInstance(peer);

      peer.on("error", (error) => {
        console.error("Error occurred while connecting to peer server:", error);
      });

      peer.on("open", (id: string) => {
        peerIDRef.current = id;
        setIsPeerConnected(true);
        isPeerConnectedRef.current = true;
      });

      peer.on("call", (call) => {
        getStream().then((stream) => {
          if (stream) {
            createVideoElement(call.peer);

            call.answer(stream);
            call.on("stream", (remoteStream) => {
              handleRemoteStream(call.peer, remoteStream);
            });

            const dataConnection = peer.connect(call.peer);
            dataConnection.on("open", () => {
              handleDataConnection(dataConnection);
            });
          }
        });
      });

      peer.on("connection", (connection) => {
        handleDataConnection(connection);
      });
    }

    return () => {
      if (peerInstanceRef.current) peerInstanceRef.current.destroy();
      if (peerInstance) peerInstance.destroy();
    };
  }, [peerID]);

  const callPeer = (peerId: string) => {
    if (peerInstanceRef.current && isPeerConnectedRef.current) {
      peerInstanceRef.current.on("error", (error) => {
        console.error("Error occurred while calling peer:", error);
      });

      createVideoElement(peerId);

      getStream()
        .then((stream) => {
          if (stream && peerId && peerInstanceRef.current) {
            const call = peerInstanceRef.current.call(peerId, stream);

            call.on("error", (error) => {
              console.error("Error occurred while calling peer:", error);
            });

            if (!call) {
              console.error("Failed to establish call with peer:", peerId);
              return;
            }

            call.on("stream", (remoteStream) => {
              handleRemoteStream(peerId, remoteStream);
            });

            const dataConnection = peerInstanceRef.current.connect(peerId);
            dataConnection.on("open", () => {
              handleDataConnection(dataConnection);
            });
          }
        })
        .catch((error) => {
          console.error("Error occurred while getting user media", error);
        });
    }
  };

  const callMultiplePeers = () => {
    const peers = remotePeerID.split(",").map((id) => id.trim());
    connectedPeers.push(...peers);
    peerToCall.push(...peers);
    peers.forEach((peerId) => {
      callPeer(peerId);
    });

    setRemotePeerID("");
  };

  const createVideoElement = (peerId: string) => {
    const video = document.createElement("video");
    video.autoplay = true;
    peerVideoElement[peerId] = video;
    document.getElementById("video-grid")?.append(video);
    return video;
  };

  const toggleMute = () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);

    if (localVideoRef.current && localVideoRef.current.srcObject) {
      (localVideoRef.current.srcObject as MediaStream)
        .getAudioTracks()
        .forEach((track) => {
          track.enabled = !newMuteState;
        });
    }

    Object.keys(peerDataConnection).forEach((peer) => {
      peerDataConnection[peer].send({ type: "audio", muted: newMuteState });
    });
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      (localVideoRef.current.srcObject as MediaStream)
        .getVideoTracks()
        .forEach((track) => {
          track.enabled = !isPaused;
        });
      if (isPaused) localVideoRef.current.pause();
      else localVideoRef.current.play();
    }

    Object.keys(peerDataConnection).forEach((peer) => {
      peerDataConnection[peer].send({ type: "video", muted: isPaused });
    });
  };

  const getStream = async (): Promise<MediaStream | undefined> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Error occurred while getting user media", error);
      return undefined;
    }
  };

  const handleDataConnection = (dataConnection: DataConnection) => {
    peerDataConnection[dataConnection.peer] = dataConnection;
    dataConnection.send({ type: "peerList", peers: peerToCall });
    dataConnection.send({ type: "audio", muted: isMuted });
    dataConnection.send({ type: "video", muted: isPaused });

    peerToCall.splice(peerToCall.indexOf(dataConnection.peer), 1);

    const isData = (data: unknown): data is Data => {
      return (
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        ("muted" in data || "peers" in data)
      );
    };

    dataConnection.on("data", (data: unknown) => {
      if (!isData(data)) return;

      if (data.type === "audio") setIsIncomingAudioMuted(data.muted);
      if (data.type === "video") setIsIncomingVideoMuted(data.muted);
      if (data.type === "peerList") {
        const peers: string[] = data.peers;
        const newPeers = peers
          .map((peer: string) => peer.trim())
          .filter((peer: string) => {
            return peer !== peerIDRef.current && !connectedPeers.includes(peer);
          });
        connectedPeers.push(...newPeers);

        newPeers.forEach((peer: string) => {
          callPeer(peer);
        });
      }
    });
  };

  const handleRemoteStream = (peerId: string, remoteStream: MediaStream) => {
    const video = peerVideoElement[peerId];
    video.srcObject = remoteStream;
  };

  return (
    <div>
      <div id="video-grid"></div>
      <div>
        <video ref={localVideoRef} autoPlay muted />
        {isIncomingAudioMuted ? (
          <div>Remote audio is muted</div>
        ) : (
          <div>Remote audio is not muted</div>
        )}
        {isIncomingVideoMuted ? (
          <div>Remote video is muted</div>
        ) : (
          <div>Remote video is not muted</div>
        )}
      </div>
      <button onClick={toggleMute}>{isMuted ? "Unmute" : "Mute"}</button>
      <br />
      <button onClick={togglePause}>{isPaused ? "Play" : "Pause"}</button>
      <br />
      <input
        style={{ color: "black" }}
        placeholder="Enter peer ID(s) separated by comma"
        value={remotePeerID}
        onChange={(e) => setRemotePeerID(e.target.value)}
      />
      <br />
      <button onClick={() => callPeer(remotePeerID)}>Call</button>
      <br />
      <button onClick={callMultiplePeers}>Call Multiple</button>
      <div>
        Your Peer ID:
        <span
          onClick={(event) => {
            navigator.clipboard.writeText(peerIDRef.current);
            (event.target as HTMLSpanElement).style.color = "red";
          }}
          style={{ color: "green" }}
        >
          {peerIDRef.current}
        </span>
      </div>
      <input
        placeholder="Enter peer ID"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            peerID = e.currentTarget.value;
            e.currentTarget.blur();
          }
        }}
        style={{ color: "black" }}
      />
    </div>
  );
};

export default Home;
