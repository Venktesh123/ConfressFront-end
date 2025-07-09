import React, { useState, useEffect, useRef } from "react";
import {
  FaPaperPlane,
  FaTimes,
  FaComments,
  FaUser,
  FaSmile,
  FaCrown,
  FaLock,
} from "react-icons/fa";
import "./Chat.css";

const Chat = ({
  socket,
  roomId,
  username,
  isOpen,
  onClose,
  unreadCount,
  onMessageRead,
}) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && onMessageRead) {
      onMessageRead();
    }
  }, [isOpen, onMessageRead]);

  useEffect(() => {
    if (!socket) return;

    // Listen for all types of messages
    const handleChatMessage = (messageData) => {
      console.log("Received chat message:", messageData);
      setMessages((prev) => [...prev, { ...messageData, chatMode: "public" }]);

      // If chat is not open, trigger unread count
      if (!isOpen && messageData.username !== username) {
        // This will be handled by parent component through onMessageRead
      }
    };

    const handlePrivateMessage = (messageData) => {
      console.log("Received private message:", messageData);
      setMessages((prev) => [...prev, { ...messageData, chatMode: "private" }]);

      if (!isOpen && messageData.username !== username) {
        // Handle unread count for private messages
      }
    };

    const handleHostMessage = (messageData) => {
      console.log("Received host message:", messageData);
      setMessages((prev) => [
        ...prev,
        { ...messageData, chatMode: "host-only" },
      ]);

      if (!isOpen && messageData.username !== username) {
        // Handle unread count for host messages
      }
    };

    const handleSystemMessage = (messageData) => {
      console.log("Received system message:", messageData);
      setMessages((prev) => [...prev, { ...messageData, type: "system" }]);
    };

    const handleTyping = ({ username: typingUsername, isTyping: typing }) => {
      setTypingUsers((prev) => {
        if (typing) {
          // Add user to typing list if not already there
          if (!prev.includes(typingUsername) && typingUsername !== username) {
            return [...prev, typingUsername];
          }
        } else {
          // Remove user from typing list
          return prev.filter((user) => user !== typingUsername);
        }
        return prev;
      });
    };

    const handleChatError = ({ message }) => {
      console.error("Chat error:", message);
      // You could show this error in the chat or as a notification
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          message: `Error: ${message}`,
          timestamp: new Date(),
          type: "system",
          systemType: "error",
        },
      ]);
    };

    // Set up all event listeners
    socket.on("chat-message", handleChatMessage);
    socket.on("private-message", handlePrivateMessage);
    socket.on("host-message", handleHostMessage);
    socket.on("chat-system-message", handleSystemMessage);
    socket.on("user-typing", handleTyping);
    socket.on("chat-error", handleChatError);

    // Clean up event listeners
    return () => {
      socket.off("chat-message", handleChatMessage);
      socket.off("private-message", handlePrivateMessage);
      socket.off("host-message", handleHostMessage);
      socket.off("chat-system-message", handleSystemMessage);
      socket.off("user-typing", handleTyping);
      socket.off("chat-error", handleChatError);
    };
  }, [socket, username, isOpen, onMessageRead]);

  const sendMessage = (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !socket) return;

    const messageData = {
      roomId,
      username,
      message: newMessage.trim(),
      timestamp: new Date(),
      type: "user",
    };

    // Send public message by default
    socket.emit("send-chat-message", messageData);
    setNewMessage("");

    // Stop typing indicator
    if (isTyping) {
      setIsTyping(false);
      socket.emit("typing-indicator", {
        roomId,
        username,
        isTyping: false,
      });
    }
  };

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);

    if (!socket) return;

    // Handle typing indicator
    if (!isTyping) {
      setIsTyping(true);
      socket.emit("typing-indicator", {
        roomId,
        username,
        isTyping: true,
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit("typing-indicator", {
        roomId,
        username,
        isTyping: false,
      });
    }, 1000);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString();
    }
  };

  const shouldShowDateSeparator = (currentMessage, previousMessage) => {
    if (!previousMessage) return true;

    const currentDate = new Date(currentMessage.timestamp).toDateString();
    const previousDate = new Date(previousMessage.timestamp).toDateString();

    return currentDate !== previousDate;
  };

  const getMessageGrouping = (messages) => {
    const grouped = [];
    let currentGroup = null;

    messages.forEach((message, index) => {
      const prevMessage = messages[index - 1];
      const nextMessage = messages[index + 1];

      // Check if this message should start a new group
      const shouldStartNewGroup =
        !prevMessage ||
        prevMessage.username !== message.username ||
        prevMessage.type !== message.type ||
        prevMessage.chatMode !== message.chatMode ||
        new Date(message.timestamp) - new Date(prevMessage.timestamp) > 300000; // 5 minutes

      // Check if this is the last message in a group
      const isLastInGroup =
        !nextMessage ||
        nextMessage.username !== message.username ||
        nextMessage.type !== message.type ||
        nextMessage.chatMode !== message.chatMode ||
        new Date(nextMessage.timestamp) - new Date(message.timestamp) > 300000;

      if (shouldStartNewGroup) {
        currentGroup = {
          ...message,
          messages: [message],
          isLastInGroup,
        };
        grouped.push(currentGroup);
      } else {
        currentGroup.messages.push(message);
        currentGroup.isLastInGroup = isLastInGroup;
      }
    });

    return grouped;
  };

  const getMessageIcon = (chatMode) => {
    switch (chatMode) {
      case "private":
        return <FaLock className="message-mode-icon" title="Private message" />;
      case "host-only":
        return <FaCrown className="message-mode-icon" title="Host message" />;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  const messageGroups = getMessageGrouping(messages);

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="chat-title">
          <FaComments />
          <span>Chat</span>
          {unreadCount > 0 && (
            <span className="unread-badge">{unreadCount}</span>
          )}
        </div>
        <button className="chat-close-button" onClick={onClose}>
          <FaTimes />
        </button>
      </div>

      <div className="chat-messages">
        {messageGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            {shouldShowDateSeparator(group, messageGroups[groupIndex - 1]) && (
              <div className="date-separator">
                <span>{formatDate(group.timestamp)}</span>
              </div>
            )}

            <div
              className={`message-group ${
                group.type === "system" ? "system" : ""
              } ${group.username === username ? "own" : "other"} ${
                group.chatMode === "private" ? "private" : ""
              } ${group.chatMode === "host-only" ? "host-only" : ""}`}
            >
              {group.type !== "system" && (
                <div className="message-header">
                  <div className="message-avatar">
                    <FaUser />
                  </div>
                  <div className="message-info">
                    <div className="message-username-container">
                      <span className="message-username">{group.username}</span>
                      {getMessageIcon(group.chatMode)}
                    </div>
                    <span className="message-time">
                      {formatTime(group.timestamp)}
                    </span>
                  </div>
                </div>
              )}

              <div className="message-content">
                {group.messages.map((message, messageIndex) => (
                  <div
                    key={messageIndex}
                    className={`message-text ${group.type} ${
                      group.chatMode || ""
                    }`}
                  >
                    {message.message}
                    {messageIndex === group.messages.length - 1 &&
                      group.type !== "system" && (
                        <span className="message-time-inline">
                          {formatTime(message.timestamp)}
                        </span>
                      )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            <div className="typing-avatar">
              <FaUser />
            </div>
            <div className="typing-content">
              <span className="typing-text">
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing...`
                  : `${typingUsers.slice(0, -1).join(", ")} and ${
                      typingUsers[typingUsers.length - 1]
                    } are typing...`}
              </span>
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={sendMessage}>
        <div className="chat-input-container">
          <input
            ref={chatInputRef}
            type="text"
            value={newMessage}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="chat-input"
            maxLength={500}
          />
          <button
            type="submit"
            className="chat-send-button"
            disabled={!newMessage.trim()}
          >
            <FaPaperPlane />
          </button>
        </div>
      </form>
    </div>
  );
};

export default Chat;
