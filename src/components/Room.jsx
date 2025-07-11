import React, { useEffect, useState, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import Peer from "peerjs";
import Controls from "./Controls";
import Participant from "./Participant";
import ParticipantsList from "./ParticipantsList";
import Chat from "./Chat";
import "./Room.css";

const API_URL = "https://confrencebackend.onrender.com";

const Room = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { username } = location.state || {};

  const [participants, setParticipants] = useState({});
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [peerId, setPeerId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting...");
  const [isHost, setIsHost] = useState(false); // New state for host status
  const [hostControlsActive, setHostControlsActive] = useState(false); // Track if host controls are being used

  const socketRef = useRef();
  const peerRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef({});
  const streamRef = useRef();
  const originalStreamRef = useRef(); // Store original camera stream
  const screenStreamRef = useRef(); // Store screen share stream

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

  const getMediaStream = async (video = true, audio = true) => {
    try {
      const constraints = {
        audio: audio
          ? {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          : false,
        video: video
          ? {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              facingMode: "user",
            }
          : false,
      };

      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.error("Error getting media stream:", error);
      throw error;
    }
  };

  const getScreenStream = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
        },
        audio: true, // Include system audio if available
      });

      // Listen for screen share ending (user clicks browser stop button)
      screenStream.getVideoTracks()[0].addEventListener("ended", () => {
        console.log("Screen share ended by user");
        stopScreenShare();
      });

      return screenStream;
    } catch (error) {
      console.error("Error getting screen stream:", error);
      throw error;
    }
  };

  const initializeConnection = async () => {
    try {
      setConnectionStatus("Getting media...");

      // Get media stream first
      const mediaStream = await getMediaStream(true, true);

      setStream(mediaStream);
      streamRef.current = mediaStream;
      originalStreamRef.current = mediaStream; // Store original stream

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

  const updateStreamForAllPeers = (newStream) => {
    // Update stream for all existing peer connections
    Object.values(peersRef.current).forEach((call) => {
      if (call && call.peerConnection) {
        const senders = call.peerConnection.getSenders();
        const videoTrack = newStream.getVideoTracks()[0];
        const audioTrack = newStream.getAudioTracks()[0];

        // Replace video track
        const videoSender = senders.find(
          (s) => s.track && s.track.kind === "video"
        );
        if (videoSender && videoTrack) {
          videoSender
            .replaceTrack(videoTrack)
            .catch((error) =>
              console.error("Error replacing video track:", error)
            );
        }

        // Replace audio track
        const audioSender = senders.find(
          (s) => s.track && s.track.kind === "audio"
        );
        if (audioSender && audioTrack) {
          audioSender
            .replaceTrack(audioTrack)
            .catch((error) =>
              console.error("Error replacing audio track:", error)
            );
        }
      }
    });
  };

  const setupSocketEvents = (mediaStream) => {
    socketRef.current.on("connect", () => {
      console.log("Socket connected:", socketRef.current.id);
      setConnectionStatus("Connected to server");
    });

    // Host assignment event
    socketRef.current.on("host-assigned", ({ isHost: hostStatus }) => {
      console.log("Host status received:", hostStatus);
      setIsHost(hostStatus);
    });

    socketRef.current.on(
      "user-joined",
      ({
        participantId,
        username: newUsername,
        peerId: newPeerId,
        isHost: userIsHost,
      }) => {
        console.log(`User joined: ${newUsername} (${newPeerId})`);

        // Send system message to chat
        if (socketRef.current) {
          socketRef.current.emit("send-system-message", {
            roomId,
            message: `${newUsername} joined the meeting`,
            type: "join",
          });
        }

        if (
          newPeerId &&
          newPeerId !== peerId &&
          peerRef.current &&
          peerRef.current.open
        ) {
          // Small delay to ensure both peers are ready
          setTimeout(() => {
            makeCall(newPeerId, newUsername, streamRef.current, userIsHost);
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
              makeCall(
                participant.peerId,
                participant.username,
                streamRef.current,
                participant.isHost
              );
            }, 2000);
          }
        });
      }
    );

    socketRef.current.on(
      "user-left",
      ({ peerId: leftPeerId, participantId, username: leftUsername }) => {
        console.log(`User left: ${leftPeerId}`);

        // Send system message to chat
        if (socketRef.current && leftUsername) {
          socketRef.current.emit("send-system-message", {
            roomId,
            message: `${leftUsername} left the meeting`,
            type: "leave",
          });
        }

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

    // Screen sharing events
    socketRef.current.on(
      "user-screen-share",
      ({ peerId: remotePeerId, isSharing }) => {
        console.log(`User ${remotePeerId} screen sharing: ${isSharing}`);
        setParticipants((prev) => ({
          ...prev,
          [remotePeerId]: {
            ...prev[remotePeerId],
            isScreenSharing: isSharing,
          },
        }));
      }
    );

    // NEW: Host control events
    socketRef.current.on("host-muted-audio", ({ forced }) => {
      console.log("Host muted your audio");
      if (forced && audioEnabled) {
        // Force mute the user
        forceToggleAudio(false);
        showHostActionNotification("Host muted your microphone");
      }
    });

    socketRef.current.on("host-unmuted-audio", () => {
      console.log("Host requested you to unmute");
      showHostActionNotification(
        "Host requested you to unmute your microphone"
      );
    });

    socketRef.current.on("host-disabled-video", ({ forced }) => {
      console.log("Host disabled your video");
      if (forced && videoEnabled && !isScreenSharing) {
        // Force disable video
        forceToggleVideo(false);
        showHostActionNotification("Host turned off your camera");
      }
    });

    socketRef.current.on("host-enabled-video", () => {
      console.log("Host requested you to enable video");
      showHostActionNotification("Host requested you to turn on your camera");
    });

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

    // Chat event listeners - only handle unread count logic
    // The actual message handling is done by the Chat component
    const handleChatUnread = (messageData) => {
      // If chat is closed and message is not from current user, increment unread count
      if (!showChat && messageData.username !== username) {
        setUnreadChatCount((prev) => prev + 1);
      }
    };

    socketRef.current.on("chat-message", handleChatUnread);
    socketRef.current.on("private-message", handleChatUnread);
    socketRef.current.on("host-message", handleChatUnread);
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

      // Answer the call with our current stream
      call.answer(streamRef.current);

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
          initializePeer(streamRef.current);
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

  const makeCall = (
    remotePeerId,
    remoteUsername,
    mediaStream,
    userIsHost = false
  ) => {
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
      addParticipant(
        remotePeerId,
        remoteStream,
        call,
        remoteUsername,
        userIsHost
      );
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

  const addParticipant = (
    peerId,
    stream,
    call,
    username = "Unknown",
    userIsHost = false
  ) => {
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
        isScreenSharing: false,
        isHost: userIsHost,
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

  // NEW: Show notification when host performs actions
  const showHostActionNotification = (message) => {
    // Create a notification element
    const notification = document.createElement("div");
    notification.className = "host-action-notification";
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background-color: rgba(255, 193, 7, 0.9);
      color: #000;
      padding: 12px 20px;
      border-radius: 25px;
      font-weight: 500;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideDown 0.3s ease-out;
    `;

    // Add animation keyframes if not already added
    if (!document.querySelector("#hostNotificationStyles")) {
      const style = document.createElement("style");
      style.id = "hostNotificationStyles";
      style.textContent = `
        @keyframes slideDown {
          from {
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  };

  // NEW: Force toggle functions (when host controls user)
  const forceToggleAudio = (enabled) => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = enabled;
      });

      setAudioEnabled(enabled);
      setHostControlsActive(true);

      // Broadcast the change
      if (socketRef.current) {
        socketRef.current.emit("toggle-audio", {
          roomId,
          peerId,
          enabled: enabled,
        });
      }

      // Reset host controls active flag after a delay
      setTimeout(() => {
        setHostControlsActive(false);
      }, 2000);
    }
  };

  const forceToggleVideo = async (enabled) => {
    if (isScreenSharing) return;

    try {
      if (!enabled && videoEnabled) {
        // Force turn OFF video
        if (streamRef.current) {
          const videoTracks = streamRef.current.getVideoTracks();
          videoTracks.forEach((track) => {
            track.stop();
          });

          // Create new stream with only audio
          const audioStream = await getMediaStream(false, true);
          const newStream = new MediaStream([...audioStream.getAudioTracks()]);

          streamRef.current = newStream;
          originalStreamRef.current = newStream;
          setStream(newStream);

          if (userVideo.current) {
            userVideo.current.srcObject = newStream;
          }

          // Update peer connections
          Object.values(peersRef.current).forEach((call) => {
            if (call && call.peerConnection) {
              const videoSender = call.peerConnection
                .getSenders()
                .find((s) => s.track && s.track.kind === "video");
              if (videoSender) {
                call.peerConnection.removeTrack(videoSender);
              }
            }
          });
        }
      }

      setVideoEnabled(enabled);
      setHostControlsActive(true);

      if (socketRef.current) {
        socketRef.current.emit("toggle-video", {
          roomId,
          peerId,
          enabled: enabled,
        });
      }

      setTimeout(() => {
        setHostControlsActive(false);
      }, 2000);
    } catch (error) {
      console.error("Error in force toggle video:", error);
    }
  };

  // NEW: Host control functions
  const handleHostMuteAudio = (targetPeerId, currentlyEnabled) => {
    if (!isHost) return;

    const action = currentlyEnabled ? "mute" : "unmute";
    const forced = currentlyEnabled; // Only force when muting

    socketRef.current.emit("host-control-audio", {
      roomId,
      targetPeerId,
      action,
      forced,
    });

    // Update local state immediately for better UX
    setParticipants((prev) => ({
      ...prev,
      [targetPeerId]: {
        ...prev[targetPeerId],
        audioEnabled: !currentlyEnabled,
      },
    }));
  };

  const handleHostMuteVideo = (targetPeerId, currentlyEnabled) => {
    if (!isHost) return;

    const action = currentlyEnabled ? "disable" : "enable";
    const forced = currentlyEnabled; // Only force when disabling

    socketRef.current.emit("host-control-video", {
      roomId,
      targetPeerId,
      action,
      forced,
    });

    // Update local state immediately for better UX
    setParticipants((prev) => ({
      ...prev,
      [targetPeerId]: {
        ...prev[targetPeerId],
        videoEnabled: !currentlyEnabled,
      },
    }));
  };

  const cleanup = () => {
    console.log("Cleaning up connections...");

    // Stop all media tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }

    if (originalStreamRef.current) {
      originalStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
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

  const toggleVideo = async () => {
    // Don't allow video toggle while screen sharing
    if (isScreenSharing) return;

    try {
      if (videoEnabled) {
        // Turn OFF video - stop video tracks
        if (streamRef.current) {
          const videoTracks = streamRef.current.getVideoTracks();
          videoTracks.forEach((track) => {
            track.stop(); // Actually stop the camera
          });

          // Create new stream with only audio
          const audioStream = await getMediaStream(false, true);

          // Combine existing audio with no video
          const newStream = new MediaStream([...audioStream.getAudioTracks()]);

          // Update the stream reference
          streamRef.current = newStream;
          originalStreamRef.current = newStream;
          setStream(newStream);

          // Update local video element
          if (userVideo.current) {
            userVideo.current.srcObject = newStream;
          }

          // Update all peer connections to send audio-only stream
          Object.values(peersRef.current).forEach((call) => {
            if (call && call.peerConnection) {
              // Remove video track from all senders
              const videoSender = call.peerConnection
                .getSenders()
                .find((s) => s.track && s.track.kind === "video");
              if (videoSender) {
                call.peerConnection.removeTrack(videoSender);
              }
            }
          });
        }
      } else {
        // Turn ON video - get new stream with video
        const newStream = await getMediaStream(true, true);

        // Update the stream reference
        streamRef.current = newStream;
        originalStreamRef.current = newStream;
        setStream(newStream);

        // Update local video element
        if (userVideo.current) {
          userVideo.current.srcObject = newStream;
        }

        // Update all peer connections with new video stream
        Object.values(peersRef.current).forEach((call) => {
          if (call && call.peerConnection) {
            // Add video track to all peer connections
            const videoTrack = newStream.getVideoTracks()[0];
            if (videoTrack) {
              call.peerConnection.addTrack(videoTrack, newStream);
            }
          }
        });
      }

      setVideoEnabled(!videoEnabled);

      if (socketRef.current) {
        socketRef.current.emit("toggle-video", {
          roomId,
          peerId,
          enabled: !videoEnabled,
        });
      }
    } catch (error) {
      console.error("Error toggling video:", error);
      alert("Failed to toggle video. Please check camera permissions.");
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      // Start screen sharing
      try {
        const screenStream = await getScreenStream();

        // Combine screen video with current audio
        const audioTracks = streamRef.current.getAudioTracks();
        const screenVideoTrack = screenStream.getVideoTracks()[0];

        // Create new stream with screen video and current audio
        const newStream = new MediaStream([screenVideoTrack, ...audioTracks]);

        // Store the screen stream for cleanup
        screenStreamRef.current = screenStream;

        // Update local video
        if (userVideo.current) {
          userVideo.current.srcObject = newStream;
        }

        // Update stream reference
        streamRef.current = newStream;
        setStream(newStream);
        setIsScreenSharing(true);

        // Update all peer connections
        updateStreamForAllPeers(newStream);

        // Notify other participants
        if (socketRef.current) {
          socketRef.current.emit("user-screen-share", {
            roomId,
            peerId,
            isSharing: true,
          });
        }

        console.log("Screen sharing started");
      } catch (error) {
        console.error("Error starting screen share:", error);
        if (error.name === "NotAllowedError") {
          alert("Screen sharing permission denied");
        } else {
          alert("Failed to start screen sharing");
        }
      }
    } else {
      // Stop screen sharing
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    try {
      // Stop screen stream
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        screenStreamRef.current = null;
      }

      // Get original camera stream or create new one
      let cameraStream = originalStreamRef.current;

      // If original stream is not available or has no video tracks, get new one
      if (!cameraStream || cameraStream.getVideoTracks().length === 0) {
        cameraStream = await getMediaStream(videoEnabled, true);
        originalStreamRef.current = cameraStream;
      }

      // Update local video
      if (userVideo.current) {
        userVideo.current.srcObject = cameraStream;
      }

      // Update stream reference
      streamRef.current = cameraStream;
      setStream(cameraStream);
      setIsScreenSharing(false);

      // Update all peer connections
      updateStreamForAllPeers(cameraStream);

      // Notify other participants
      if (socketRef.current) {
        socketRef.current.emit("user-screen-share", {
          roomId,
          peerId,
          isSharing: false,
        });
      }

      console.log("Screen sharing stopped");
    } catch (error) {
      console.error("Error stopping screen share:", error);
      alert("Failed to stop screen sharing");
    }
  };

  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      // Reset unread count when opening chat
      setUnreadChatCount(0);
    }
  };

  const handleChatMessageRead = () => {
    setUnreadChatCount(0);
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

  // Prepare participants for ParticipantsList component
  const participantsForList = [
    {
      id: "self",
      username: `${username} (You)`,
      audioEnabled,
      videoEnabled: videoEnabled || isScreenSharing,
      isHost,
      peerId,
    },
    ...Object.values(participants).map((p) => ({
      id: p.id,
      username: p.username,
      audioEnabled: p.audioEnabled,
      videoEnabled: p.videoEnabled,
      isHost: p.isHost,
      peerId: p.peerId,
    })),
  ];

  return (
    <div className="room">
      <div className="room-header">
        <div>
          <h2>Meeting: {roomId}</h2>
          <div className="connection-status">
            {connectionStatus}
            {isHost && (
              <span style={{ color: "#ffd700", marginLeft: "10px" }}>
                • Host
              </span>
            )}
            {hostControlsActive && (
              <span style={{ color: "#ffa500", marginLeft: "10px" }}>
                • Host Control Active
              </span>
            )}
          </div>
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

      <div className={`participants-container ${showChat ? "chat-open" : ""}`}>
        {/* Current user's video */}
        <div className="participant-wrapper">
          <Participant
            username={`${username} (You)`}
            videoRef={userVideo}
            stream={stream}
            muted={true}
            audioEnabled={audioEnabled}
            videoEnabled={videoEnabled || isScreenSharing}
            isLocal={true}
            isScreenSharing={isScreenSharing}
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
              isScreenSharing={participant.isScreenSharing}
            />
          </div>
        ))}
      </div>

      {/* Show message if no other participants */}
      {Object.keys(participants).length === 0 && (
        <div className="no-participants-message">
          <p>Share the room ID with others to start the meeting!</p>
          <p>Status: {connectionStatus}</p>
          {isHost && (
            <p style={{ color: "#ffd700" }}>You are the host of this meeting</p>
          )}
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
        toggleChat={toggleChat}
        unreadChatCount={unreadChatCount}
        isScreenSharing={isScreenSharing}
        toggleScreenShare={toggleScreenShare}
      />

      {/* Participants list sidebar */}
      {showParticipants && (
        <ParticipantsList
          participants={participantsForList}
          onClose={() => setShowParticipants(false)}
          onRemove={removeParticipantHandler}
          onHostMuteAudio={handleHostMuteAudio}
          onHostMuteVideo={handleHostMuteVideo}
          currentUsername={username}
          isHost={isHost}
        />
      )}

      {/* Chat component */}
      {showChat && (
        <Chat
          socket={socketRef.current}
          roomId={roomId}
          username={username}
          isOpen={showChat}
          onClose={() => setShowChat(false)}
          unreadCount={unreadChatCount}
          onMessageRead={handleChatMessageRead}
        />
      )}
    </div>
  );
};

export default Room;
