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

dotenv.config();

const app = express();
app.use(express.json());

const VECTOR_STORE_PATH = join(__dirname, 'vectorstore');
const KNOWLEDGE_BASE_DIR = join(__dirname, 'knowledge_base');
const PROCESSED_FILES_PATH = join(__dirname, 'vectorstore', 'processed_files.json');
let vectorStore = null;

const model = new ChatOpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "gpt-4",
    temperature: 0.7,
});

const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
    modelName: "text-embedding-ada-002"
});

// Function to load processed files list
function loadProcessedFiles() {
    try {
        if (fs.existsSync(PROCESSED_FILES_PATH)) {
            const data = fs.readFileSync(PROCESSED_FILES_PATH, 'utf8');
            const parsed = JSON.parse(data);
            // Ensure files property exists and is an array
            if (!parsed.files || !Array.isArray(parsed.files)) {
                console.log('Invalid processed files format, resetting to empty array');
                return { files: [] };
            }
            return parsed;
        }
    } catch (error) {
        console.error('Error loading processed files:', error);
    }
    return { files: [] };
}

// Function to save processed files list
function saveProcessedFiles(files) {
    try {
        if (!fs.existsSync(VECTOR_STORE_PATH)) {
            fs.mkdirSync(VECTOR_STORE_PATH, { recursive: true });
        }
        // Ensure we're saving a valid structure
        const dataToSave = { files: Array.isArray(files.files) ? files.files : [] };
        fs.writeFileSync(PROCESSED_FILES_PATH, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Error saving processed files:', error);
    }
}

// Function to check if vector store exists
function vectorStoreExists() {
    return fs.existsSync(VECTOR_STORE_PATH) && 
           fs.existsSync(join(VECTOR_STORE_PATH, 'faiss.index')) &&
           fs.existsSync(join(VECTOR_STORE_PATH, 'docstore.json'));
}

// Function to get file hash (using last modified time as simple hash)
function getFileHash(filePath) {
    const stats = fs.statSync(filePath);
    return `${filePath}-${stats.mtime.getTime()}`;
}

// Function to load new text files
async function loadNewTextFiles() {
    if (!fs.existsSync(KNOWLEDGE_BASE_DIR)) {
        fs.mkdirSync(KNOWLEDGE_BASE_DIR);
        console.log('Created knowledge_base directory');
    }

    const files = fs.readdirSync(KNOWLEDGE_BASE_DIR);
    const textFiles = files.filter(file => file.endsWith('.txt'));
    
    const processedFiles = loadProcessedFiles();
    console.log('Loaded processed files:', processedFiles);

    // Ensure processedFiles.files is an array
    if (!Array.isArray(processedFiles.files)) {
        console.log('Processed files is not an array, resetting');
        processedFiles.files = [];
    }

    const processedHashes = new Set(processedFiles.files);
    console.log('Created Set from processed files');

    const newFiles = textFiles.filter(file => {
        const filePath = join(KNOWLEDGE_BASE_DIR, file);
        const fileHash = getFileHash(filePath);
        return !processedHashes.has(fileHash);
    });

    if (newFiles.length === 0) {
        console.log('No new files to process');
        return null;
    }

    console.log(`Found ${newFiles.length} new files:`, newFiles);
    
    let allDocs = [];
    let newHashes = [];
    
    for (const file of newFiles) {
        const filePath = join(KNOWLEDGE_BASE_DIR, file);
        const fileHash = getFileHash(filePath);
        console.log(`Loading file: ${file}`);
        const loader = new TextLoader(filePath);
        const docs = await loader.load();
        allDocs = allDocs.concat(docs);
        newHashes.push(fileHash);
    }
    
    // Update processed files list
    processedFiles.files = [...processedFiles.files, ...newHashes];
    saveProcessedFiles(processedFiles);
    
    return allDocs;
}

// Initialize knowledge base
async function initializeKnowledgeBase(forceReload = false) {
    try {
        // For force reload, clear the processed files list
        if (forceReload) {
            saveProcessedFiles({ files: [] });
        }

        // Load or create vector store
        if (!forceReload && vectorStoreExists()) {
            console.log('Loading existing vector store from disk...');
            vectorStore = await FaissStore.load(
                VECTOR_STORE_PATH,
                embeddings
            );
            console.log('Vector store loaded successfully');
        } else {
            vectorStore = null;
        }

        // Load new documents
        const newDocs = await loadNewTextFiles();
        
        if (newDocs) {
            console.log(`Processing ${newDocs.length} new documents`);
            
            // Split documents into chunks
            const textSplitter = new RecursiveCharacterTextSplitter({
                chunkSize: 1000,
                chunkOverlap: 200,
            });
            const splitDocs = await textSplitter.splitDocuments(newDocs);
            console.log('Documents split into', splitDocs.length, 'chunks');

            // Create or extend vector store
            if (vectorStore) {
                // Add new documents to existing store
                await vectorStore.addDocuments(splitDocs);
                console.log('Added new documents to existing vector store');
            } else {
                // Create new store
                vectorStore = await FaissStore.fromDocuments(
                    splitDocs,
                    embeddings
                );
                console.log('Created new vector store');
            }

            // Save to disk
            await vectorStore.save(VECTOR_STORE_PATH);
            console.log('Vector store saved successfully');
        } else if (!vectorStore) {
            throw new Error('No existing vector store and no documents to process');
        }

        return true;
    } catch (error) {
        console.error('Error initializing knowledge base:', error);
        return false;
    }
}

// Rest of your existing endpoints remain the same...
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

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!vectorStore) {
            return res.status(400).json({ error: 'Knowledge base not initialized' });
        }

        const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever(), {
            returnSourceDocuments: true,
            verbose: true
        });

        const response = await chain.call({
            query: message
        });

        res.json({ 
            response: response.text,
        });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ error: 'Failed to process chat message' });
    }
});

// Add new endpoint to process only new files
app.post('/api/update', async (req, res) => {
    try {
        const success = await initializeKnowledgeBase(false); // Don't force reload
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Using GPT-4 model for responses`);
    console.log('Initializing knowledge base...');
    await initializeKnowledgeBase();
    console.log(`Server ready for queries`);
    console.log(`Place new .txt files in the 'knowledge_base' directory`);
});