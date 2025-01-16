import express from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';
import { FaissStore } from "langchain/vectorstores/faiss";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const VECTOR_STORE_PATH = join(__dirname, 'vectorstore');
let vectorStore = null;

// Initialize OpenAI with GPT-4
const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4", // Specifically using GPT-4
    temperature: 0.7,
});

// Initialize embeddings with separate configuration
const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002" // Using the recommended embeddings model
});

// Function to check if vector store exists
function vectorStoreExists() {
    return fs.existsSync(VECTOR_STORE_PATH) && 
           fs.existsSync(join(VECTOR_STORE_PATH, 'faiss.index')) &&
           fs.existsSync(join(VECTOR_STORE_PATH, 'docstore.json'));
}

// Initialize knowledge base
async function initializeKnowledgeBase(forceReload = false) {
    try {
        // Check for existing vector store
        if (!forceReload && vectorStoreExists()) {
            console.log('Loading existing vector store from disk...');
            vectorStore = await FaissStore.load(
                VECTOR_STORE_PATH,
                embeddings
            );
            console.log('Vector store loaded successfully');
            return true;
        }

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

        // Create vector store
        vectorStore = await FaissStore.fromDocuments(
            splitDocs,
            embeddings
        );

        // Save to disk
        await vectorStore.save(VECTOR_STORE_PATH);
        console.log('Vector store created and saved successfully');

        return true;
    } catch (error) {
        console.error('Error initializing knowledge base:', error);
        return false;
    }
}

// Endpoint to initialize knowledge base
app.post('/api/init', async (req, res) => {
    try {
        const success = await initializeKnowledgeBase(true); // Force reload
        
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
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Using GPT-4 model for responses`);
    console.log('Initializing knowledge base...');
    await initializeKnowledgeBase();
    console.log(`Server ready for queries`);
    console.log(`Make sure kb.txt is in the same directory as server.js`);
});