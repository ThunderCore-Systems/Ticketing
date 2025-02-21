import { Router } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { knowledgeBase, helpfulLinks, insertKnowledgeBaseSchema, insertHelpfulLinkSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

// Get knowledge base entries for a server
router.get("/servers/:serverId/knowledge", requireAuth, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    console.log('Fetching knowledge base for server:', serverId);

    const entries = await db.select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.serverId, serverId));

    console.log('Found entries:', entries);
    res.json(entries);
  } catch (error: any) {
    console.error("Error fetching knowledge base:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      message: "Failed to fetch knowledge base entries", 
      error: error.message,
      details: error.stack
    });
  }
});

// Add new knowledge base entry
router.post("/servers/:serverId/knowledge", requireAuth, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    console.log('Creating knowledge base entry for server:', serverId, 'with data:', req.body);

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
    const existingEntries = await db.select()
      .from(knowledgeBase)
      .where(
        and(
          eq(knowledgeBase.serverId, serverId),
          eq(knowledgeBase.keyPhrase, data.keyPhrase)
        )
      );

    if (existingEntries.length > 0) {
      return res.status(400).json({ message: "A similar entry already exists" });
    }

    // Insert new entry
    console.log('Inserting knowledge base entry:', data);
    const [entry] = await db.insert(knowledgeBase)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    console.log('Created entry:', entry);
    res.status(201).json(entry);
  } catch (error: any) {
    console.error("Error creating knowledge base entry:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid data format",
        details: error.errors 
      });
    }

    res.status(500).json({ 
      message: "Failed to create knowledge base entry",
      error: error.message,
      details: error.stack
    });
  }
});

// Get helpful links for a server
router.get("/servers/:serverId/links", requireAuth, async (req, res) => {
  try {
    const serverId = parseInt(req.params.serverId);
    const links = await db.select()
      .from(helpfulLinks)
      .where(eq(helpfulLinks.serverId, serverId));

    res.json(links);
  } catch (error: any) {
    console.error("Error fetching helpful links:", error);
    res.status(500).json({ 
      message: "Failed to fetch helpful links", 
      error: error.message,
      details: error.stack
    });
  }
});

// Add new helpful link
router.post("/servers/:serverId/links", requireAuth, async (req, res) => {
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
      .values({
        ...data,
        createdAt: new Date()
      })
      .returning();

    res.status(201).json(link);
  } catch (error: any) {
    console.error("Error creating helpful link:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid data format",
        details: error.errors 
      });
    }
    res.status(500).json({ 
      message: "Failed to create helpful link",
      error: error.message,
      details: error.stack
    });
  }
});

export default router;