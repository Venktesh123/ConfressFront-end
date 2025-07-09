import React from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaPhoneSlash,
  FaUserFriends,
  FaComments,
  FaDesktop,
  FaStop,
} from "react-icons/fa";
import "./Controls.css";

const Controls = ({
  audioEnabled,
  videoEnabled,
  toggleAudio,
  toggleVideo,
  leaveRoom,
  toggleParticipants,
  participantsCount,
  toggleChat,
  unreadChatCount,
  isScreenSharing,
  toggleScreenShare,
}) => {
  return (
    <div className="controls">
      <button
        className={`control-button ${
          !audioEnabled ? "control-button-off" : ""
        }`}
        onClick={toggleAudio}
      >
        {audioEnabled ? (
          <>
            <FaMicrophone />
            <span>Mute</span>
          </>
        ) : (
          <>
            <FaMicrophoneSlash />
            <span>Unmute</span>
          </>
        )}
      </button>

      <button
        className={`control-button ${
          !videoEnabled ? "control-button-off" : ""
        }`}
        onClick={toggleVideo}
        disabled={isScreenSharing}
      >
        {videoEnabled ? (
          <>
            <FaVideo />
            <span>Stop Video</span>
          </>
        ) : (
          <>
            <FaVideoSlash />
            <span>Start Video</span>
          </>
        )}
      </button>

      <button
        className={`control-button ${
          isScreenSharing ? "control-button-active" : ""
        }`}
        onClick={toggleScreenShare}
      >
        {isScreenSharing ? (
          <>
            <FaStop />
            <span>Stop Sharing</span>
          </>
        ) : (
          <>
            <FaDesktop />
            <span>Share Screen</span>
          </>
        )}
      </button>

      <button className="control-button" onClick={toggleParticipants}>
        <FaUserFriends />
        <span>Participants ({participantsCount})</span>
      </button>

      <button className="control-button chat-button" onClick={toggleChat}>
        <div className="chat-icon-container">
          <FaComments />
          {unreadChatCount > 0 && (
            <span className="chat-notification-badge">{unreadChatCount}</span>
          )}
        </div>
        <span>Chat</span>
      </button>

      <button
        className="control-button control-button-danger"
        onClick={leaveRoom}
      >
        <FaPhoneSlash />
        <span>Leave</span>
      </button>
    </div>
  );
};

export default Controls;
