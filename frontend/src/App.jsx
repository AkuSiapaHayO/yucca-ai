import React, { useState, useEffect } from "react";
import axios from "axios";

const App = () => {
  const [messages, setMessages] = useState([]); // Chat history
  const [userInput, setUserInput] = useState(""); // Current input
  const [listening, setListening] = useState(false); // STT state

  const serverUrl = "http://localhost:5000/api/chat"; // Backend endpoint

  // Handle user input submission
  const handleSend = async () => {
    if (!userInput.trim()) return;

    // Add user message to chat
    const newMessages = [...messages, { sender: "user", text: userInput }];
    setMessages(newMessages);

    try {
      // Send message to backend
      const { data } = await axios.post(serverUrl, { message: userInput });
      const botMessage = { sender: "bot", text: data.response };

      // Add bot message to chat
      setMessages((prevMessages) => [...prevMessages, botMessage]);

      // Convert bot response to speech
      speak(data.response);
    } catch (error) {
      console.error("Error sending message:", error);
    }

    setUserInput(""); // Clear input field
  };

  // Text-to-Speech (TTS)
  const speak = (text) => {
    if ("speechSynthesis" in window) {
      // Helper function to split text into natural chunks
      const splitIntoChunks = (text, maxLength = 100) => {
        const sentences = text.match(/[^.!?]+[.!?]*/g) || [text]; // Split into sentences
        const chunks = [];
        let currentChunk = "";
  
        sentences.forEach((sentence) => {
          if ((currentChunk + sentence).length <= maxLength) {
            currentChunk += sentence; // Add sentence to the current chunk
          } else {
            if (currentChunk) chunks.push(currentChunk); // Save the current chunk
            currentChunk = sentence; // Start a new chunk with the current sentence
          }
        });
  
        if (currentChunk) chunks.push(currentChunk); // Add the last chunk
  
        return chunks;
      };
  
      const chunks = splitIntoChunks(text, 100); // Adjust maxLength as needed
      chunks.forEach((chunk) => {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = "id-ID"; // Bahasa Indonesia
        window.speechSynthesis.speak(utterance);
      });
    } else {
      console.error("TTS not supported in this browser.");
    }
  };
  

  // Speech-to-Text (STT)
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = "id-ID"; // Set to Bahasa Indonesia
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      setUserInput(speechResult); // Set input to recognized speech
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
    };

    recognition.start();
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "auto" }}>
      <h1>Universitas Ciputra Chatbot</h1>
      <div style={{ border: "1px solid #ccc", padding: "10px", height: "400px", overflowY: "auto" }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ textAlign: msg.sender === "user" ? "right" : "left" }}>
            <p>
              <strong>{msg.sender === "user" ? "You" : "Yucca"}:</strong> {msg.text}
            </p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "10px" }}>
        <input
          type="text"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type your message..."
          style={{ width: "70%", marginRight: "10px" }}
        />
        <button onClick={handleSend}>Send</button>
        <button onClick={startListening} style={{ marginLeft: "10px" }}>
          {listening ? "Listening..." : "Speak"}
        </button>
      </div>
    </div>
  );
};

export default App;
