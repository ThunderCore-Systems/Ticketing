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
});

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").references(() => servers.id),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"),
  discordChannelId: text("discord_channel_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id),
  userId: integer("user_id").references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userRelations = relations(users, ({ many }) => ({
  servers: many(servers),
  tickets: many(tickets),
  messages: many(messages),
}));

export const serverRelations = relations(servers, ({ one, many }) => ({
  owner: one(users, {
    fields: [servers.ownerId],
    references: [users.id],
  }),
  tickets: many(tickets),
}));

export const ticketRelations = relations(tickets, ({ one, many }) => ({
  server: one(servers, {
    fields: [tickets.serverId],
    references: [servers.id],
  }),
  user: one(users, {
    fields: [tickets.userId],
    references: [users.id],
  }),
  messages: many(messages),
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
export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type Message = typeof messages.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertServer = z.infer<typeof insertServerSchema>;
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;