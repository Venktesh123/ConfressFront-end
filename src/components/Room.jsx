import React, { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Peer from "peerjs";
import Controls from "./Controls";
import Participant from "./Participant";
import ParticipantsList from "./ParticipantsList";
import "./Room.css";

const API_URL = "http://localhost:5000";

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { username } = location.state || {};

  const [participants, setParticipants] = useState({});
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [peerId, setPeerId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");

  const socketRef = useRef();
  const peerRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef({});
  const streamRef = useRef();

  // Redirect if no username is provided
  useEffect(() => {
    if (!username) {
      navigate("/");
      return;
    }

    initializeConnection();

    return () => {
      cleanup();
    };
  }, [username, navigate, roomId]);

  const initializeConnection = async () => {
    try {
      setConnectionStatus("Getting media...");

      // Get media stream first
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setStream(mediaStream);
      streamRef.current = mediaStream;

      // Set local video
      if (userVideo.current) {
        userVideo.current.srcObject = mediaStream;
        userVideo.current.muted = true; // Prevent feedback
      }

      setConnectionStatus("Connecting to server...");

      // Initialize socket connection
      socketRef.current = io(API_URL, {
        transports: ["websocket", "polling"],
      });

      // Initialize PeerJS - Use the free cloud server (NO local server needed)
      peerRef.current = new Peer({
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            { urls: "stun:stun.relay.metered.ca:80" },
          ],
        },
        debug: 1, // Reduce debug logs
      });

      // Setup socket event listeners
      setupSocketEvents(mediaStream);

      // Setup peer event listeners
      setupPeerEvents(mediaStream);
    } catch (error) {
      console.error("Error initializing connection:", error);
      setConnectionStatus("Failed to connect");
      alert(
        "Failed to access camera/microphone. Please check permissions and try again."
      );
      navigate("/");
    }
  };

  const setupSocketEvents = (mediaStream) => {
    socketRef.current.on("connect", () => {
      console.log("Socket connected:", socketRef.current.id);
      setConnectionStatus("Connected to server");
    });

    socketRef.current.on(
      "user-joined",
      ({ participantId, username: newUsername, peerId: newPeerId }) => {
        console.log(`User joined: ${newUsername} (${newPeerId})`);

        if (
          newPeerId &&
          newPeerId !== peerId &&
          peerRef.current &&
          peerRef.current.open
        ) {
          // Small delay to ensure both peers are ready
          setTimeout(() => {
            makeCall(newPeerId, newUsername, mediaStream);
          }, 1000);
        }
      }
    );

    socketRef.current.on(
      "room-participants",
      ({ participants: existingParticipants }) => {
        console.log("Existing participants:", existingParticipants);

        // Connect to existing participants
        Object.values(existingParticipants).forEach((participant) => {
          if (participant.peerId && participant.peerId !== peerId) {
            setTimeout(() => {
              makeCall(participant.peerId, participant.username, mediaStream);
            }, 2000);
          }
        });
      }
    );

    socketRef.current.on(
      "user-left",
      ({ peerId: leftPeerId, participantId }) => {
        console.log(`User left: ${leftPeerId}`);

        if (leftPeerId && peersRef.current[leftPeerId]) {
          peersRef.current[leftPeerId].close();
          delete peersRef.current[leftPeerId];
        }

        setParticipants((prev) => {
          const newParticipants = { ...prev };
          delete newParticipants[leftPeerId];
          return newParticipants;
        });
      }
    );

    socketRef.current.on(
      "user-toggle-audio",
      ({ peerId: remotePeerId, enabled }) => {
        setParticipants((prev) => ({
          ...prev,
          [remotePeerId]: {
            ...prev[remotePeerId],
            audioEnabled: enabled,
          },
        }));
      }
    );

    socketRef.current.on(
      "user-toggle-video",
      ({ peerId: remotePeerId, enabled }) => {
        setParticipants((prev) => ({
          ...prev,
          [remotePeerId]: {
            ...prev[remotePeerId],
            videoEnabled: enabled,
          },
        }));
      }
    );

    socketRef.current.on("you-were-removed", () => {
      alert("You have been removed from the meeting by the host");
      leaveRoom();
    });

    socketRef.current.on("user-removed", ({ peerId: removedPeerId }) => {
      if (removedPeerId && peersRef.current[removedPeerId]) {
        peersRef.current[removedPeerId].close();
        delete peersRef.current[removedPeerId];
      }

      setParticipants((prev) => {
        const newParticipants = { ...prev };
        delete newParticipants[removedPeerId];
        return newParticipants;
      });
    });

    socketRef.current.on("room-error", ({ message }) => {
      alert(`Error: ${message}`);
      navigate("/");
    });
  };

  const setupPeerEvents = (mediaStream) => {
    peerRef.current.on("open", (id) => {
      console.log("Peer connected with ID:", id);
      setPeerId(id);
      setConnectionStatus("Joining room...");

      // Join the room with socket and peer info
      socketRef.current.emit("join-room", {
        roomId,
        username,
        peerId: id,
      });

      setConnectionStatus("Connected");
    });

    peerRef.current.on("call", (call) => {
      console.log("Receiving call from:", call.peer);

      // Answer the call with our stream
      call.answer(mediaStream);

      call.on("stream", (remoteStream) => {
        console.log("Received remote stream from:", call.peer);
        addParticipant(call.peer, remoteStream, call);
      });

      call.on("close", () => {
        console.log("Call closed from:", call.peer);
        removeParticipant(call.peer);
      });

      call.on("error", (error) => {
        console.error("Call error:", error);
      });

      peersRef.current[call.peer] = call;
    });

    peerRef.current.on("error", (error) => {
      console.error("Peer error:", error);
      setConnectionStatus("Peer connection error");

      // Try to reconnect after a delay
      setTimeout(() => {
        if (peerRef.current.destroyed) {
          console.log("Attempting to recreate peer connection...");
          // Recreate peer if destroyed
          initializePeer(mediaStream);
        }
      }, 3000);
    });

    peerRef.current.on("disconnected", () => {
      console.log("Peer disconnected, attempting to reconnect...");
      setConnectionStatus("Reconnecting...");

      if (!peerRef.current.destroyed) {
        peerRef.current.reconnect();
      }
    });

    peerRef.current.on("close", () => {
      console.log("Peer connection closed");
      setConnectionStatus("Disconnected");
    });
  };

  const initializePeer = (mediaStream) => {
    peerRef.current = new Peer({
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
        ],
      },
      debug: 1,
    });

    setupPeerEvents(mediaStream);
  };

  const makeCall = (remotePeerId, remoteUsername, mediaStream) => {
    console.log("Making call to:", remotePeerId);

    if (
      !peerRef.current ||
      !peerRef.current.open ||
      peersRef.current[remotePeerId]
    ) {
      console.log("Cannot make call - peer not ready or already connected");
      return;
    }

    const call = peerRef.current.call(remotePeerId, mediaStream);

    if (!call) {
      console.error("Failed to create call to:", remotePeerId);
      return;
    }

    call.on("stream", (remoteStream) => {
      console.log("Received stream from called peer:", remotePeerId);
      addParticipant(remotePeerId, remoteStream, call, remoteUsername);
    });

    call.on("close", () => {
      console.log("Call closed to:", remotePeerId);
      removeParticipant(remotePeerId);
    });

    call.on("error", (error) => {
      console.error("Call error to", remotePeerId, ":", error);
      removeParticipant(remotePeerId);
    });

    peersRef.current[remotePeerId] = call;
  };

  const addParticipant = (peerId, stream, call, username = "Unknown") => {
    setParticipants((prev) => ({
      ...prev,
      [peerId]: {
        id: peerId,
        peerId,
        username,
        stream,
        call,
        audioEnabled: true,
        videoEnabled: true,
      },
    }));
  };

  const removeParticipant = (peerId) => {
    if (peersRef.current[peerId]) {
      delete peersRef.current[peerId];
    }

    setParticipants((prev) => {
      const newParticipants = { ...prev };
      delete newParticipants[peerId];
      return newParticipants;
    });
  };

  const cleanup = () => {
    console.log("Cleaning up connections...");

    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }

    // Close all peer connections
    Object.values(peersRef.current).forEach((call) => {
      if (call && call.close) {
        call.close();
      }
    });

    // Destroy peer connection
    if (peerRef.current && !peerRef.current.destroyed) {
      peerRef.current.destroy();
    }

    // Disconnect socket
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !audioEnabled;
      });

      setAudioEnabled(!audioEnabled);

      if (socketRef.current) {
        socketRef.current.emit("toggle-audio", {
          roomId,
          peerId,
          enabled: !audioEnabled,
        });
      }
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !videoEnabled;
      });

      setVideoEnabled(!videoEnabled);

      if (socketRef.current) {
        socketRef.current.emit("toggle-video", {
          roomId,
          peerId,
          enabled: !videoEnabled,
        });
      }
    }
  };

  const leaveRoom = () => {
    cleanup();
    navigate("/");
  };

  const removeParticipantHandler = (participantId) => {
    if (window.confirm("Are you sure you want to remove this participant?")) {
      const participant = Object.values(participants).find(
        (p) => p.id === participantId
      );
      if (socketRef.current) {
        socketRef.current.emit("remove-participant", {
          roomId,
          participantId,
          peerId: participant?.peerId,
        });
      }
    }
  };

  const copyRoomId = () => {
    navigator.clipboard
      .writeText(roomId)
      .then(() => {
        alert("Room ID copied to clipboard");
      })
      .catch(() => {
        // Fallback
        const textarea = document.createElement("textarea");
        textarea.value = roomId;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        alert("Room ID copied to clipboard");
      });
  };

  return (
    <div className="room">
      <div className="room-header">
        <div>
          <h2>Meeting: {roomId}</h2>
          <div className="connection-status">{connectionStatus}</div>
        </div>
        <div className="header-controls">
          {peerId && (
            <span className="peer-id">ID: {peerId.substring(0, 8)}...</span>
          )}
          <button className="copy-button" onClick={copyRoomId}>
            Copy Room ID
          </button>
        </div>
      </div>

      <div className="participants-container">
        {/* Current user's video */}
        <div className="participant-wrapper">
          <Participant
            username={`${username} (You)`}
            videoRef={userVideo}
            stream={stream}
            muted={true}
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled}
            isLocal={true}
          />
        </div>

        {/* Other participants */}
        {Object.values(participants).map((participant) => (
          <div className="participant-wrapper" key={participant.peerId}>
            <Participant
              username={participant.username}
              stream={participant.stream}
              audioEnabled={participant.audioEnabled}
              videoEnabled={participant.videoEnabled}
              isLocal={false}
            />
          </div>
        ))}
      </div>

      {/* Show message if no other participants */}
      {Object.keys(participants).length === 0 && (
        <div className="no-participants-message">
          <p>Share the room ID with others to start the meeting!</p>
          <p>Status: {connectionStatus}</p>
        </div>
      )}

      {/* Controls */}
      <Controls
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        toggleAudio={toggleAudio}
        toggleVideo={toggleVideo}
        leaveRoom={leaveRoom}
        toggleParticipants={() => setShowParticipants(!showParticipants)}
        participantsCount={Object.keys(participants).length + 1}
      />

      {/* Participants list sidebar */}
      {showParticipants && (
        <ParticipantsList
          participants={[
            { id: "self", username: `${username} (You)` },
            ...Object.values(participants).map((p) => ({
              id: p.id,
              username: p.username,
            })),
          ]}
          onClose={() => setShowParticipants(false)}
          onRemove={removeParticipantHandler}
        />
      )}
    </div>
  );
};

export default Room;
