import { 
  User, InsertUser, Server, InsertServer, 
  Ticket, InsertTicket, Message, InsertMessage 
} from "@shared/schema";

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

  // Tickets
  getTicket(id: number): Promise<Ticket | undefined>;
  getTicketsByServerId(serverId: number): Promise<Ticket[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, ticket: Partial<Ticket>): Promise<Ticket>;

  // Messages
  getMessagesByTicketId(ticketId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private servers: Map<number, Server>;
  private tickets: Map<number, Ticket>;
  private messages: Map<number, Message>;
  private currentId: { [key: string]: number };

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.tickets = new Map();
    this.messages = new Map();
    this.currentId = {
      users: 1,
      servers: 1,
      tickets: 1,
      messages: 1,
    };
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.discordId === discordId,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId.users++;
    const user: User = {
      ...insertUser,
      id,
      avatarUrl: insertUser.avatarUrl || null,
      accessToken: insertUser.accessToken || null,
      refreshToken: insertUser.refreshToken || null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Servers
  async getServer(id: number): Promise<Server | undefined> {
    return this.servers.get(id);
  }

  async getServerByDiscordId(discordId: string): Promise<Server | undefined> {
    return Array.from(this.servers.values()).find(
      (server) => server.discordId === discordId,
    );
  }

  async getServersByUserId(userId: number): Promise<Server[]> {
    return Array.from(this.servers.values()).filter(
      (server) => server.ownerId === userId,
    );
  }

  async createServer(insertServer: InsertServer): Promise<Server> {
    const id = this.currentId.servers++;
    const server: Server = {
      ...insertServer,
      id,
      icon: insertServer.icon || null,
      ownerId: insertServer.ownerId || null,
      subscriptionId: insertServer.subscriptionId || null,
      subscriptionStatus: insertServer.subscriptionStatus || null,
    };
    this.servers.set(id, server);
    return server;
  }

  async updateServer(id: number, updates: Partial<Server>): Promise<Server> {
    const server = await this.getServer(id);
    if (!server) throw new Error("Server not found");
    const updatedServer = { ...server, ...updates };
    this.servers.set(id, updatedServer);
    return updatedServer;
  }

  // Tickets
  async getTicket(id: number): Promise<Ticket | undefined> {
    return this.tickets.get(id);
  }

  async getTicketsByServerId(serverId: number): Promise<Ticket[]> {
    return Array.from(this.tickets.values()).filter(
      (ticket) => ticket.serverId === serverId,
    );
  }

  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const id = this.currentId.tickets++;
    const ticket: Ticket = {
      ...insertTicket,
      id,
      status: insertTicket.status || "open",
      createdAt: new Date(),
      serverId: insertTicket.serverId || null,
      userId: insertTicket.userId || null,
      discordChannelId: insertTicket.discordChannelId || null,
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  async updateTicket(id: number, updates: Partial<Ticket>): Promise<Ticket> {
    const ticket = await this.getTicket(id);
    if (!ticket) throw new Error("Ticket not found");
    const updatedTicket = { ...ticket, ...updates };
    this.tickets.set(id, updatedTicket);
    return updatedTicket;
  }

  // Messages
  async getMessagesByTicketId(ticketId: number): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(
      (message) => message.ticketId === ticketId,
    );
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = this.currentId.messages++;
    const message: Message = {
      ...insertMessage,
      id,
      createdAt: new Date(),
      userId: insertMessage.userId || null,
      ticketId: insertMessage.ticketId || null,
    };
    this.messages.set(id, message);
    return message;
  }
}

export const storage = new MemStorage();