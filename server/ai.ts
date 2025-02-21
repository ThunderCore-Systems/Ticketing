import OpenAI from "openai";
import { storage } from "./storage";
import type { KnowledgeBase, Ticket, Message } from "@shared/schema";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AiTicketResponse {
  response: string;
  confidence: number;
  usedKnowledgeBaseIds: number[];
  shouldHandover: boolean;
}

export async function generateTicketResponse(
  ticket: Ticket,
  messages: Message[],
  knowledgeBase: KnowledgeBase[]
): Promise<AiTicketResponse> {
  // Prepare context from knowledge base
  const knowledgeContext = knowledgeBase
    .map(
      (kb) => `${kb.title}:\n${kb.content}${kb.url ? `\nReference: ${kb.url}` : ""}`
    )
    .join("\n\n");

  // Prepare conversation history
  const conversationHistory = messages
    .map((msg) => `${msg.username}: ${msg.content}`)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a helpful support assistant. Use the following knowledge base to help answer user queries:\n\n${knowledgeContext}\n\nIf you cannot confidently answer the query based on the knowledge base, indicate that the ticket should be handed over to human support.`
        },
        {
          role: "user",
          content: `Ticket conversation:\n${conversationHistory}\n\nPlease provide a response to help the user. Respond in JSON format with the following structure: { "response": "your response text", "confidence": number between 0 and 1, "usedKnowledgeBaseIds": array of knowledge base entry IDs used, "shouldHandover": boolean indicating if human support is needed }`
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      response: result.response,
      confidence: result.confidence,
      usedKnowledgeBaseIds: result.usedKnowledgeBaseIds,
      shouldHandover: result.shouldHandover,
    };
  } catch (error) {
    console.error("Error generating AI response:", error);
    return {
      response: "I apologize, but I'm having trouble processing your request. Let me hand this over to our support team.",
      confidence: 0,
      usedKnowledgeBaseIds: [],
      shouldHandover: true,
    };
  }
}

export async function validateResponse(
  response: string,
  confidence: number,
  knowledgeBaseIds: number[]
): Promise<boolean> {
  // Add additional validation logic here if needed
  return confidence >= 0.7;
}
