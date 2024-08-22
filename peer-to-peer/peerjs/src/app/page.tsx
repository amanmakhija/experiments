"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection } from "peerjs";

const peerVideoElement: Record<string, HTMLVideoElement> = {};

const Home = () => {
  const [peerID, setPeerID] = useState<string>("");
  const [remotePeerID, setRemotePeerID] = useState<string>("");

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const [isIncomingAudioMuted, setIsIncomingAudioMuted] =
    useState<boolean>(false);
  const [isIncomingVideoMuted, setIsIncomingVideoMuted] =
    useState<boolean>(true);

  const [peerInstance, setPeerInstance] = useState<Peer | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const dataConnectionRef = useRef<DataConnection | null>(null);

  useEffect(() => {
    if (!peerInstance) {
      const peer = new Peer();

      setPeerInstance(peer);

      peer.on("open", (id: string) => {
        setPeerID(id);
        setIsPeerConnected(true);
      });

      peer.on("call", (call) => {
        getStream().then((stream) => {
          if (stream) {
            const video = document.createElement("video");
            video.autoplay = true;
            peerVideoElement[call.peer] = video;
            document.getElementById("video-grid")?.append(video);

            call.answer(stream);
            call.on("stream", (remoteStream) => {
              handleRemoteStream(call.peer, remoteStream);
            });

            const dataConnection = peer.connect(call.peer);
            dataConnectionRef.current = dataConnection;
            dataConnection.on("open", () => {
              handleDataConnection(dataConnection);
            });
          }
        });
      });

      peer.on("connection", (connection) => {
        dataConnectionRef.current = connection;
        handleDataConnection(connection);
      });
    }

    return () => {
      if (peerInstance) peerInstance.destroy();
    };
  }, [peerInstance]);

  const callPeer = (peerId: string) => {
    if (peerInstance && isPeerConnected) {
      getStream().then((stream) => {
        if (stream) {
          const call = peerInstance.call(peerId, stream);

          call.on("stream", (remoteStream) => {
            handleRemoteStream(peerId, remoteStream);
          });

          const dataConnection = peerInstance.connect(peerId);
          dataConnectionRef.current = dataConnection;
          dataConnection.on("open", () => {
            dataConnection.send({ type: "audio", muted: isMuted });
            handleDataConnection(dataConnection);
          });
        }
      });
    }
  };

  const callMultiplePeers = () => {
    const peers = remotePeerID.split(",").map((id) => id.trim());
    peers.forEach((peerId) => {
      const video = document.createElement("video");
      video.autoplay = true;
      peerVideoElement[peerId] = video;
      document.getElementById("video-grid")?.append(video);
      callPeer(peerId);
    });

    setRemotePeerID("");
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

    if (dataConnectionRef.current) {
      dataConnectionRef.current.send({ type: "audio", muted: newMuteState });
    }
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

    if (dataConnectionRef.current) {
      dataConnectionRef.current.send({ type: "video", muted: isPaused });
    }
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
    dataConnection.on("data", (data: any) => {
      if (data.type === "audio") {
        setIsIncomingAudioMuted(data.muted);
      }
      if (data.type === "video") {
        setIsIncomingVideoMuted(data.muted);
      }
    });
  };

  const handleRemoteStream = (peerId: string, remoteStream: MediaStream) => {
    const video = peerVideoElement[peerId];
    if (video) {
      video.srcObject = remoteStream;
    }
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
        type="text"
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
            navigator.clipboard.writeText(peerID);
            (event.target as HTMLSpanElement).style.color = "red";
          }}
          style={{ color: "green" }}
        >
          {peerID}
        </span>
      </div>
    </div>
  );
};

export default Home;
