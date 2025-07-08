import React from "react";
import { FaTimes, FaUserMinus } from "react-icons/fa";
import "./ParticipantsList.css";

const ParticipantsList = ({ participants, onClose, onRemove }) => {
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
            <div className="participant-name">{participant.username}</div>
            {participant.id !== "self" && (
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
