import express from 'express';
import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { FaissStore } from "langchain/vectorstores/faiss";
import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import cors from 'cors';
import bodyParser from 'body-parser';
import { ElevenLabsClient } from 'elevenlabs';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const memoryStore = new Map();

const createMemoryKey = (userId = 'default') => `memory_${userId}`;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(bodyParser.json());

// Paths for vector store and knowledge base
const VECTOR_STORE_PATH = join(__dirname, 'vectorstore');
const KNOWLEDGE_BASE_DIR = join(__dirname, 'knowledge_base');
const PROCESSED_FILES_PATH = join(VECTOR_STORE_PATH, 'processed_files.json');

// OpenAI model configuration
const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4",
    temperature: 0.7,
});

const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002",
});

let vectorStore = null;

const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
});

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
        const rhubarbPath = `"C:/Users/Karyna/Documents/Self Projects/Yucca AI/yucca-ai/backend/bin/rhubarb.exe"`;

        await execCommand(
            `ffmpeg -y -i audios/message_${messageIndex}.mp3 audios/message_${messageIndex}.wav`
        );

        await execCommand(
            `${rhubarbPath} -f json -o audios/message_${messageIndex}.json audios/message_${messageIndex}.wav -r phonetic`
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

// File and vector store management
async function loadProcessedFiles() {
    try {
        if (await fs.access(PROCESSED_FILES_PATH).then(() => true).catch(() => false)) {
            const data = await fs.readFile(PROCESSED_FILES_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error loading processed files:', error);
    }
    return { files: [] };
}

async function saveProcessedFiles(files) {
    try {
        await fs.mkdir(VECTOR_STORE_PATH, { recursive: true });
        await fs.writeFile(PROCESSED_FILES_PATH, JSON.stringify(files, null, 2));
    } catch (error) {
        console.error('Error saving processed files:', error);
    }
}

function vectorStoreExists() {
    return fs.access(join(VECTOR_STORE_PATH, 'faiss.index')).then(() => true).catch(() => false);
}

async function getFileHash(filePath) {
    const stats = await fs.stat(filePath);
    return `${filePath}-${stats.mtime.getTime()}`;
}

async function loadNewTextFiles() {
    await fs.mkdir(KNOWLEDGE_BASE_DIR, { recursive: true });
    const files = await fs.readdir(KNOWLEDGE_BASE_DIR);
    const textFiles = files.filter(file => file.endsWith('.txt'));

    const processedFiles = await loadProcessedFiles();
    const processedHashes = new Set(processedFiles.files);

    const newFiles = [];

    for (const file of textFiles) {
        const filePath = join(KNOWLEDGE_BASE_DIR, file);
        const fileHash = await getFileHash(filePath);

        if (!processedHashes.has(fileHash)) {
            newFiles.push({ filePath, fileHash });
        }
    }

    if (newFiles.length === 0) {
        console.log('No new files to process');
        return null;
    }

    let allDocs = [];

    for (const { filePath, fileHash } of newFiles) {
        console.log(`Loading file: ${filePath}`);
        const loader = new TextLoader(filePath);
        const docs = await loader.load();
        allDocs = allDocs.concat(docs);
        processedFiles.files.push(fileHash);
    }

    await saveProcessedFiles(processedFiles);
    return allDocs;
}

async function initializeKnowledgeBase(forceReload = false) {
    try {
        if (forceReload) {
            await saveProcessedFiles({ files: [] });
        }

        if (!forceReload && await vectorStoreExists()) {
            console.log('Loading existing vector store from disk...');
            vectorStore = await FaissStore.load(VECTOR_STORE_PATH, embeddings);
            console.log('Vector store loaded successfully');
        } else {
            const newDocs = await loadNewTextFiles();

            if (newDocs) {
                console.log(`Processing ${newDocs.length} new documents`);
                const textSplitter = new RecursiveCharacterTextSplitter({
                    chunkSize: 1000,
                    chunkOverlap: 200,
                });
                const splitDocs = await textSplitter.splitDocuments(newDocs);

                if (vectorStore) {
                    await vectorStore.addDocuments(splitDocs);
                    console.log('Added new documents to existing vector store');
                } else {
                    vectorStore = await FaissStore.fromDocuments(splitDocs, embeddings);
                    console.log('Created new vector store');
                }

                await vectorStore.save(VECTOR_STORE_PATH);
                console.log('Vector store saved successfully');
            } else if (!vectorStore) {
                throw new Error('No existing vector store and no documents to process');
            }
        }

        return true;
    } catch (error) {
        console.error('Error initializing knowledge base:', error);
        return false;
    }
}

// API Endpoints
app.post('/api/init', async (req, res) => {
    try {
        const success = await initializeKnowledgeBase(true);
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

const SYSTEM_TEMPLATE = `Yucca is a positive, encouraging, and respectful AI assistant for Universitas Ciputra. It uses simple, clear language to ensure accessibility and responds in Indonesian or English based on the user’s language. Yucca is helpful and welcoming, fostering trust and approachability in every interaction.
You are given the context to help answer: {context}. Given the context information, answer the question: {question}`;

const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!vectorStore) {
            return res.status(400).json({ error: 'Knowledge base not initialized' });
        }

        const chain = RetrievalQAChain.fromLLM(
            model,
            vectorStore.asRetriever(),
            {
                prompt,
                returnSourceDocuments: true,
                verbose: true,
            }
        );

        const response = await chain.call({ 
            query: message,
            question: message  // The prompt template expects 'question' as the variable name
        });

        const textInput = response.text;
        const fileName = `audios/message_0.mp3`;

        const audio = await elevenlabs.generate({
            voice: "Aria",
            text: textInput,
            model_id: "eleven_multilingual_v2",
        });

        await fs.writeFile(fileName, audio);
        await lipSyncMessage(0);

        const messageData = {
            text: textInput,
            audio: await audioFileToBase64(fileName),
            lipsync: await readJsonTranscript(`audios/message_0.json`),
        };

        res.send({ messages: [messageData] });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});
app.post('/api/update', async (req, res) => {
    try {
        const success = await initializeKnowledgeBase(false);
        if (success) {
            res.json({ message: 'Knowledge base updated successfully' });
        } else {
            res.status(500).json({ error: 'Failed to update knowledge base' });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to update knowledge base' });
    }
});

// Start the server
app.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Initializing knowledge base...');
    await initializeKnowledgeBase();
    console.log('Server ready for queries');
    console.log('Place new .txt files in the knowledge_base directory');
});
