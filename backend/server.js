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
  return filePath;
}

async function loadNewTextFiles() {
  console.log('Starting loadNewTextFiles...');
  await fs.mkdir(KNOWLEDGE_BASE_DIR, { recursive: true });
  const files = await fs.readdir(KNOWLEDGE_BASE_DIR);
  console.log('All files in directory:', files);
  
  const textFiles = files.filter(file => file.endsWith('.txt'));
  console.log('Text files found:', textFiles);

  const processedFiles = await loadProcessedFiles();
  console.log('Processed files:', processedFiles);
  
  const processedHashes = new Set(processedFiles.files);
  console.log('Processed file paths:', [...processedHashes]);

  const newFiles = [];
  for (const file of textFiles) {
      const filePath = join(KNOWLEDGE_BASE_DIR, file);
      const fileIdentifier = filePath; // Just use the file path as identifier
      console.log(`Checking file ${file}`);
      
      if (!processedHashes.has(fileIdentifier)) {
          console.log(`New file found: ${file}`);
          newFiles.push({ filePath, fileHash: fileIdentifier });
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

const MEMORY_FILE_PATH = join(__dirname, 'chat_memory.json');
const MAX_WORDS = 100;

app.post('/api/clear-memory', async (req, res) => {
  try {
      const emptyMemory = {
          userMessages: []
      };
      
      await saveMemory(emptyMemory);
      
      res.json({ message: 'Chat memory cleared successfully' });
  } catch (error) {
      console.error('Error clearing memory:', error);
      res.status(500).json({ error: 'Failed to clear chat memory' });
  }
});

async function loadMemory() {
  try {
      if (await fs.access(MEMORY_FILE_PATH).then(() => true).catch(() => false)) {
          const data = await fs.readFile(MEMORY_FILE_PATH, 'utf8');
          return JSON.parse(data);
      }
  } catch (error) {
      console.error('Error loading memory:', error);
  }
  return { userMessages: [] };  // Changed from conversations to userMessages
}

async function saveMemory(memory) {
  try {
      await fs.writeFile(MEMORY_FILE_PATH, JSON.stringify(memory, null, 2));
  } catch (error) {
      console.error('Error saving memory:', error);
  }
}

function truncateMemory(messages) {
  let wordCount = 0;
  const truncatedMessages = [];
  
  // Start from the most recent messages
  for (let i = messages.length - 1; i >= 0; i--) {
      const words = messages[i].message.split(/\s+/).length;
      if (wordCount + words <= MAX_WORDS) {
          truncatedMessages.unshift(messages[i]);
          wordCount += words;
      } else {
          break;
      }
  }
  
  return truncatedMessages;
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

const SYSTEM_TEMPLATE = `Yucca is a cheerful, positive, and respectful AI assistant for Universitas Ciputra. It calls users 'Entrepreneurs,' gives clear, accessible answers, and responds in Indonesian or English based on their language. Yucca is friendly, engaging, and focused on building conversations and learning more about the users, with a maximum of 75-word reply and a question to continue the chat. Use {memory} for knowledge only and do not answer previous questions. And {context} to answer: {question}.`; 

const LOADING_AUDIO_PATHS = [
  'loading_sounds/loading1.mp3',
  // 'loading_sounds/loading2.mp3',
  // 'loading_sounds/loading3.mp3',
  // 'loading_sounds/waiting1.mp3',
  // 'loading_sounds/waiting2.mp3'
];

const getRandomLoadingAudio = async () => {
  const randomIndex = Math.floor(Math.random() * LOADING_AUDIO_PATHS.length);
  const selectedPath = LOADING_AUDIO_PATHS[randomIndex];
  try {
      return {
          audio: await audioFileToBase64(selectedPath),
          path: selectedPath
      };
  } catch (error) {
      console.error('Error loading waiting audio:', error);
      return null;
  }
};

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!vectorStore) {
            return res.status(400).json({ error: 'Knowledge base not initialized' });
        }

        // Send initial loading audio
        const loadingAudio = await getRandomLoadingAudio();
        if (loadingAudio) {
            res.write(JSON.stringify({
                status: 'loading',
                audio: loadingAudio.audio
            }) + '\n');
            res.flush();
        }

        // Load and update memory
        const memory = await loadMemory();
        memory.userMessages.push({
            timestamp: new Date().toISOString(),
            message: message
        });
        
        // Truncate memory to keep only recent messages within word limit
        memory.userMessages = truncateMemory(memory.userMessages);
        await saveMemory(memory);

        // Format memory for prompt
        const memoryContext = memory.userMessages
            .map(msg => `User asked: ${msg.message}`)
            .join('\n');

        const prompt = PromptTemplate.fromTemplate(SYSTEM_TEMPLATE);

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
            question: message,  // The prompt template expects 'question' as the variable name
            memory: memoryContext || "No previous questions"
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

app.get("/api/intro", async (req, res) => {
    const messageData = {
      text: "Halo, Yucca di sini, ada yang bisa Yucca bantu?",
      audio: await audioFileToBase64(`audios/yucca_intro.wav`),
      lipsync: await readJsonTranscript(`audios/yucca_intro.json`),
    };
    res.send({ messsages: [messageData] });
  });
  
  app.get("/api/loading", async (req, res) => {
    const messageData = {
      text: "Bentar ya, Yucca lagi mikir",
      audio: await audioFileToBase64(`audios/yucca_lagi_mikir.wav`),
      lipsync: await readJsonTranscript(`audios/yucca_lagi_mikir.json`),
    };
    res.send({ messsages: [messageData] });
  });

// Modify the update endpoint to properly handle new files
app.post('/api/update', async (req, res) => {
  try {
      // Load existing vector store if it exists
      if (await vectorStoreExists()) {
          console.log('Loading existing vector store...');
          vectorStore = await FaissStore.load(VECTOR_STORE_PATH, embeddings);
      }

      // Process new files
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
          res.json({ 
              message: 'Knowledge base updated successfully',
              newDocuments: newDocs.length
          });
      } else {
          res.json({ 
              message: 'No new documents to process',
              newDocuments: 0
          });
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
