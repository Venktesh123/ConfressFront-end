import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Home.css";

const API_URL = "http://localhost:5000";

const Home = () => {
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const createRoom = async () => {
    if (!username) {
      alert("Please enter your name");
      return;
    }

    setIsCreating(true);
    try {
      const response = await axios.post(`${API_URL}/api/room`);
      const { roomId } = response.data;
      navigate(`/room/${roomId}`, { state: { username } });
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Failed to create room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoom = () => {
    if (!username) {
      alert("Please enter your name");
      return;
    }

    if (!roomId) {
      alert("Please enter a room ID");
      return;
    }

    navigate(`/room/${roomId}`, { state: { username } });
  };

  return (
    <div className="home">
      <div className="home-container">
        <h1>Video Conference App</h1>
        <div className="input-group">
          <label>Your Name</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your name"
          />
        </div>

        <div className="button-group">
          <button
            className="create-button"
            onClick={createRoom}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "Create New Meeting"}
          </button>

          <div className="divider">
            <span>OR</span>
          </div>

          <div className="input-group">
            <label>Room ID</label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter room ID"
            />
          </div>

          <button className="join-button" onClick={joinRoom}>
            Join Meeting
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
