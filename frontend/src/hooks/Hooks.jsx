import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";

const ChatContext = createContext();
const serverUrl = "http://localhost:5000/api/chat"; // Backend endpoint

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]); // Chat history
  const [userInput, setUserInput] = useState(""); // Current input
  const [loading, setLoading] = useState(false); // Loading state
  const [listening, setListening] = useState(false); // Speech-to-Text state
  const [showHistory, setShowHistory] = useState(false); // Toggle chat history
  const [lipsync, setLipsync] = useState([]); // Lipsync data (mouthCues)
  const [audio, setAudio] = useState(null); // Audio file URL for playback
  const [message, setMessage] = useState(null); // Current bot message

  // Handles message playback completion
  const onMessagePlayed = () => {
    setMessages((prev) => prev.slice(1));
  };

  // Function to send user input to the backend and receive a response
  const chat = async (userMessage) => {
    if (!userMessage.trim()) return;

    setLoading(true);

    // Add user message to chat history
    setMessages((prev) => [...prev, { sender: "user", text: userMessage }]);

    try {
      const { data } = await axios.post(serverUrl, { message: userMessage });

      const botResponse = data.messages[0]; // Assuming the first response is relevant
      const botMessage = {
        sender: "bot",
        text: botResponse.text,
      };

      // Update lipsync data, audio URL, and bot message
      setLipsync(botResponse.lipsync?.mouthCues || []);
      setAudio(botResponse.audio || null);
      setMessage(botResponse.text);

      // Add bot message to chat history
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setLoading(false);
      setUserInput(""); // Clear input field
    }
  };

  // Handles Speech-to-Text recognition
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = "id-ID"; // Set language to Bahasa Indonesia
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      setUserInput(speechResult); // Set input field with recognized speech
      chat(speechResult); // Automatically send the transcribed text
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setListening(false);
    };

    recognition.start();
  };

  useEffect(() => {
    // Monitor and set the current bot message whenever the message history changes
    if (messages.length > 0) {
      const lastBotMessage = messages.find((msg) => msg.sender === "bot");
      setMessage(lastBotMessage?.text || null);
    } else {
      setMessage(null);
    }
  }, [messages]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        userInput,
        setUserInput,
        chat,
        showHistory,
        setShowHistory,
        startListening,
        listening,
        loading,
        lipsync,
        message,
        audio,
        onMessagePlayed, // Exposing the playback handler
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

