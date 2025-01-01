require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = 5000;

// Initialize OpenAI with your API key
const openai = new OpenAI({ 
    apiKey: "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"
});

// Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(bodyParser.json());

// Route for chatbot logic
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required." });
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "ft:gpt-3.5-turbo-0125:personal::Akb0PWXJ",
            messages: [
                { role: "system", "content": "Yucca is an assistant chatbot that serve as Universitas Ciputra customer support and answer question about Universitas Ciputra."},
                { role: "user", content: message }
            ],
        });

        res.json({ response: completion.choices[0].message.content });
    } catch (error) {
        console.error("Error during GPT processing:", error);
        res.status(500).json({ error: "Failed to process text." });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
