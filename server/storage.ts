import { 
  users, servers, tickets, messages, panels,
  type User, type InsertUser, 
  type Server, type InsertServer,
  type Ticket, type InsertTicket,
  type Message, type InsertMessage,
  type Panel, type InsertPanel
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByDiscordId(discordId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User>;

  // Servers
  getServer(id: number): Promise<Server | undefined>;
  getServerByDiscordId(discordId: string): Promise<Server | undefined>;
  getServersByUserId(userId: number): Promise<Server[]>;
  createServer(server: InsertServer): Promise<Server>;
  updateServer(id: number, server: Partial<Server>): Promise<Server>;
  getServerBySubscriptionId(subscriptionId: string): Promise<Server | undefined>;

  // Tickets
  getTicket(id: number): Promise<Ticket | undefined>;
  getTicketsByServerId(serverId: number): Promise<Ticket[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, ticket: Partial<Ticket>): Promise<Ticket>;

  // Messages
  getMessagesByTicketId(ticketId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  // Panels
  getPanel(id: number): Promise<Panel | undefined>;
  getPanelsByServerId(serverId: number): Promise<Panel[]>;
  createPanel(panel: InsertPanel): Promise<Panel>;
  updatePanel(id: number, panel: Partial<Panel>): Promise<Panel>;
  deletePanel(id: number): Promise<void>;

  // Updated Tickets methods
  getTicketsByPrefix(prefix: string): Promise<Ticket[]>;
  getTicketsByPanelId(panelId: number): Promise<Ticket[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Servers
  async getServer(id: number): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.id, id));
    return server;
  }

  async getServerByDiscordId(discordId: string): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.discordId, discordId));
    return server;
  }

  async getServersByUserId(userId: number): Promise<Server[]> {
    return db.select().from(servers).where(eq(servers.ownerId, userId));
  }

  async createServer(insertServer: InsertServer): Promise<Server> {
    const [server] = await db.insert(servers).values(insertServer).returning();
    return server;
  }

  async updateServer(id: number, updates: Partial<Server>): Promise<Server> {
    const [server] = await db
      .update(servers)
      .set(updates)
      .where(eq(servers.id, id))
      .returning();
    return server;
  }

  async getServerBySubscriptionId(subscriptionId: string): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.subscriptionId, subscriptionId));
    return server;
  }

  // Tickets
  async getTicket(id: number): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async getTicketsByServerId(serverId: number): Promise<Ticket[]> {
    return db.select().from(tickets).where(eq(tickets.serverId, serverId));
  }

  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const [ticket] = await db.insert(tickets).values(insertTicket).returning();
    return ticket;
  }

  async updateTicket(id: number, updates: Partial<Ticket>): Promise<Ticket> {
    const [ticket] = await db
      .update(tickets)
      .set(updates)
      .where(eq(tickets.id, id))
      .returning();
    return ticket;
  }

  // Messages
  async getMessagesByTicketId(ticketId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.ticketId, ticketId));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db.insert(messages).values(insertMessage).returning();
    return message;
  }

  // Panels
  async getPanel(id: number): Promise<Panel | undefined> {
    const [panel] = await db.select().from(panels).where(eq(panels.id, id));
    return panel;
  }

  async getPanelsByServerId(serverId: number): Promise<Panel[]> {
    return db.select().from(panels).where(eq(panels.serverId, serverId));
  }

  async createPanel(insertPanel: InsertPanel): Promise<Panel> {
    const [panel] = await db.insert(panels).values(insertPanel).returning();
    return panel;
  }

  async updatePanel(id: number, updates: Partial<Panel>): Promise<Panel> {
    const [panel] = await db
      .update(panels)
      .set(updates)
      .where(eq(panels.id, id))
      .returning();
    return panel;
  }

  async deletePanel(id: number): Promise<void> {
    await db.delete(panels).where(eq(panels.id, id));
  }

  // Updated Tickets methods
  async getTicketsByPrefix(prefix: string): Promise<Ticket[]> {
    const panelsWithPrefix = await db
      .select()
      .from(panels)
      .where(eq(panels.prefix, prefix));

    if (!panelsWithPrefix.length) return [];

    return db
      .select()
      .from(tickets)
      .where(eq(tickets.panelId, panelsWithPrefix[0].id));
  }

  async getTicketsByPanelId(panelId: number): Promise<Ticket[]> {
    return db.select().from(tickets).where(eq(tickets.panelId, panelId));
  }
}

export const storage = new DatabaseStorage();