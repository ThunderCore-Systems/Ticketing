import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
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
  isAdmin: boolean("is_admin").default(false),
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
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id),
  userId: integer("user_id").references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Custom types for statistics
export type SupportTeamMember = {
  id: string;
  name: string;
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

export const userRelations = relations(users, ({ many }) => ({
  servers: many(servers),
  messages: many(messages),
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

export const messageRelations = relations(messages, ({ one }) => ({
  ticket: one(tickets, {
    fields: [messages.ticketId],
    references: [tickets.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertServerSchema = createInsertSchema(servers).omit({ id: true });
export const insertPanelSchema = createInsertSchema(panels).omit({ id: true });
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, closedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Panel = typeof panels.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertServer = z.infer<typeof insertServerSchema>;
export type InsertPanel = z.infer<typeof insertPanelSchema>;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;