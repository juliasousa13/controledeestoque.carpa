
import { GoogleGenAI, Type } from "@google/genai";

export const generateProductInsights = async (productName: string, department: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Aja como um consultor de suprimentos. Analise o item "${productName}" do setor "${department}".
      Retorne um JSON com:
      - description: Uma descrição técnica e formal (máx 120 caracteres).
      - suggestedCategory: Uma categoria (Consumível, Ferramenta, Equipamento, EPI, ou Matéria-prima).
      - storageAdvice: Uma dica curtíssima de armazenamento.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            suggestedCategory: { type: Type.STRING },
            storageAdvice: { type: Type.STRING }
          },
          required: ["description", "suggestedCategory", "storageAdvice"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Erro ao gerar insights com IA:", error);
    return null;
  }
};
