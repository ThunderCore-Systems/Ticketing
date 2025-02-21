import { Router } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { knowledgeBase, helpfulLinks, insertKnowledgeBaseSchema, insertHelpfulLinkSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

// Get knowledge base entries for a server
router.get("/servers/:serverId/knowledge", async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const entries = await db.select().from(knowledgeBase).where(eq(knowledgeBase.serverId, serverId));
    res.json(entries);
  } catch (error) {
    console.error("Error fetching knowledge base:", error);
    res.status(500).json({ message: "Failed to fetch knowledge base entries", error: error.message });
  }
});

// Add new knowledge base entry
router.post("/servers/:serverId/knowledge", async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);

    // Validate server ID
    if (isNaN(serverId)) {
      return res.status(400).json({ message: "Invalid server ID" });
    }

    // Parse and validate request data
    const data = insertKnowledgeBaseSchema.parse({ 
      ...req.body,
      serverId,
    });

    // Check if a similar entry already exists
    const existingEntry = await db.select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.serverId, serverId))
      .where(eq(knowledgeBase.keyPhrase, data.keyPhrase))
      .limit(1);

    if (existingEntry.length > 0) {
      return res.status(400).json({ message: "A similar entry already exists" });
    }

    // Insert new entry
    const [entry] = await db.insert(knowledgeBase)
      .values(data)
      .returning();

    res.status(201).json(entry);
  } catch (error) {
    console.error("Error creating knowledge base entry:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid data format",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      message: "Failed to create knowledge base entry",
      error: error.message
    });
  }
});

// Get helpful links for a server
router.get("/servers/:serverId/links", async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const links = await db.select().from(helpfulLinks).where(eq(helpfulLinks.serverId, serverId));
    res.json(links);
  } catch (error) {
    console.error("Error fetching helpful links:", error);
    res.status(500).json({ message: "Failed to fetch helpful links", error: error.message });
  }
});

// Add new helpful link
router.post("/servers/:serverId/links", async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);

    if (isNaN(serverId)) {
      return res.status(400).json({ message: "Invalid server ID" });
    }

    const data = insertHelpfulLinkSchema.parse({ 
      ...req.body,
      serverId,
    });

    const [link] = await db.insert(helpfulLinks)
      .values(data)
      .returning();

    res.status(201).json(link);
  } catch (error) {
    console.error("Error creating helpful link:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid data format",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      message: "Failed to create helpful link",
      error: error.message 
    });
  }
});

export default router;