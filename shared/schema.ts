import { pgTable, text, serial, integer, timestamp, boolean, json, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  username: text("username").notNull(),
  avatarUrl: text("avatar_url"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  serverTokens: integer("server_tokens").default(0),
  ISADMIN: boolean("is_admin").default(false),
  isBanned: boolean("is_banned").default(false),
  isServerManager: boolean("is_server_manager").default(false), 
});

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon"),
  ownerId: integer("owner_id").references(() => users.id),
  subscriptionId: text("subscription_id"),
  subscriptionStatus: text("subscription_status"),
  claimedByUserId: integer("claimed_by_user_id").references(() => users.id),
  anonymousMode: boolean("anonymous_mode").default(false),
  webhookAvatar: text("webhook_avatar"),
  ticketManagerRoleId: text("ticket_manager_role_id"), 
  autoArchive: boolean("auto_archive").default(false),
  activityLogs: boolean("activity_logs").default(false),
  enableStats: boolean("enable_stats").default(false),
  enableTeamStats: boolean("enable_team_stats").default(false),
  lastSynced: timestamp("last_synced"),
});

export const panels = pgTable("panels", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").references(() => servers.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  channelId: text("channel_id").notNull(),
  categoryId: text("category_id").notNull(),
  supportRoleIds: text("support_role_ids").array().notNull(),
  prefix: text("prefix").notNull(),
  transcriptChannelId: text("transcript_channel_id"),
  formEnabled: boolean("form_enabled").default(false),
  formFields: json("form_fields").$type<Array<{
    label: string;
    type: 'text' | 'textarea' | 'select';
    required: boolean;
    options?: string[];
  }>>(),
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").references(() => servers.id),
  panelId: integer("panel_id").references(() => panels.id),
  userId: text("user_id").notNull(),
  channelId: text("channel_id"),
  number: integer("number").notNull(),
  status: text("status").notNull().default("open"),
  claimedBy: text("claimed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by"),
  messages: text("messages").array().notNull().default([]),
});

// Extend type for messages to include Discord usernames
export type TicketMessage = {
  id: number;
  content: string;
  userId: string;
  username: string;
  createdAt: string;
};

// Add after TicketMessage type definition
export type Message = TicketMessage & {
  source?: 'discord' | 'dashboard';
  isSupport?: boolean;
  avatarUrl?: string;
  attachments?: Array<{
    url: string;
    name: string;
    contentType?: string;
  }>;
};

// Custom types for statistics
export type SupportTeamMember = {
  id: string;
  name: string;
  roleType: 'manager' | 'support' | 'both';
  ticketsHandled: number;
  avgResponseTime: number;
  resolutionRate: number;
  lastActive: Date;
};

export type ServerStats = {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  avgResponseTime: number;
  avgResolutionTime: number;
  peakHours: { hour: number; count: number }[];
  ticketsByDay: { date: string; count: number }[];
  topCategories: { category: string; count: number }[];
};

// Relations
export const userRelations = relations(users, ({ many }) => ({
  servers: many(servers),
}));

export const serverRelations = relations(servers, ({ one, many }) => ({
  owner: one(users, {
    fields: [servers.ownerId],
    references: [users.id],
  }),
  tickets: many(tickets),
}));

export const panelRelations = relations(panels, ({ one, many }) => ({
  server: one(servers, {
    fields: [panels.serverId],
    references: [servers.id],
  }),
  tickets: many(tickets),
}));

export const ticketRelations = relations(tickets, ({ one }) => ({
  server: one(servers, {
    fields: [tickets.serverId],
    references: [servers.id],
  }),
  panel: one(panels, {
    fields: [tickets.panelId],
    references: [panels.id],
  }),
}));

// Insert schemas and types
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertServerSchema = createInsertSchema(servers).omit({ id: true });
export const insertPanelSchema = createInsertSchema(panels).omit({ id: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, closedAt: true });

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Panel = typeof panels.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertServer = z.infer<typeof insertServerSchema>;
export type InsertPanel = z.infer<typeof insertPanelSchema>;
export type InsertTicket = z.infer<typeof insertTicketSchema>;


// Add after the existing tables
export const knowledgeBase = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").references(() => servers.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  url: text("url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiResponses = pgTable("ai_responses", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id),
  response: text("response").notNull(),
  confidence: numeric("confidence").notNull(),
  usedKnowledgeBaseIds: integer("used_knowledge_base_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default("pending"), 
  handedOverToSupport: boolean("handed_over_to_support").default(false),
});

// Add to relations
export const knowledgeBaseRelations = relations(knowledgeBase, ({ one }) => ({
  server: one(servers, {
    fields: [knowledgeBase.serverId],
    references: [servers.id],
  }),
}));

export const aiResponseRelations = relations(aiResponses, ({ one }) => ({
  ticket: one(tickets, {
    fields: [aiResponses.ticketId],
    references: [tickets.id],
  }),
}));

// Add insert schemas and types
export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBase).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export const insertAiResponseSchema = createInsertSchema(aiResponses).omit({ 
  id: true, 
  createdAt: true 
});

export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type AiResponse = typeof aiResponses.$inferSelect;
export type InsertKnowledgeBase = z.infer<typeof insertKnowledgeBaseSchema>;
export type InsertAiResponse = z.infer<typeof insertAiResponseSchema>;