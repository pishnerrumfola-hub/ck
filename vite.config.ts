import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Lazy initializer for Google Gen AI client
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

// Resilient wrapping helper
async function callGeminiWithFallback(params: GeminiRequestParams) {
  const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let finalError = null;

  for (const modelName of models) {
    try {
      console.log(`[resilience-config] Requesting model: ${modelName}`);
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: modelName,
        contents: params.contents,
        config: params.config,
      });

      if (response && response.text) {
        return response;
      }
      throw new Error(`Model ${modelName} returned empty text`);
    } catch (err: any) {
      console.warn(`[resilience-config] Error with ${modelName}:`, err.message || err);
      finalError = err;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw finalError || new Error("All fallback models failed.");
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-fallback-middleware',
        configureServer(server) {
          // Mount body parsers
          server.middlewares.use(express.json({ limit: '15mb' }));
          server.middlewares.use(express.urlencoded({ limit: '15mb', extended: true }));

          // Intercept /api/ocr POST
          server.middlewares.use(async (req, res, next) => {
            const urlObj = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            
            if (urlObj.pathname === '/api/ocr' && req.method === 'POST') {
              try {
                const { image } = (req as any).body || {};
                if (!image) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Image data is required" }));
                  return;
                }

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
                      text: "Extract all English vocabulary words, terms, or phrases written in this image. For each word/phrase extracted, generate its phonetic transcriptions (IPA), its concise Chinese translations, and a high-quality, illustrative example sentence showing how it is used, along with the sentence's Chinese translation. Make sure to generate accurate, professional and native phonetic symbols. Do not include random letters, small fragments, or numbers unless they form a cohesive English phrase in the context."
                    }
                  ],
                  config: {
                    systemInstruction: "You are an expert English lexicographer and OCR tool. Extract vocabulary lists from images, and provide complete pronunciation, definition, and authentic sentence contexts.",
                    responseMimeType: "application/json",
                    responseSchema: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          phonetic: { type: Type.STRING },
                          translation: { type: Type.STRING },
                          sentence: { type: Type.STRING },
                          sentenceTranslation: { type: Type.STRING }
                        },
                        required: ["word", "phonetic", "translation", "sentence", "sentenceTranslation"],
                      }
                    }
                  }
                });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ words: JSON.parse(response.text.trim()) }));
              } catch (err: any) {
                console.error("[vite-api-ocr] Fail:", err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || "Error processing image" }));
              }
              return;
            }

            if (urlObj.pathname === '/api/generate-details' && req.method === 'POST') {
              try {
                const { words } = (req as any).body || {};
                if (!words || !Array.isArray(words)) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "Words array is required" }));
                  return;
                }

                const response = await callGeminiWithFallback({
                  contents: `Generate IPA phonetics, Chinese translations, and interactive example sentences for the following distinct English words: ${JSON.stringify(words)}. Return the results matching the requested format.`,
                  config: {
                    systemInstruction: "You are a professional dictionary compiler.",
                    responseMimeType: "application/json",
                    responseSchema: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          phonetic: { type: Type.STRING },
                          translation: { type: Type.STRING },
                          sentence: { type: Type.STRING },
                          sentenceTranslation: { type: Type.STRING }
                        },
                        required: ["word", "phonetic", "translation", "sentence", "sentenceTranslation"],
                      }
                    }
                  }
                });

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ words: JSON.parse(response.text.trim()) }));
              } catch (err: any) {
                console.error("[vite-api-generate] Fail:", err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || "Error generating details" }));
              }
              return;
            }

            // Fallback match to check API health
            if (urlObj.pathname === '/api/health') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: "ok", mode: "fallback-vite-config" }));
              return;
            }

            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
