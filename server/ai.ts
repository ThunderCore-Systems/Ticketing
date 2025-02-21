import OpenAI from "openai";
import { storage } from "./storage";
import { db } from "./db";
import { knowledgeBase } from "@shared/schema";
import { eq } from "drizzle-orm";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface AIResponse {
  content: string;
  confidence: number;
  usedKnowledgeBase: boolean;
}

// Function to get knowledge base entries for a server
async function getKnowledgeBaseContext(serverId: number): Promise<string> {
  const entries = await db.select()
    .from(knowledgeBase)
    .where(eq(knowledgeBase.serverId, serverId));

  return entries
    .map(entry => `Q: ${entry.keyPhrase}\nA: ${entry.answer}`)
    .join('\n\n');
}

// Function to save a successful AI interaction to the knowledge base
async function saveToKnowledgeBase(serverId: number, question: string, answer: string): Promise<void> {
  try {
    await db.insert(knowledgeBase).values({
      serverId,
      keyPhrase: question.slice(0, 200), // Limit the length of the key phrase
      answer,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error("Failed to save to knowledge base:", error);
  }
}

export async function handleNewTicket(
  ticketId: number,
  serverId: number,
  initialMessage: string
): Promise<AIResponse | null> {
  try {
    console.log(`[AI] Processing new ticket ${ticketId} for server ${serverId}`);

    // Don't respond if ticket is already claimed
    const ticket = await storage.getTicket(ticketId);
    if (!ticket || ticket.claimedBy) {
      console.log(`[AI] Ticket ${ticketId} is claimed or not found, skipping response`);
      return null;
    }

    // Get knowledge base context
    const knowledgeContext = await getKnowledgeBaseContext(serverId);
    console.log(`[AI] Retrieved knowledge base context for server ${serverId}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a helpful support assistant. Use the following knowledge base to help answer user queries:\n\n${knowledgeContext}\n\nRespond naturally and professionally. If you cannot provide a confident answer, acknowledge the query and let them know a human support agent will assist them shortly. Format your response as JSON with: { "response": "your response text", "confidence": 0-1 score }`
        },
        {
          role: "user",
          content: initialMessage
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // If the response is confident enough, save it to the knowledge base
    if (result.confidence > 0.8) {
      await saveToKnowledgeBase(serverId, initialMessage, result.response);
    }

    console.log(`[AI] Generated response for ticket ${ticketId} with confidence ${result.confidence}`);

    return {
      content: result.response || "I'll have a support agent assist you shortly.",
      confidence: result.confidence || 0,
      usedKnowledgeBase: knowledgeContext.length > 0
    };

  } catch (error) {
    console.error("[AI] Error generating response:", error);
    return {
      content: "I apologize, but I'm having trouble processing your request. A support agent will assist you shortly.",
      confidence: 0,
      usedKnowledgeBase: false
    };
  }
}

// Function to check if AI should continue responding
export async function shouldAIRespond(ticketId: number): Promise<boolean> {
  const ticket = await storage.getTicket(ticketId);
  const shouldRespond = ticket ? !ticket.claimedBy : false;
  console.log(`[AI] Checking if should respond to ticket ${ticketId}: ${shouldRespond}`);
  return shouldRespond;
}

// Function to handle ongoing conversation
export async function handleTicketResponse(
  ticketId: number,
  serverId: number,
  messageHistory: string[],
  latestMessage: string
): Promise<AIResponse | null> {
  try {
    console.log(`[AI] Processing message for ticket ${ticketId}`);

    // Don't respond if ticket is claimed
    if (!await shouldAIRespond(ticketId)) {
      console.log(`[AI] Ticket ${ticketId} is claimed, skipping response`);
      return null;
    }

    // Get knowledge base context
    const knowledgeContext = await getKnowledgeBaseContext(serverId);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a helpful support assistant. Use this knowledge base:\n\n${knowledgeContext}\n\nRespond naturally and professionally. If you cannot help, let them know a human agent will assist shortly. Format your response as JSON with: { "response": "your response text", "confidence": 0-1 score }`
        },
        {
          role: "user",
          content: `Conversation history:\n${messageHistory.join('\n')}\n\nLatest message: ${latestMessage}`
        }
      ],
      response_format: { type: "json_object" }
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // If the response is confident enough, save it to the knowledge base
    if (result.confidence > 0.8) {
      await saveToKnowledgeBase(serverId, latestMessage, result.response);
    }

    console.log(`[AI] Generated response with confidence ${result.confidence}`);

    return {
      content: result.response || "I'll have a support agent assist you shortly.",
      confidence: result.confidence || 0,
      usedKnowledgeBase: knowledgeContext.length > 0
    };

  } catch (error) {
    console.error("[AI] Error generating response:", error);
    return {
      content: "I apologize, but I'm having trouble processing your request. A support agent will assist you shortly.",
      confidence: 0,
      usedKnowledgeBase: false
    };
  }
}