import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface AIDesignSuggestion {
  title: string;
  description: string;
  elements: {
    id: string;
    type: 'button' | 'card' | 'text' | 'image' | 'container';
    content: string;
    x: number;
    y: number;
    width: number;
    height: number;
    style: string;
    parentId?: string;
  }[];
  resources: {
    name: string;
    type: string;
    url: string;
  }[];
}

export async function generateDesignSuggestion(prompt: string): Promise<AIDesignSuggestion> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Design a frontend component based on this prompt: "${prompt}". 
    Provide a JSON response with elements (position, size, type, content) and resources.
    Positions and sizes should be in percentages (0-100).
    Use 'parentId' to establish a hierarchy (e.g., a button inside a card). If an element has a parent, its x and y are relative to the parent's top-left corner.
    Use Tailwind CSS classes in the 'style' property for styling.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          elements: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['button', 'card', 'text', 'image', 'container'] },
                content: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER },
                style: { type: Type.STRING },
                parentId: { type: Type.STRING }
              },
              required: ['id', 'type', 'content', 'x', 'y', 'width', 'height']
            }
          },
          resources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                url: { type: Type.STRING }
              }
            }
          }
        },
        required: ['title', 'description', 'elements', 'resources']
      }
    }
  });

  return JSON.parse(response.text || '{}');
}
