import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Increase request size limit for image uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Lazy initializer for Google Gen AI client to prevent startup crashes when key is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY is required. Please set it in the Secrets panel of AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

interface GeminiRequestParams {
  contents: any;
  config: any;
}

// Resilient wrapping helper designed to automatically failover to highly available alternative models
// upon encountering 503 high demand spikes or 429 rate limit exceptions.
async function callGeminiWithFallback(params: GeminiRequestParams) {
  const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let finalError = null;

  for (const modelName of models) {
    try {
      console.log(`[resilience] Procuring Gemini request via model: ${modelName}`);
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: params.config,
      });

      if (response && response.text) {
        console.log(`[resilience] Generation success. Selected Model: ${modelName}`);
        return response;
      }
      throw new Error(`Model ${modelName} returned an empty response body.`);
    } catch (err: any) {
      console.warn(`[resilience] Request with model ${modelName} failed or was temporary unavailable. Error detail:`, err.message || err);
      finalError = err;

      const errMsg = String(err.message || "").toLowerCase();
      // Intercept common network load constraints
      if (
        errMsg.includes("503") ||
        errMsg.includes("unavailable") ||
        errMsg.includes("demand") ||
        errMsg.includes("resource_exhausted") ||
        errMsg.includes("429") ||
        errMsg.includes("rate") ||
        errMsg.includes("overloaded") ||
        errMsg.includes("not found") ||
        errMsg.includes("404") ||
        errMsg.includes("empty")
      ) {
        console.warn(`[resilience] Service pressure encountered. Triggering delay and cascade to next model...`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      // For any other unexpected errors, try to cascade to ensure completion
      console.warn(`[resilience] Non-specific error. Cascading to next fallback chain candidate...`);
    }
  }

  throw finalError || new Error("All configured Gemini API models failed to successfully process the request.");
}

// Ensure error responses are standardized
const errorHandler = (res: express.Response, error: any) => {
  console.error("Backend Error:", error);
  res.status(500).json({
    error: error.message || "An unexpected error occurred on the server.",
  });
};

// --- API Endpoints ---

// Check server status
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Extract words from uploaded image using Gemini Vision OCR
app.post("/api/ocr", async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Image data is required" });
    }

    // Extract raw base64 and mimeType
    let base64Data = image;
    let mimeType = "image/png";

    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      const mimePart = parts[0];
      base64Data = parts[1];
      mimeType = mimePart.replace("data:", "");
    }

    const response = await callGeminiWithFallback({
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: "Extract all English vocabulary words, terms, or phrases written in this image. For each word/phrase extracted, generate its phonetic transcriptions (IPA), its concise Chinese translations, and a high-quality, illustrative example sentence showing how it is used, along with the sentence's Chinese translation. Make sure to generate accurate, professional and native phonetic symbols. Do not include random letters, small fragments, or numbers unless they form a cohesive English phrase in the context.",
        },
      ],
      config: {
        systemInstruction: "You are an expert English lexicographer and OCR tool. Extract vocabulary lists from images, and provide complete pronunciation, definition, and authentic sentence contexts.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { 
                type: Type.STRING, 
                description: "The extracted English word or idiomatic phrase, formatted neatly." 
              },
              phonetic: { 
                type: Type.STRING, 
                description: "The accurate IPA phonetic symbols, e.g. /əˈtʃiːv.mənt/ or /ðə/" 
              },
              translation: { 
                type: Type.STRING, 
                description: "One or more concise Chinese definitions/translations." 
              },
              sentence: { 
                type: Type.STRING, 
                description: "A natural English example sentence containing the word/phrase." 
              },
              sentenceTranslation: { 
                type: Type.STRING, 
                description: "The authentic Chinese translation of the example sentence." 
              },
            },
            required: ["word", "phonetic", "translation", "sentence", "sentenceTranslation"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Received empty response from the Gemini model.");
    }

    const words = JSON.parse(text.trim());
    res.json({ words });
  } catch (error: any) {
    errorHandler(res, error);
  }
});

// Generate phonetic/examples for list of manual/imported words
app.post("/api/generate-details", async (req, res) => {
  try {
    const { words } = req.body;
    if (!words || !Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: "A non-empty list of words is required" });
    }

    const response = await callGeminiWithFallback({
      contents: `Generate IPA phonetics, Chinese translations, and interactive example sentences for the following distinct English words: ${JSON.stringify(words)}. Return the results exactly fitting the requested schema.`,
      config: {
        systemInstruction: "You are a professional dictionary database compiler that generates IPA (UK/US standard), clean Chinese translations, and modern example sentences.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              phonetic: { type: Type.STRING, description: "IPA format, e.g., /ɪɡˈzæm.pəl/" },
              translation: { type: Type.STRING, description: "Chinese meanings" },
              sentence: { type: Type.STRING, description: "A high-quality example sentence" },
              sentenceTranslation: { type: Type.STRING, description: "Chinese translation of the sentence" },
            },
            required: ["word", "phonetic", "translation", "sentence", "sentenceTranslation"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Received empty response from the Gemini model.");
    }

    const wordDetailsList = JSON.parse(text.trim());
    res.json({ words: wordDetailsList });
  } catch (error: any) {
    errorHandler(res, error);
  }
});


// --- Vite Dev Server & Static Production Routing Setup ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware applied.");
  } else {
    // Production Mode
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static production assets from /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express custom server listening at http://localhost:${PORT}`);
  });
}

startServer();
