import React, { useState } from "react";
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

  const [isLoading, setIsLoading] = useState(false);

  const handleSend = (input) => {
    setIsLoading(true);
    chat(input).finally(() => {
      setIsLoading(false); // Stop loading after chat is complete
    });
  };

  return (
    <>
      {isLoading && (
        <div
          style={{
            textAlign: "center",
            position: "fixed",
            top: "20%", // Move to the top of the screen
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 20, // Ensure it's on top
          }}
        >
          <div className="bobbing-dots">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        </div>
      )}
      <div
        style={{
          position: "fixed",
          bottom: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "95%",
          maxWidth: "400px",
          padding: "12px",
          backgroundColor: "#FFE3C3",
          boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.2)",
          borderRadius: "8px",
          zIndex: 10,
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            fontSize: "16px",
            fontWeight: "600",
            marginBottom: "8px",
            textAlign: "center",
            color: "#892006",
            cursor: "pointer",
          }}
          onClick={() => setShowHistory((prev) => !prev)}
        >
          Ask Yucca {showHistory ? "▲" : "▼"}
        </h1>
        {showHistory && (
          <div
            style={{
              border: "1px solid #FF8D43",
              padding: "8px",
              height: "80px",
              overflowY: "auto",
              backgroundColor: "#FBD3A0",
              borderRadius: "6px",
              marginBottom: "12px",
            }}
          >
            {messages.length === 0 ? (
              <p style={{ textAlign: "center", color: "#999" }}>
                No messages yet.
              </p>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    textAlign: msg.sender === "user" ? "right" : "left",
                    marginBottom: "8px",
                  }}
                >
                  <p style={{ margin: 0, color: "#333" }}>
                    <strong>{msg.sender === "user" ? "You" : "Yucca"}:</strong>{" "}
                    {msg.text}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend(userInput)}
              placeholder="Type your message..."
              style={{
                flexGrow: 1,
                padding: "8px",
                border: "1px solid #FF8D43",
                borderRadius: "6px",
                outline: "none",
                fontSize: "14px",
                boxSizing: "border-box",
                backgroundColor: "#FFE3C3",
              }}
            />
            <button
              onClick={() => handleSend(userInput)}
              style={{
                padding: "8px 12px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#FF611F",
                color: "#fff",
                fontSize: "14px",
                cursor: "pointer",
                boxSizing: "border-box",
              }}
              onMouseOver={(e) => (e.target.style.backgroundColor = "#FF480A")} // Darker accent
              onMouseOut={(e) => (e.target.style.backgroundColor = "#FF611F")}
            >
              Send
            </button>
          </div>
          <button
            onClick={startListening}
            style={{
              width: "100%",
              padding: "8px",
              border: "none",
              borderRadius: "6px",
              backgroundColor: listening ? "#FFCD72" : "#FF9D27",
              color: "#fff",
              fontSize: "14px",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {listening ? "Listening..." : "Speak"}
          </button>
        </div>
        <style>
          {`
          @media (max-width: 768px) {
            div[style*="height: 150px"] {
              height: 100px;
            }
            h1 {
              font-size: 14px;
              margin-bottom: 6px;
            }
            input, button {
              font-size: 13px;
              padding: 6px;
            }
            button[style*="padding: 8px 12px"] {
              padding: 6px 10px;
            }
          }

          .bobbing-dots {
            display: flex;
            justify-content: center;
            gap: 6px;
          }

          .dot {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background-color: #892006;
            animation: bob 1.5s ease-in-out infinite;
          }

          .dot:nth-child(1) {
            animation-delay: 0s;
          }
          
          .dot:nth-child(2) {
            animation-delay: 0.2s;
          }
          
          .dot:nth-child(3) {
            animation-delay: 0.4s;
          }

          @keyframes bob {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-8px);
            }
          }
        `}
        </style>
      </div>
    </>
  );
};

export default Interface;
