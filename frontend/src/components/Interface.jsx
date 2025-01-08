import React from "react";
import { useChat } from "../hooks/Hooks";

const Interface = () => {
  const {
    messages,
    userInput,
    setUserInput,
    chat,
    showHistory,
    setShowHistory,
    startListening,
    listening,
  } = useChat();

  return (
    <div
      style={{
        position: "absolute",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "10px",
        maxWidth: "400px",
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.2)",
        zIndex: 10,
        borderRadius: "8px",
      }}
    >
      <h1
        style={{
          fontSize: "18px",
          marginBottom: "8px",
          cursor: "pointer",
        }}
        onClick={() => setShowHistory((prev) => !prev)}
      >
        Universitas Ciputra Chatbot {showHistory ? "▲" : "▼"}
      </h1>
      {showHistory && (
        <div
          style={{
            border: "1px solid #ccc",
            padding: "10px",
            height: "200px",
            overflowY: "auto",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            borderRadius: "6px",
            marginBottom: "10px",
          }}
        >
          {messages.map((msg, index) => (
            <div
              key={index}
              style={{
                textAlign: msg.sender === "user" ? "right" : "left",
                marginBottom: "10px",
              }}
            >
              <p>
                <strong>{msg.sender === "user" ? "You" : "Yucca"}:</strong>{" "}
                {msg.text}
              </p>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && chat(userInput)}
          placeholder="Type your message..."
          style={{
            flexGrow: 1,
            padding: "8px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            outline: "none",
          }}
        />
        <button
          onClick={() => chat(userInput)}
          style={{
            padding: "8px 12px",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#007BFF",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Send
        </button>
        <button
          onClick={startListening}
          style={{
            padding: "8px 12px",
            border: "none",
            borderRadius: "4px",
            backgroundColor: listening ? "#28A745" : "#6C757D",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {listening ? "Listening..." : "Speak"}
        </button>
      </div>
    </div>
  );
};

export default Interface;

