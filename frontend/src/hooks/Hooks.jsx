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
  const [lipsync, setLipsync] = useState(null); // Lipsync data (mouthCues)
  const [audio, setAudio] = useState(null); // Audio file URL for playback
  const [message, setMessage] = useState(null); // Current message

  const onMessagePlayed = () => {
    setMessages((messages) => messages.slice(1));
  };

  // Handle user input submission
  const chat = async (message) => {
    if (!message.trim()) return;

    setLoading(true);

    // Add user message to chat
    setMessages((prev) => [...prev, { sender: "user", text: message }]);
    console.log("messages at hook:", messages);

    try {
      const { data } = await axios.post(serverUrl, { message });
      console.log("data at hook:", data);
      const botMessage = {
        sender: "bot",
        text: data.messages[0].text,
      };

      // Update lipsync data with the response
      setLipsync(data.messages[0].lipsync?.mouthCues || []);
      setAudio(data.messages[0].audio); // Set audio URL for playback
      setMessage(data.messages[0].text);
      console.log("lipsync at hook:", lipsync);
      console.log("audio at hook:", audio);
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
    }

    setLoading(false);
    setUserInput(""); // Clear input field
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

  //useEffect(() => {
  //  if (messages.length > 0) {
  //    setMessage(messages[0]); // Set the current message
  //  } else {
  //    setMessage(null);
  //  }
  //  console.log("message at hook:", message);
  //}, [messages]);

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
        lipsync, // Providing lipsync data to the context
        message, // Providing the latest message
        audio, // Providing the audio URL for playback
        clearMemory,
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

const clearMemory = async () => {
  try {
    await axios.post("http://localhost:5000/api/clear-memory");
    setMessages([]); // Clear local messages state
  } catch (error) {
    console.error("Failed to clear chat memory:", error);
    throw error;
  }
};
