// server.js
import express from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI, OpenAI } from '@langchain/openai';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Initialize OpenAI with GPT-4
const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4o", // Specifically using GPT-4
    temperature: 0.7,
});

// Initialize embeddings with separate configuration
const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002" // Using the recommended embeddings model
});

let vectorStore = null;

// Initialize knowledge base
async function initializeKnowledgeBase() {
    try {
        // Load the local kb.txt file
        const filePath = join(__dirname, 'kb.txt');
        console.log('Loading knowledge base from:', filePath);
        
        const loader = new TextLoader(filePath);
        const docs = await loader.load();
        console.log('Documents loaded successfully');

        // Split documents into chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const splitDocs = await textSplitter.splitDocuments(docs);
        console.log('Documents split into', splitDocs.length, 'chunks');

        // Create and store vectors using MemoryVectorStore
        vectorStore = await MemoryVectorStore.fromDocuments(
            splitDocs,
            embeddings // Using the configured embeddings
        );
        console.log('Vector store created successfully');

        return true;
    } catch (error) {
        console.error('Error initializing knowledge base:', error);
        return false;
    }
}

// Endpoint to initialize knowledge base
app.post('/api/init', async (req, res) => {
    try {
        const success = await initializeKnowledgeBase();
        
        if (success) {
            res.json({ message: 'Knowledge base initialized successfully' });
        } else {
            res.status(500).json({ error: 'Failed to initialize knowledge base' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to initialize knowledge base' });
    }
});

// Endpoint to chat
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!vectorStore) {
            return res.status(400).json({ error: 'Knowledge base not initialized' });
        }

        // Create a chain that combines the knowledge base with the language model
        const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever(), {
            returnSourceDocuments: true, // Include source documents in the response
            verbose: true // For debugging purposes
        });

        // Get response from the chain
        const response = await chain.call({
            query: message
        });

        res.json({ 
            response: response.text,
            // You can uncomment the following line if you want to see the source documents
            // sources: response.sourceDocuments 
        });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Using GPT-4 model for responses`);
    console.log(`Make sure kb.txt is in the same directory as server.js`);
});