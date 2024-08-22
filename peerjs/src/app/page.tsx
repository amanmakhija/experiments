"use client";

import { useEffect, useRef, useState } from "react";
import Peer, { DataConnection } from "peerjs";

const Home = () => {
  const [peerID, setPeerID] = useState<string>("");
  const [peerInstance, setPeerInstance] = useState<Peer | null>(null);
  const [remotePeerID, setRemotePeerID] = useState<string>("");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const [isIncomingAudioMuted, setIsIncomingAudioMuted] =
    useState<boolean>(false);
  const [isIncomingVideoMuted, setIsIncomingVideoMuted] =
    useState<boolean>(true);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
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
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then((stream) => {
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = stream;
            }

            stream.getVideoTracks().forEach((track) => {
              track.enabled = false;
            });
            localVideoRef.current?.pause();

            call.answer(stream);
            call.on("stream", (remoteStream) => {
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
              }
            });

            const dataConnection = peer.connect(call.peer);
            dataConnectionRef.current = dataConnection;
            dataConnection.on("open", () => {
              dataConnection.on("data", (data: any) => {
                if (data.type === "audio") {
                  setIsIncomingAudioMuted(data.muted);
                }
                if (data.type === "video") {
                  setIsIncomingVideoMuted(data.muted);
                }
              });
            });
          });
      });

      peer.on("connection", (connection) => {
        dataConnectionRef.current = connection;
        connection.on("data", (data: any) => {
          if (data.type === "audio") {
            setIsIncomingAudioMuted(data.muted);
          }
          if (data.type === "video") {
            setIsIncomingVideoMuted(data.muted);
          }
        });
      });
    }

    return () => {
      if (peerInstance) peerInstance.destroy();
    };
  }, [peerInstance]);

  const callPeer = () => {
    if (peerInstance && isPeerConnected) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }

          stream.getVideoTracks().forEach((track) => {
            track.enabled = false;
          });

          localVideoRef.current?.pause();

          const call = peerInstance.call(remotePeerID, stream);

          call.on("stream", (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
          });

          const dataConnection = peerInstance.connect(remotePeerID);
          dataConnectionRef.current = dataConnection;
          dataConnection.on("open", () => {
            dataConnection.send({ type: "audio", muted: isMuted });

            dataConnection.on("data", (data: any) => {
              if (data.type === "audio") {
                setIsIncomingAudioMuted(data.muted);
              }
              console.log(data);
              if (data.type === "video") {
                setIsIncomingVideoMuted(data.muted);
              }
            });
          });
        });
    }
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

  return (
    <div>
      <div>
        <video ref={localVideoRef} autoPlay muted />
        {!isIncomingVideoMuted && <video ref={remoteVideoRef} autoPlay />}
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
        placeholder="Enter peer ID to call"
        value={remotePeerID}
        onChange={(e) => setRemotePeerID(e.target.value)}
      />
      <br />
      <button onClick={callPeer}>Call</button>
      <div>Your Peer ID: {peerID}</div>
    </div>
  );
};

export default Home;
