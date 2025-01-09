require("dotenv").config();
const express = require("express");
const fs = require("fs").promises; // Use promise-based API directly
const fsSync = require("fs"); // For synchronous or callback-based usage
const bodyParser = require("body-parser");
const cors = require("cors");
const OpenAI = require("openai");
const { exec } = require("child_process");
//const voice = require("elevenlabs-node").default || require("elevenlabs-node");
const { ElevenLabsClient, play } = require("elevenlabs");
const app = express();
const PORT = 5000;

// Initialize OpenAI with your API key
const openai = new OpenAI({
  apiKey:
    "OpenAI API key",
});

const elevenlabs = new ElevenLabsClient({
  apiKey: "ElevenLabs API key", // Defaults to process.env.ELEVENLABS_API_KEY
});

// Middleware
app.use(cors({ origin: "http://localhost:5173" })); // Adjust origin as needed
app.use(bodyParser.json());

// Helper functions
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("Command execution error:", error);
        reject(error);
      }
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (messageIndex) => {
  try {
    await execCommand(
      `ffmpeg -y -i audios/message_${messageIndex}.mp3 audios/message_${messageIndex}.wav`,
    );
    await execCommand(
      `./bin/rhubarb -f json -o audios/message_${messageIndex}.json audios/message_${messageIndex}.wav -r phonetic`,
    );
  } catch (error) {
    console.error("Lip-sync command failed:", error);
    throw error;
  }
};

const readJsonTranscript = async (file) => {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading JSON transcript:", error);
    throw error;
  }
};

const audioFileToBase64 = async (file) => {
  try {
    const data = await fs.readFile(file);
    return data.toString("base64");
  } catch (error) {
    console.error("Error converting audio to Base64:", error);
    throw error;
  }
};

// Routes
app.get("/voice", async (req, res) => {
  try {
    const voices = await elevenlabs.voices.getAll();
    res.send(voices);
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "ft:gpt-4o-2024-08-06:personal:2-final-try:Amvzf1kd",
      messages: [
        {
          role: "system",
          content:
            "Yucca is an assistant chatbot that serves as Universitas Ciputra customer support and answers questions about Universitas Ciputra.",
        },
        { role: "user", content: message },
      ],
    });

    // Extract the response content
    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error("No content returned from GPT.");
    }

    console.log("Response content:", responseContent);

    // Assuming the response content is a single string, split into parts if necessary
    const messages = [responseContent]; // Split into an array if needed
    const processedMessages = [];

    for (let i = 0; i < messages.length; i++) {
      const textInput = messages[i];
      const fileName = `audios/message_${i}.mp3`;
      console.log("File name:", fileName);
      console.log("Text input:", textInput);

      // Generate audio using ElevenLabs
      const audio = await elevenlabs.generate({
        voice: "Martas",
        text: textInput,
        model_id: "eleven_multilingual_v2",
      });

      // Write audio file
      await fs.writeFile(fileName, audio);

      // Generate lip-sync JSON
      await lipSyncMessage(i);

      // Add audio and lip-sync data
      const messageData = {
        text: textInput,
        audio: await audioFileToBase64(fileName),
        lipsync: await readJsonTranscript(`audios/message_${i}.json`),
      };

      processedMessages.push(messageData);
    }
    res.send({ messages: processedMessages });
  } catch (error) {
    console.error("Error during GPT processing:", error);
    res.status(500).json({ error: "Failed to process text." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
