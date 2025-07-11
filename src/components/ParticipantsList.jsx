import React from "react";
import {
  FaTimes,
  FaUserMinus,
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaCrown,
} from "react-icons/fa";
import "./ParticipantsList.css";

const ParticipantsList = ({
  participants,
  onClose,
  onRemove,
  onHostMuteAudio,
  onHostMuteVideo,
  currentUsername,
  isHost = false, // New prop to determine if current user is host
}) => {
  return (
    <div className="participants-list">
      <div className="participants-header">
        <h3>Participants ({participants.length})</h3>
        <button className="close-button" onClick={onClose}>
          <FaTimes />
        </button>
      </div>

      <div className="participants-body">
        {participants.map((participant) => (
          <div key={participant.id} className="participant-item">
            <div className="participant-info">
              <div className="participant-name">
                {participant.username}
                {participant.isHost && (
                  <FaCrown className="host-icon" title="Host" />
                )}
              </div>
              <div className="participant-status">
                {participant.audioEnabled ? (
                  <FaMicrophone className="status-icon audio-on" />
                ) : (
                  <FaMicrophoneSlash className="status-icon audio-off" />
                )}
                {participant.videoEnabled ? (
                  <FaVideo className="status-icon video-on" />
                ) : (
                  <FaVideoSlash className="status-icon video-off" />
                )}
              </div>
            </div>

            {/* Host controls - only show if current user is host and target is not self */}
            {isHost && participant.id !== "self" && (
              <div className="host-controls">
                <button
                  className={`host-control-btn audio-control ${
                    participant.audioEnabled ? "mute-btn" : "unmute-btn"
                  }`}
                  onClick={() =>
                    onHostMuteAudio(
                      participant.peerId,
                      participant.audioEnabled
                    )
                  }
                  title={
                    participant.audioEnabled
                      ? "Mute participant"
                      : "Unmute participant"
                  }
                >
                  {participant.audioEnabled ? (
                    <FaMicrophoneSlash />
                  ) : (
                    <FaMicrophone />
                  )}
                </button>

                <button
                  className={`host-control-btn video-control ${
                    participant.videoEnabled
                      ? "disable-video-btn"
                      : "enable-video-btn"
                  }`}
                  onClick={() =>
                    onHostMuteVideo(
                      participant.peerId,
                      participant.videoEnabled
                    )
                  }
                  title={
                    participant.videoEnabled
                      ? "Turn off participant's camera"
                      : "Ask to turn on camera"
                  }
                >
                  {participant.videoEnabled ? <FaVideoSlash /> : <FaVideo />}
                </button>

                <button
                  className="host-control-btn remove-btn"
                  onClick={() => onRemove(participant.id)}
                  title="Remove participant"
                >
                  <FaUserMinus />
                </button>
              </div>
            )}

            {/* Remove button for non-host (existing functionality) */}
            {!isHost && participant.id !== "self" && (
              <button
                className="remove-button"
                onClick={() => onRemove(participant.id)}
                title="Remove participant"
              >
                <FaUserMinus />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantsList;
