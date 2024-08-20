"use client";

import { useEffect, useRef, useState } from "react";
import Peer from "peerjs";

const Home = () => {
  const [peerID, setPeerID] = useState<string>("");
  const [peerInstance, setPeerInstance] = useState<Peer | null>(null);
  const [remotePeerID, setRemotePeerID] = useState<string>("");
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const [isIncomingAudioMuted, setIsIncomingAudioMuted] =
    useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

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
            call.answer(stream);
            call.on("stream", (remoteStream) => {
              console.log("remoteStream", remoteStream.getAudioTracks());

              remoteStream.getAudioTracks().forEach((track) => {
                setIsIncomingAudioMuted(!track.enabled);
              });
              if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
              }
            });
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

          console.log("stream", stream.getAudioTracks());

          stream.getAudioTracks().forEach((track) => {
            setIsIncomingAudioMuted(!track.enabled);
          });

          const call = peerInstance.call(remotePeerID, stream);

          call.on("stream", (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
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
  };

  return (
    <div>
      <div>
        <video ref={localVideoRef} autoPlay muted />
        <video ref={remoteVideoRef} autoPlay />
        {isIncomingAudioMuted ? (
          <div>Remote audio is muted</div>
        ) : (
          <div>Remote audio is not muted</div>
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
