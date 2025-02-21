import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertTicketSchema, insertServerSchema } from "@shared/schema";
import {
  setupDiscordBot,
  getServerChannels,
  getServerCategories,
  getServerRoles,
  createTicketPanel,
  sendWebhookMessage,
  validateRoleId,
  client,
} from "./discord";
import { setupStripeWebhooks, createSubscription } from "./stripe";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import type { DiscordGuild, TicketMessage } from "./types";
import { TextChannel, EmbedBuilder } from "discord.js";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_CALLBACK_URL =
  "https://flaming-ticketing.replit.app/api/auth/discord/callback";

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

function requireAdmin(req: any, res: any, next: any) {
  if (!req.user?.ISADMIN) {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function requireServerManagerOrAdmin(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (!req.user.ISADMIN && !req.user.isServerManager) {
    return res.status(403).json({ message: "Server management access required" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Admin routes
  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/servers", requireAuth, requireServerManagerOrAdmin, async (req, res) => {
    try {
      const servers = await storage.getAllServers();
      res.json(servers);
    } catch (error) {
      console.error("Error fetching servers:", error);
      res.status(500).json({ message: "Failed to fetch servers" });
    }
  });

  app.post(
    "/api/admin/users/:userId/tokens",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        const { tokens } = req.body;

        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const updatedUser = await storage.updateUser(userId, {
          serverTokens: (user.serverTokens || 0) + tokens,
        });

        res.json(updatedUser);
      } catch (error) {
        console.error("Error adding tokens:", error);
        res.status(500).json({ message: "Failed to add tokens" });
      }
    },
  );

  app.post(
    "/api/admin/users/:userId/servers",
    requireAuth,
    requireAdmin,
    async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        const { serverId } = req.body;

        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const server = await storage.getServer(serverId);
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        await storage.updateServer(serverId, {
          claimedByUserId: userId,
          subscriptionStatus: "active",
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error adding server:", error);
        res.status(500).json({ message: "Failed to add server" });
      }
    },
  );

  app.patch('/api/admin/users/:userId', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const updatedUser = await storage.updateUser(userId, req.body);
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ message: 'Failed to update user' });
    }
  });

  app.post('/api/admin/users/:userId/tokens', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { amount } = req.body;

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const updatedUser = await storage.updateUser(userId, {
        serverTokens: (user.serverTokens || 0) + amount
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Error adding tokens:', error);
      res.status(500).json({ message: 'Failed to add tokens' });
    }
  });

  app.post('/api/admin/users/:userId/ban', requireAuth, requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const updatedUser = await storage.updateUser(userId, {
        isBanned: !user.isBanned
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user ban status:', error);
      res.status(500).json({ message: 'Failed to update user ban status' });
    }
  });

  app.post('/api/admin/servers/:serverId/sync', requireAuth, requireServerManagerOrAdmin, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Re-fetch Discord server details and update
      try {
        const channels = await getServerChannels(server.discordId);
        const roles = await getServerRoles(server.discordId);

        // Update server with latest info
        const updatedServer = await storage.updateServer(serverId, {
          lastSynced: new Date()
        });

        res.json({ 
          server: updatedServer,
          channels,
          roles: roles.filter(role => role.name !== '@everyone')
        });
      } catch (error) {
        console.error('Discord sync error:', error);
        return res.status(500).json({ 
          message: 'Failed to sync with Discord',
          details: error.message
        });
      }
    } catch (error) {
      console.error('Error syncing server:', error);
      res.status(500).json({ message: 'Failed to sync server' });
    }
  });


  async function registerUserServers(userId: number, guilds: DiscordGuild[]) {
    for (const guild of guilds) {
      if (
        guild.owner ||
        (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8)
      ) {
        const existingServer = await storage.getServerByDiscordId(guild.id);
        if (!existingServer) {
          await storage.createServer({
            discordId: guild.id,
            name: guild.name,
            icon: guild.icon
              ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
              : null,
            ownerId: userId,
            subscriptionId: null,
            subscriptionStatus: null,
          });
        }
      }
    }
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: "none",
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new DiscordStrategy(
      {
        clientID: DISCORD_CLIENT_ID,
        clientSecret: DISCORD_CLIENT_SECRET,
        callbackURL: DISCORD_CALLBACK_URL,
        scope: ["identify", "guilds", "email"],
      },
      async (accessToken, refreshToken, profile: any, done) => {
        try {
          console.log("Discord auth callback received:", {
            userId: profile.id,
            username: profile.username,
            guilds: profile.guilds?.length,
          });

          let user = await storage.getUserByDiscordId(profile.id);

          if (!user) {
            user = await storage.createUser({
              discordId: profile.id,
              username: profile.username,
              avatarUrl: profile.avatar
                ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                : null,
              accessToken,
              refreshToken,
            });
          } else {
            user = await storage.updateUser(user.id, {
              username: profile.username,
              avatarUrl: profile.avatar
                ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
                : null,
              accessToken,
              refreshToken,
            });
          }

          if (profile.guilds) {
            await registerUserServers(user.id, profile.guilds);
          }

          done(null, user);
        } catch (error) {
          console.error("Error in Discord auth:", error);
          done(error as Error);
        }
      },
    ),
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.get("/api/auth/discord", passport.authenticate("discord"));
  app.get(
    "/api/auth/discord/callback",
    passport.authenticate("discord", {
      failureRedirect: "/login?error=auth_failed",
      successRedirect: "/dashboard",
    }),
  );

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });

  app.get("/api/servers", requireAuth, async (req, res) => {
    const servers = await storage.getServersByUserId((req.user as any).id);
    res.json(servers);
  });

  app.get("/api/servers/:serverId", requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));

      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this server" });
      }

      res.json(server);
    } catch (error) {
      console.error("Error fetching server:", error);
      res.status(500).json({ message: "Failed to fetch server details" });
    }
  });

  app.get("/api/servers/:serverId/tickets", requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Check if user has ticket manager role
      const hasManagerRole =
        server.ticketManagerRoleId === (req.user as any).discordId;

      // If user is not a ticket manager, only return open tickets
      const tickets = await storage.getTicketsByServerId(
        parseInt(req.params.serverId),
      );
      const filteredTickets = hasManagerRole
        ? tickets
        : tickets.filter((ticket) => ticket.status === "open");

      res.json(filteredTickets);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  app.post("/api/servers/:serverId/tickets", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.createTicket({
        ...insertTicketSchema.parse(req.body),
        serverId: parseInt(req.params.serverId),
        formResponses: req.body.formResponses
          ? JSON.stringify(req.body.formResponses)
          : null,
      });

      // Get the panel to include form responses in the initial message
      const panel = await storage.getPanel(ticket.panelId);

      if (panel && ticket.formResponses) {
        const formattedResponses = Object.entries(
          JSON.parse(ticket.formResponses),
        )
          .map(([fieldId, value]) => {
            const field = panel.formFields.find((f: any) => f.id === fieldId);
            return field ? `**${field.label}**: ${value}` : null;
          })
          .filter(Boolean)
          .join("\n");

        if (formattedResponses) {
          const messages = ticket.messages || [];
          const initialMessage = {
            id: messages.length + 1,
            content: `**Ticket Information**\n${formattedResponses}`,
            userId: (req.user as any).id,
            username: "System",
            source: "system",
            createdAt: new Date().toISOString(),
          };

          await storage.updateTicket(ticket.id, {
            messages: [...messages, JSON.stringify(initialMessage)],
          });
        }
      }

      res.json(ticket);
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ message: "Failed to create ticket" });
    }
  });

  app.get("/api/tickets/:ticketId/messages", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const messages = (ticket.messages || []).map((msg) => {
        const message = typeof msg === "string" ? JSON.parse(msg) : msg;
        return {
          ...message,
          isDiscord: message.source === "discord",
          isSupport: ticket.claimedBy === message.userId,
        };
      });

      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  const messageSchema = z.object({
    content: z.string().min(1, "Message content is required"),
    source: z.enum(["discord", "dashboard"]).default("dashboard"),
    username: z.string().optional(),
    avatarUrl: z.string().optional(),
  });

  app.post("/api/tickets/:ticketId/messages", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId!);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      // Check if user has permission to send messages
      if (server.restrict_claimed_messages && ticket.claimedBy) {
        // Allow server owner and claimed user to send messages
        const isOwner = server.ownerId === (req.user as any).id;
        const isClaimedBy = ticket.claimedBy === (req.user as any).discordId;

        if (!isOwner && !isClaimedBy) {
          return res.status(403).json({
            message: "This ticket has been claimed by another staff member",
          });
        }
      }

      const { content, source } = messageSchema.parse(req.body);

      const existingMessages = ticket.messages || [];
      const newMessage = {
        id: existingMessages.length + 1,
        content,
        userId: (req.user as any).id,
        username: (req.user as any).username,
        avatarUrl: (req.user as any).avatarUrl,
        source: source || "dashboard",
        createdAt: new Date().toISOString(),
      };

      await storage.updateTicket(ticketId, {
        messages: [...existingMessages, JSON.stringify(newMessage)],
      });

      if (
        server.ownerId === (req.user as any).id ||
        server.claimedByUserId === (req.user as any).id
      ) {
        await sendWebhookMessage(
          ticket.channelId!,
          content,
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
        );
      }

      res.json(newMessage);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  app.get("/api/tickets/:ticketId", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(parseInt(req.params.ticketId));

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this ticket" });
      }

      res.json(ticket);
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ message: "Failed to fetch ticket details" });
    }
  });

  // Add these new ticket management routes after the existing ticket routes
  app.post("/api/tickets/:ticketId/claim", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      // Verify user permission
      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Toggle claim status
      const updatedTicket = await storage.updateTicket(ticketId, {
        claimedBy:
          ticket.claimedBy === (req.user as any).discordId
            ? null
            : (req.user as any).discordId,
      });

      if (ticket.channelId) {
        const embed = new EmbedBuilder()
          .setTitle(
            updatedTicket.claimedBy ? "Ticket Claimed" : "Ticket Unclaimed",
          )
          .setDescription(
            updatedTicket.claimedBy
              ? `Ticket claimed by <@${updatedTicket.claimedBy}>`
              : "Ticket is now unclaimed",
          )
          .setColor(updatedTicket.claimedBy ? 0x00ff00 : 0xff0000)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          "",
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed],
        );
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error("Error claiming ticket:", error);
      res.status(500).json({ message: "Failed to claim ticket" });
    }
  });

  app.post("/api/tickets/:ticketId/add-user", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      // Verify user permission
      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      if (!ticket.channelId) {
        return res
          .status(400)
          .json({ message: "No Discord channel associated with this ticket" });
      }

      const channel = await client?.channels.fetch(ticket.channelId);
      if (channel instanceof TextChannel) {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        const embed = new EmbedBuilder()
          .setTitle("User Added")
          .setDescription(`<@${userId}> has been added to the ticket`)
          .setColor(0x00ff00)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          "",
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed],
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error adding user:", error);
      res.status(500).json({ message: "Failed to add user" });
    }
  });

  app.post(
    "/api/tickets/:ticketId/transcript",
    requireAuth,
    async (req, res) => {
      try {
        const ticketId = parseInt(req.params.ticketId);
        const ticket = await storage.getTicket(ticketId);

        if (!ticket) {
          return res.status(404).json({ message: "Ticket not found" });
        }

        const server = await storage.getServer(ticket.serverId);
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        if (!ticket.channelId) {
          return res
            .status(400)
            .json({
              message: "No Discord channel associated with this ticket",
            });
        }

        const messages = await storage.getMessagesByTicketId(ticketId);
        const transcriptText = messages
          .map((msg) => {
            const message = typeof msg === "string" ? JSON.parse(msg) : msg;
            return `${message.username} (${message.source}): ${message.content}`;
          })
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle("Ticket Transcript")
          .setDescription("Transcript saved")
          .setColor(0x00ff00)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          transcriptText,
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed],
        );

        res.json({ success: true });
      } catch (error) {
        console.error("Error saving transcript:", error);
        res.status(500).json({ message: "Failed to save transcript" });
      }
    },
  );

  app.patch("/api/tickets/:ticketId", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const status = req.body.status;
      if (!status || !["open", "closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updatedTicket = await storage.updateTicket(ticketId, {
        status,
        closedAt: status === "closed" ? new Date() : null,
        closedBy: status === "closed" ? (req.user as any).discordId : null,
      });

      if (ticket.channelId) {
        const channel = await client?.channels.fetch(ticket.channelId);
        if (channel instanceof TextChannel) {
          if (status === "closed") {
            // Remove user's access when closing
            await channel.permissionOverwrites.edit(ticket.userId, {
              ViewChannel: false,
            });

            // Create support team control panel
            const controlPanel = new EmbedBuilder()
              .setTitle("Ticket Controls")
              .setDescription(
                "This ticket has been closed. Use the buttons below to manage the ticket.",
              )
              .setColor(0xff0000)
              .setTimestamp();

            // Send webhook message with closure notification
            const closeEmbed = new EmbedBuilder()
              .setTitle("Ticket Closed")
              .setDescription(
                `Ticket closed by <@${(req.user as any).discordId}>`,
              )
              .setColor(0xff0000)
              .setTimestamp();

            await sendWebhookMessage(
              ticket.channelId,
              "",
              (req.user as any).username,
              server.anonymousMode || false,
              server.webhookAvatar,
              (req.user as any).avatarUrl,
              [closeEmbed, controlPanel],
            );
          } else {
            // Reopening ticket
            await channel.permissionOverwrites.edit(ticket.userId, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
            });

            const reopenEmbed = new EmbedBuilder()
              .setTitle("Ticket Reopened")
              .setDescription(
                `Ticket reopened by <@${(req.user as any).discordId}>`,
              )
              .setColor(0x00ff00)
              .setTimestamp();

            await sendWebhookMessage(
              ticket.channelId,
              "",
              (req.user as any).username,
              server.anonymousMode || false,
              server.webhookAvatar,
              (req.user as any).avatarUrl,
              [reopenEmbed],
            );
          }
        }
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  app.post(
    "/api/tickets/:ticketId/remove-user",
    requireAuth,
    async (req, res) => {
      try {
        const ticketId = parseInt(req.params.ticketId);
        const ticket = await storage.getTicket(ticketId);

        if (!ticket) {
          return res.status(404).json({ message: "Ticket not found" });
        }

        const server = await storage.getServer(ticket.serverId);
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const { userId } = req.body;
        if (!userId) {
          return res.status(400).json({ message: "User ID is required" });
        }

        if (ticket.channelId) {
          const channel = await client.channels.fetch(ticket.channelId);
          if (channel instanceof TextChannel) {
            await channel.permissionOverwrites.delete(userId);
          }
        }

        if (ticket.channelId) {
          const embed = new EmbedBuilder()
            .setTitle("User Removed")
            .setDescription(`<@${userId}> has been removed from the ticket`)
            .setColor(0xff0000)
            .setTimestamp();

          await sendWebhookMessage(
            ticket.channelId,
            "",
            (req.user as any).username,
            server.anonymousMode || false,
            server.webhookAvatar,
            (req.user as any).avatarUrl,
            [embed],
          );
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error removing user:", error);
        res.status(500).json({ message: "Failed to remove user" });
      }
    },
  );

  app.post("/api/tickets/:ticketId/upgrade", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const { roleId } = req.body;
      if (!roleId) {
        return res.status(400).json({ message: "Role ID is required" });
      }

      const role = await validateRoleId(server.discordId, roleId);
      if (!role) {
        return res.status(400).json({ message: "Invalid role ID" });
      }

      if (ticket.channelId) {
        const channel = await client.channels.fetch(ticket.channelId);
        if (channel instanceof TextChannel) {
          await channel.permissionOverwrites.edit(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        }
      }

      if (ticket.channelId) {
        const embed = new EmbedBuilder()
          .setTitle("Ticket Upgraded")
          .setDescription(
            `This ticket has been upgraded to include the role <@&${roleId}>`,
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          "",
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed],
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error upgrading ticket:", error);
      res.status(500).json({ message: "Failed to upgrade ticket" });
    }
  });

  app.get("/api/panels/:panelId", requireAuth, async (req, res) => {
    try {
      const panel = await storage.getPanel(parseInt(req.params.panelId));

      if (!panel) {
        return res.status(404).json({ message: "Panel not found" });
      }

      const server = await storage.getServer(panel.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this panel" });
      }

      res.json(panel);
    } catch (error) {
      console.error("Error fetching panel:", error);
      res.status(500).json({ message: "Failed to fetch panel details" });
    }
  });

  app.post("/api/servers/:serverId/activate", requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const userId = (req.user as any).id;

      const user = await storage.getUser(userId);
      if (!user || !user.serverTokens || user.serverTokens <= 0) {
        return res.status(400).json({
          error: "No server tokens available. Please purchase a subscription.",
        });
      }

      await storage.updateUser(userId, {
        serverTokens: user.serverTokens - 1,
      });

      const server = await storage.updateServer(serverId, {
        subscriptionStatus: "active",
        claimedByUserId: userId,
      });

      res.json(server);
    } catch (error) {
      console.error("Server activation error:", error);
      res.status(500).json({ error: "Failed to activate server" });
    }
  });

  app.post(
    "/api/servers/:serverId/validate-role",
    requireAuth,
    async (req, res) => {
      try {
        const server = await storage.getServer(parseInt(req.params.serverId));
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const roleSchema = z.object({
          roleId: z.string().min(1, "Role ID is required"),
        });

        const { roleId } = roleSchema.parse(req.body);
        const role = await validateRoleId(server.discordId, roleId);

        if (!role) {
          return res.status(400).json({ message: "Invalid role ID" });
        }

        const updatedServer = await storage.updateServer(server.id, {
          ticketManagerRoleId: roleId,
        });

        res.json({ role, server: updatedServer });
      } catch (error) {
        console.error("Error validating role:", error);
        res.status(500).json({
          message: "Failed to validate role",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  app.get("/api/servers/:serverId/channels", requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const channels = await getServerChannels(server.discordId);
      res.json(channels);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).json({ message: "Failed to fetch channels" });
    }
  });

  app.get(
    "/api/servers/:serverId/categories",
    requireAuth,
    async (req, res) => {
      try {
        const server = await storage.getServer(parseInt(req.params.serverId));
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const categories = await getServerCategories(server.discordId);
        res.json(categories);
      } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: "Failed to fetch categories" });
      }
    },
  );

  app.get("/api/servers/:serverId/roles", requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const roles = await getServerRoles(server.discordId);
      res.json(roles.filter((role) => role.name !== "@everyone"));
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({
        message: "Failed to fetch roles",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.patch("/api/servers/:serverId", requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updatedServer = await storage.updateServer(serverId, req.body);
      res.json(updatedServer);
    } catch (error) {
      console.error("Error updating server:", error);
      res.status(500).json({
        message: "Failed to update server settings",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
  app.get(
    "/api/servers/:serverId/support-stats",
    requireAuth,
    async (req, res) => {
      try {
        const server = await storage.getServer(parseInt(req.params.serverId));
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const tickets = await storage.getTicketsByServerId(server.id);

        const supportMembers = new Map();

        tickets.forEach((ticket) => {
          if (ticket.claimedBy) {
            if (!supportMembers.has(ticket.claimedBy)) {
              supportMembers.set(ticket.claimedBy, {
                id: ticket.claimedBy,
                ticketsHandled: 0,
                resolvedTickets: 0,
                totalResponseTime: 0,
                ticketsWithResponse: 0,
                totalMessages: 0,
                lastActive: null,
                name: null,
                avatar: null,
                fastestResponse: Infinity,
                slowestResponse: 0,
                peakHours: Array(24).fill(0),
                weekdayActivity: Array(7).fill(0),
                categories: new Map(),
                averageMessagesPerTicket: 0,
                averageResolutionTime: 0,
                messagesBySource: {
                  discord: 0,
                  dashboard: 0,
                },
              });
            }

            const member = supportMembers.get(ticket.claimedBy);
            member.ticketsHandled++;

            if (ticket.status === "closed") {
              member.resolvedTickets++;
              if (ticket.closedAt && ticket.createdAt) {
                const resolutionTime =
                  new Date(ticket.closedAt).getTime() -
                  new Date(ticket.createdAt).getTime();
                member.averageResolutionTime =
                  (member.averageResolutionTime * (member.resolvedTickets - 1) +
                    resolutionTime) /
                  member.resolvedTickets;
              }
            }

            if (ticket.messages && Array.isArray(ticket.messages)) {
              const messages = ticket.messages.map((msg) =>
                typeof msg === "string" ? JSON.parse(msg) : msg,
              );

              const staffMessages = messages.filter(
                (m) => m.userId === ticket.claimedBy,
              );
              member.totalMessages += staffMessages.length;

              staffMessages.forEach((msg) => {
                member.messagesBySource[msg.source]++;

                if (!member.name || !member.avatar) {
                  member.name = msg.username;
                  member.avatar = msg.avatarUrl || msg.avatar;
                }
              });

              const userFirstMessage = messages[0];
              const staffFirstResponse = messages.find(
                (m) => m.userId === ticket.claimedBy,
              );

              if (userFirstMessage && staffFirstResponse) {
                const responseTime =
                  new Date(staffFirstResponse.createdAt).getTime() -
                  new Date(userFirstMessage.createdAt).getTime();
                member.totalResponseTime += responseTime;
                member.ticketsWithResponse++;

                member.fastestResponse = Math.min(
                  member.fastestResponse,
                  responseTime,
                );
                member.slowestResponse = Math.max(
                  member.slowestResponse,
                  responseTime,
                );
              }

              messages.forEach((msg) => {
                if (msg.userId === ticket.claimedBy) {
                  const msgDate = new Date(msg.createdAt);
                  member.peakHours[msgDate.getHours()]++;
                  member.weekdayActivity[msgDate.getDay()]++;

                  if (
                    !member.lastActive ||
                    msgDate > new Date(member.lastActive)
                  ) {
                    member.lastActive = msgDate;
                  }
                }
              });
            }

            if (!member.name) {
              member.name = `Discord User ${member.id}`;
            }

            if (ticket.category) {
              const currentCount = member.categories.get(ticket.category) || 0;
              member.categories.set(ticket.category, currentCount + 1);
            }
          }
        });

        const stats = Array.from(supportMembers.values()).map((member) => ({
          id: member.id,
          name: member.name || "Unknown User",
          avatar: member.avatar,
          roleType:
            server.ticketManagerRoleId === member.id ? "manager" : "support",
          ticketsHandled: member.ticketsHandled,
          resolvedTickets: member.resolvedTickets,
          avgResponseTime:
            member.ticketsWithResponse > 0
              ? Math.round(
                  member.totalResponseTime /
                    member.ticketsWithResponse /
                    (1000 * 60),
                )
              : 0,
          fastestResponse:
            member.fastestResponse === Infinity
              ? 0
              : Math.round(member.fastestResponse / 1000),
          slowestResponse: Math.round(member.slowestResponse / 1000),
          resolutionRate:
            member.ticketsHandled > 0
              ? Math.round(
                  (member.resolvedTickets / member.ticketsHandled) * 100,
                )
              : 0,
          averageMessagesPerTicket:
            member.ticketsHandled > 0
              ? Math.round(member.totalMessages / member.ticketsHandled)
              : 0,
          lastActive: member.lastActive,
          peakHours: member.peakHours,
          weekdayActivity: member.weekdayActivity,
          categories: Array.from(member.categories.entries()).map(
            ([category, count]) => ({
              category,
              count,
              percentage: Math.round((count / member.ticketsHandled) * 100),
            }),
          ),
          averageResolutionTime: Math.round(
            member.averageResolutionTime / (1000 * 60),
          ),
          messagesBySource: member.messagesBySource,
        }));

        res.json(stats);
      } catch (error) {
        console.error("Error fetching support stats:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch support team statistics" });
      }
    },
  );

  app.get("/api/servers/:serverId/panels", requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const panels = await storage.getPanelsByServerId(server.id);
      res.json(panels);
    } catch (error) {
      console.error("Error fetching panels:", error);
      res.status(500).json({ message: "Failed to fetch panels" });
    }
  });

  app.post("/api/servers/:serverId/panels", requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const panel = await storage.createPanel({
        ...req.body,
        serverId: server.id,
        formEnabled: req.body.formEnabled,
        formFields: req.body.formFields,
      });

      await createTicketPanel(server.discordId, req.body.channelId, {
        ...panel,
        serverId: server.id,
      });

      res.json(panel);
    } catch (error) {
      console.error("Error creating panel:", error);
      res.status(500).json({ message: "Failed to create panel" });
    }
  });

  app.patch(
    "/api/servers/:serverId/panels/:panelId",
    requireAuth,
    async (req, res) => {
      try {
        const server = await storage.getServer(parseInt(req.params.serverId));
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const panelId = parseInt(req.params.panelId);
        const panel = await storage.getPanel(panelId);
        if (!panel) {
          return res.status(404).json({ message: "Panel not found" });
        }

        const updatedPanel = await storage.updatePanel(panelId, {
          ...req.body,
          formEnabled: req.body.formEnabled,
          formFields: req.body.formFields,
        });

        // Update Discord panel
        await createTicketPanel(server.discordId, panel.channelId, {
          ...updatedPanel,
          serverId: server.id,
        });

        res.json(updatedPanel);
      } catch (error) {
        console.error("Error updating panel:", error);
        res.status(500).json({ message: "Failed to update panel" });
      }
    },
  );

  app.delete(
    "/api/servers/:serverId/panels/:panelId",
    requireAuth,
    async (req, res) => {
      try {
        const server = await storage.getServer(parseInt(req.params.serverId));
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        await storage.deletePanel(parseInt(req.params.panelId));
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting panel:", error);
        res.status(500).json({
          message: "Failed to delete panel",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  app.post(
    "/api/servers/:serverId/panels/:panelId/resend",
    requireAuth,
    async (req, res) => {
      try {
        const server = await storage.getServer(parseInt(req.params.serverId));
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        if (
          server.ownerId !== (req.user as any).id &&
          server.claimedByUserId !== (req.user as any).id
        ) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const panel = await storage.getPanel(parseInt(req.params.panelId));
        if (!panel) {
          return res.status(404).json({ message: "Panel not found" });
        }

        await createTicketPanel(server.discordId, panel.channelId, {
          id: panel.id,
          title: panel.title,
          description: panel.description,
          prefix: panel.prefix,
          categoryId: panel.categoryId,
          supportRoleIds: panel.supportRoleIds,
          serverId: panel.serverId,
        });

        res.json({ success: true });
      } catch (error) {
        console.error("Error resending panel:", error);
        res.status(500).json({
          message: "Failed to resend panel",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  app.post("/api/stripe/webhook", setupStripeWebhooks());

  app.post("/api/stripe/create-subscription", requireAuth, async (req, res) => {
    try {
      const { priceId, serverId } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: "Price ID is required" });
      }

      console.log("Creating subscription:", { priceId, serverId });
      const subscription = await createSubscription(priceId, serverId);

      if (!subscription?.url) {
        throw new Error("Invalid response from Stripe");
      }

      res.json(subscription);
    } catch (error) {
      console.error("Subscription creation error:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  setupDiscordBot(httpServer).catch((error) => {
    console.error("Failed to initialize Discord bot:", error);
  });

  async function validateRoleId(
    guildId: string,
    roleId: string,
  ): Promise<any | null> {
    try {
      const guild = await client?.guilds.fetch(guildId);
      if (!guild) {
        throw new Error("Guild not found");
      }

      const role = await guild.roles.fetch(roleId);
      return role;
    } catch (error) {
      console.error("Error validating role:", error);
      return null;
    }
  }

  // Add these routes after existing routes

  // Knowledge Base Management
  app.get("/api/servers/:serverId/knowledge", requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const entries = await storage.getKnowledgeBaseByServerId(serverId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching knowledge base:", error);
      res.status(500).json({ message: "Failed to fetch knowledge base" });
    }
  });

  app.post("/api/servers/:serverId/knowledge", requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const entry = await storage.createKnowledgeBaseEntry({
        ...req.body,
        serverId,
      });

      res.json(entry);
    } catch (error) {
      console.error("Error creating knowledge base entry:", error);
      res.status(500).json({ message: "Failed to create knowledge base entry" });
    }
  });

  // AI Response Management
  app.post("/api/tickets/:ticketId/ai-respond", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      // Get knowledge base entries for this server
      const knowledgeBase = await storage.getKnowledgeBaseByServerId(server.id);

      // Get ticket messages
      const messages = ticket.messages.map(msg => 
        typeof msg === 'string' ? JSON.parse(msg) : msg
      );

      // Generate AI response
      const aiResponse = await generateTicketResponse(ticket, messages, knowledgeBase);

      // Create AI response record
      const response = await storage.createAiResponse({
        ticketId,
        response: aiResponse.response,
        confidence: aiResponse.confidence,
        usedKnowledgeBaseIds: aiResponse.usedKnowledgeBaseIds,
        handedOverToSupport: aiResponse.shouldHandover,
      });

      if (aiResponse.shouldHandover) {
        // Update ticket status to indicate human support is needed
        await storage.updateTicket(ticketId, {
          status: "needs_human",
        });

        return res.json({
          ...response,
          message: "Response generated but requires human support",
        });
      }

      // If confidence is high enough, automatically send the response
      if (await validateResponse(
        aiResponse.response,
        aiResponse.confidence,
        aiResponse.usedKnowledgeBaseIds
      )) {
        const newMessage = {
          id: messages.length + 1,
          content: aiResponse.response,
          userId: "AI_ASSISTANT",
          username: "AI Support",
          source: "ai",
          createdAt: new Date().toISOString(),
        };

        await storage.updateTicket(ticketId, {
          messages: [...messages, JSON.stringify(newMessage)],
        });

        return res.json({
          ...response,
          message: "AI response sent successfully",
        });
      }

      res.json(response);
    } catch (error) {
      console.error("Error generating AI response:", error);
      res.status(500).json({ message: "Failed to generate AI response" });
    }
  });

  // Support takeover endpoint
  app.post("/api/tickets/:ticketId/takeover", requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      // Verify user has permission to take over
      if (
        server.ownerId !== (req.user as any).id &&
        server.claimedByUserId !== (req.user as any).id
      ) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Update the ticket to mark it as taken over by support
      await storage.updateTicket(ticketId, {
        status: "open",
        claimedBy: (req.user as any).discordId,
      });

      // Add system message about takeover
      const messages = ticket.messages || [];
      const takeoverMessage = {
        id: messages.length + 1,
        content: `Support team member has taken over the conversation.`,
        userId: "SYSTEM",
        username: "System",
        source: "system",
        createdAt: new Date().toISOString(),
      };

      await storage.updateTicket(ticketId, {
        messages: [...messages, JSON.stringify(takeoverMessage)],
      });

      res.json({ message: "Successfully took over the ticket" });
    } catch (error) {
      console.error("Error taking over ticket:", error);
      res.status(500).json({ message: "Failed to take over ticket" });
    }
  });

  return httpServer;
}

let client: any;

async function generateTicketResponse(ticket: any, messages: any[], knowledgeBase: any[]): Promise<{response: string; confidence: number; usedKnowledgeBaseIds: number[]; shouldHandover: boolean}> {
  // Placeholder implementation - replace with actual AI logic
  const response = "I'm an AI, and I'm still under development. Please wait for a human agent.";
  const confidence = 0.5;
  const usedKnowledgeBaseIds: number[] = [];
  const shouldHandover = true;
  return { response, confidence, usedKnowledgeBaseIds, shouldHandover };
}

async function validateResponse(response: string, confidence: number, usedKnowledgeBaseIds: number[]): Promise<boolean> {
  // Placeholder implementation - replace with actual validation logic.  For example, only allow automatic responses if confidence > 0.8.
  return confidence > 0.8;
}