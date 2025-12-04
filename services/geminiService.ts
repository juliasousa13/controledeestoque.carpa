import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export const generateProductDescription = async (productName: string, department: string): Promise<string> => {
  if (!ai) {
    console.warn("API Key is missing. Skipping AI generation.");
    return "Descrição indisponível (Chave API não configurada).";
  }

  try {
    const prompt = `Escreva uma descrição técnica curta e profissional (máximo 2 frases) para um item de estoque chamado "${productName}" usado no departamento de "${department}".`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "";
  } catch (error) {
    console.error("Error generating description:", error);
    return "";
  }
};