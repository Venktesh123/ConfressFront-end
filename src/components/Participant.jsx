import React, { useEffect, useRef } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
} from "react-icons/fa";
import "./Participant.css";

const Participant = ({
  username,
  videoRef,
  stream,
  muted = false,
  audioEnabled = true,
  videoEnabled = true,
  isLocal = false,
  isScreenSharing = false,
}) => {
  const videoElement = useRef();

  useEffect(() => {
    const video = videoRef || videoElement.current;

    if (video && stream) {
      video.srcObject = stream;

      // Ensure video plays
      video.onloadedmetadata = () => {
        video.play().catch((error) => {
          console.log("Video play failed:", error);
        });
      };
    }
  }, [stream, videoRef]);

  // For local video, use the ref passed from parent
  // For remote video, use our own ref
  const videoToUse = isLocal ? videoRef : videoElement;

  return (
    <div className={`participant ${isScreenSharing ? "screen-sharing" : ""}`}>
      <div className="video-container">
        <video
          ref={videoToUse}
          autoPlay
          playsInline
          muted={muted}
          className={`participant-video ${
            !videoEnabled && !isScreenSharing ? "video-hidden" : ""
          }`}
        />
        {!videoEnabled && !isScreenSharing && (
          <div className="video-off-indicator">
            <div className="avatar">{username.charAt(0).toUpperCase()}</div>
          </div>
        )}
        {!stream && !isLocal && (
          <div className="loading-indicator">
            <div className="loading-spinner"></div>
            <span>Connecting...</span>
          </div>
        )}
        {isScreenSharing && (
          <div className="screen-share-indicator">
            <FaDesktop className="screen-share-icon" />
            <span>Screen Sharing</span>
          </div>
        )}
      </div>

      <div className="participant-info">
        <div className="participant-name">
          {username}
          {isScreenSharing && " (Screen)"}
        </div>
        <div className="participant-controls">
          {audioEnabled ? (
            <FaMicrophone className="control-icon audio-on" />
          ) : (
            <FaMicrophoneSlash className="control-icon audio-off" />
          )}

          {isScreenSharing ? (
            <FaDesktop className="control-icon screen-share-on" />
          ) : videoEnabled ? (
            <FaVideo className="control-icon video-on" />
          ) : (
            <FaVideoSlash className="control-icon video-off" />
          )}
        </div>
      </div>
    </div>
  );
};

export default Participant;
