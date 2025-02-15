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
  client
} from "./discord";
import { setupStripeWebhooks, createSubscription } from "./stripe";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import type { DiscordGuild, TicketMessage } from "./types";
import { TextChannel, EmbedBuilder } from 'discord.js';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_CALLBACK_URL = 'https://ad7a4acc-d2b0-41d3-9fcb-5265de129fe6-00-h99bmtj9jxc4.spock.replit.dev/api/auth/discord/callback';

function requireAuth(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
}

async function registerUserServers(userId: number, guilds: DiscordGuild[]) {
  for (const guild of guilds) {
    if (guild.owner || (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0x8)) {
      const existingServer = await storage.getServerByDiscordId(guild.id);
      if (!existingServer) {
        await storage.createServer({
          discordId: guild.id,
          name: guild.name,
          icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
          ownerId: userId,
          subscriptionId: null,
          subscriptionStatus: null,
        });
      }
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      sameSite: 'none'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(new DiscordStrategy({
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds', 'email']
  }, async (accessToken, refreshToken, profile: any, done) => {
    try {
      console.log('Discord auth callback received:', { 
        userId: profile.id,
        username: profile.username,
        guilds: profile.guilds?.length
      });

      let user = await storage.getUserByDiscordId(profile.id);

      if (!user) {
        user = await storage.createUser({
          discordId: profile.id,
          username: profile.username,
          avatarUrl: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
          accessToken,
          refreshToken,
        });
      } else {
        user = await storage.updateUser(user.id, {
          username: profile.username,
          avatarUrl: profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` : null,
          accessToken,
          refreshToken,
        });
      }

      if (profile.guilds) {
        await registerUserServers(user.id, profile.guilds);
      }

      done(null, user);
    } catch (error) {
      console.error('Error in Discord auth:', error);
      done(error as Error);
    }
  }));

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

  app.get('/api/auth/discord', passport.authenticate('discord'));
  app.get('/api/auth/discord/callback',
    passport.authenticate('discord', {
      failureRedirect: '/login?error=auth_failed',
      successRedirect: '/dashboard'
    })
  );

  app.post('/api/auth/logout', (req, res) => {
    req.logout(() => {
      res.json({ success: true });
    });
  });

  app.get('/api/auth/user', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    res.json(req.user);
  });

  app.get('/api/servers', requireAuth, async (req, res) => {
    const servers = await storage.getServersByUserId((req.user as any).id);
    res.json(servers);
  });

  app.get('/api/servers/:serverId', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));

      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized to view this server' });
      }

      res.json(server);
    } catch (error) {
      console.error('Error fetching server:', error);
      res.status(500).json({ message: 'Failed to fetch server details' });
    }
  });

  app.get('/api/servers/:serverId/tickets', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Check if user has ticket manager role
      const hasManagerRole = server.ticketManagerRoleId === (req.user as any).discordId;

      // If user is not a ticket manager, only return open tickets
      const tickets = await storage.getTicketsByServerId(parseInt(req.params.serverId));
      const filteredTickets = hasManagerRole ? tickets : tickets.filter(ticket => ticket.status === 'open');

      res.json(filteredTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ message: 'Failed to fetch tickets' });
    }
  });

  app.post('/api/servers/:serverId/tickets', requireAuth, async (req, res) => {
    try {
      const ticket = await storage.createTicket({
        ...insertTicketSchema.parse(req.body),
        serverId: parseInt(req.params.serverId),
        formResponses: req.body.formResponses ? JSON.stringify(req.body.formResponses) : null,
      });

      // Get the panel to include form responses in the initial message
      const panel = await storage.getPanel(ticket.panelId);

      if (panel && ticket.formResponses) {
        const formattedResponses = Object.entries(JSON.parse(ticket.formResponses))
          .map(([fieldId, value]) => {
            const field = panel.formFields.find((f: any) => f.id === fieldId);
            return field ? `**${field.label}**: ${value}` : null;
          })
          .filter(Boolean)
          .join('\n');

        if (formattedResponses) {
          const messages = ticket.messages || [];
          const initialMessage = {
            id: messages.length + 1,
            content: `**Ticket Information**\n${formattedResponses}`,
            userId: (req.user as any).id,
            username: 'System',
            source: 'system',
            createdAt: new Date().toISOString()
          };

          await storage.updateTicket(ticket.id, {
            messages: [...messages, JSON.stringify(initialMessage)]
          });
        }
      }

      res.json(ticket);
    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ message: 'Failed to create ticket' });
    }
  });

  app.get('/api/tickets/:ticketId/messages', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const messages = (ticket.messages || []).map(msg => {
        const message = typeof msg === 'string' ? JSON.parse(msg) : msg;
        return {
          ...message,
          isDiscord: message.source === 'discord',
          isSupport: ticket.claimedBy === message.userId,
        };
      });

      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ message: 'Failed to fetch messages' });
    }
  });

  const messageSchema = z.object({
    content: z.string().min(1, "Message content is required"),
    source: z.enum(["discord", "dashboard"]).default("dashboard"),
    username: z.string().optional(),
    avatarUrl: z.string().optional(),
  });

  app.post('/api/tickets/:ticketId/messages', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId!);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check if user has permission to send messages
      if (server.restrict_claimed_messages && ticket.claimedBy) {
        // Allow server owner and claimed user to send messages
        const isOwner = server.ownerId === (req.user as any).id;
        const isClaimedBy = ticket.claimedBy === (req.user as any).discordId;

        if (!isOwner && !isClaimedBy) {
          return res.status(403).json({ 
            message: 'This ticket has been claimed by another staff member'
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
        createdAt: new Date().toISOString()
      };

      await storage.updateTicket(ticketId, {
        messages: [...existingMessages, JSON.stringify(newMessage)],
      });

      if (server.ownerId === (req.user as any).id || server.claimedByUserId === (req.user as any).id) {
        await sendWebhookMessage(
          ticket.channelId!,
          content,
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl
        );
      }

      res.json(newMessage);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ message: 'Failed to create message' });
    }
  });

  app.get('/api/tickets/:ticketId', requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(parseInt(req.params.ticketId));

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized to view this ticket' });
      }

      res.json(ticket);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      res.status(500).json({ message: 'Failed to fetch ticket details' });
    }
  });


  // Add these new ticket management routes after the existing ticket routes
  app.post('/api/tickets/:ticketId/claim', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Verify user permission
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Toggle claim status
      const updatedTicket = await storage.updateTicket(ticketId, {
        claimedBy: ticket.claimedBy === (req.user as any).discordId ? null : (req.user as any).discordId
      });

      if (ticket.channelId) {
        const embed = new EmbedBuilder()
          .setTitle(updatedTicket.claimedBy ? 'Ticket Claimed' : 'Ticket Unclaimed')
          .setDescription(updatedTicket.claimedBy ? 
            `Ticket claimed by <@${updatedTicket.claimedBy}>` :
            'Ticket is now unclaimed')
          .setColor(updatedTicket.claimedBy ? 0x00FF00 : 0xFF0000)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          '',
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed]
        );
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error claiming ticket:', error);
      res.status(500).json({ message: 'Failed to claim ticket' });
    }
  });

  app.post('/api/tickets/:ticketId/add-user', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Verify user permission
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      if (!ticket.channelId) {
        return res.status(400).json({ message: 'No Discord channel associated with this ticket' });
      }

      const channel = await client?.channels.fetch(ticket.channelId);
      if (channel instanceof TextChannel) {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        const embed = new EmbedBuilder()
          .setTitle('User Added')
          .setDescription(`<@${userId}> has been added to the ticket`)
          .setColor(0x00FF00)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          '',
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error adding user:', error);
      res.status(500).json({ message: 'Failed to add user' });
    }
  });

  app.post('/api/tickets/:ticketId/transcript', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      if (!ticket.channelId) {
        return res.status(400).json({ message: 'No Discord channel associated with this ticket' });
      }

      const messages = await storage.getMessagesByTicketId(ticketId);
      const transcriptText = messages.map(msg => {
        const message = typeof msg === 'string' ? JSON.parse(msg) : msg;
        return `${message.username} (${message.source}): ${message.content}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('Ticket Transcript')
        .setDescription('Transcript saved')
        .setColor(0x00FF00)
        .setTimestamp();

      await sendWebhookMessage(
        ticket.channelId,
        transcriptText,
        (req.user as any).username,
        server.anonymousMode || false,
        server.webhookAvatar,
        (req.user as any).avatarUrl,
        [embed]
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error saving transcript:', error);
      res.status(500).json({ message: 'Failed to save transcript' });
    }
  });

  app.patch('/api/tickets/:ticketId', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const status = req.body.status;
      if (!status || !['open', 'closed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const updatedTicket = await storage.updateTicket(ticketId, {
        status,
        closedAt: status === 'closed' ? new Date() : null,
        closedBy: status === 'closed' ? (req.user as any).discordId : null
      });

      if (ticket.channelId) {
        const channel = await client?.channels.fetch(ticket.channelId);
        if (channel instanceof TextChannel) {
          if (status === 'closed') {
            // Remove user's access when closing
            await channel.permissionOverwrites.edit(ticket.userId, {
              ViewChannel: false,
            });

            // Create support team control panel
            const controlPanel = new EmbedBuilder()
              .setTitle('Ticket Controls')
              .setDescription('This ticket has been closed. Use the buttons below to manage the ticket.')
              .setColor(0xFF0000)
              .setTimestamp();

            // Send webhook message with closure notification
            const closeEmbed = new EmbedBuilder()
              .setTitle('Ticket Closed')
              .setDescription(`Ticket closed by <@${(req.user as any).discordId}>`)
              .setColor(0xFF0000)
              .setTimestamp();

            await sendWebhookMessage(
              ticket.channelId,
              '',
              (req.user as any).username,
              server.anonymousMode || false,
              server.webhookAvatar,
              (req.user as any).avatarUrl,
              [closeEmbed, controlPanel]
            );
          } else {
            // Reopening ticket
            await channel.permissionOverwrites.edit(ticket.userId, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
            });

            const reopenEmbed = new EmbedBuilder()
              .setTitle('Ticket Reopened')
              .setDescription(`Ticket reopened by <@${(req.user as any).discordId}>`)
              .setColor(0x00FF00)
              .setTimestamp();

            await sendWebhookMessage(
              ticket.channelId,
              '',
              (req.user as any).username,
              server.anonymousMode || false,
              server.webhookAvatar,
              (req.user as any).avatarUrl,
              [reopenEmbed]
            );
          }
        }
      }

      res.json(updatedTicket);
    } catch (error) {
      console.error('Error updating ticket:', error);
      res.status(500).json({ message: 'Failed to update ticket' });
    }
  });

  app.post('/api/tickets/:ticketId/remove-user', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      if (ticket.channelId) {
        const channel = await client.channels.fetch(ticket.channelId);
        if (channel instanceof TextChannel) {
          await channel.permissionOverwrites.delete(userId);
        }
      }

      if (ticket.channelId) {
        const embed = new EmbedBuilder()
          .setTitle('User Removed')
          .setDescription(`<@${userId}> has been removed from the ticket`)
          .setColor(0xFF0000)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          '',
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing user:', error);
      res.status(500).json({ message: 'Failed to remove user' });
    }
  });

  app.post('/api/tickets/:ticketId/upgrade', requireAuth, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const ticket = await storage.getTicket(ticketId);

      if (!ticket) {
        return res.status(404).json({ message: 'Ticket not found' });
      }

      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const { roleId } = req.body;
      if (!roleId) {
        return res.status(400).json({ message: 'Role ID is required' });
      }

      const role = await validateRoleId(server.discordId, roleId);
      if (!role) {
        return res.status(400).json({ message: 'Invalid role ID' });
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
          .setTitle('Ticket Upgraded')
          .setDescription(`This ticket has been upgraded to include the role <@&${roleId}>`)
          .setColor(0x00FF00)
          .setTimestamp();

        await sendWebhookMessage(
          ticket.channelId,
          '',
          (req.user as any).username,
          server.anonymousMode || false,
          server.webhookAvatar,
          (req.user as any).avatarUrl,
          [embed]
        );
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error upgrading ticket:', error);
      res.status(500).json({ message: 'Failed to upgrade ticket' });
    }
  });

  app.get('/api/panels/:panelId', requireAuth, async (req, res) => {
    try {
      const panel = await storage.getPanel(parseInt(req.params.panelId));

      if (!panel) {
        return res.status(404).json({ message: 'Panel not found' });
      }

      const server = await storage.getServer(panel.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized to view this panel' });
      }

      res.json(panel);
    } catch (error) {
      console.error('Error fetching panel:', error);
      res.status(500).json({ message: 'Failed to fetch panel details' });
    }
  });

  app.get('/api/servers/:serverId/panel-groups', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const groups = await storage.getPanelGroupsByServerId(parseInt(req.params.serverId));
      res.json(groups);
    } catch (error) {
      console.error('Error fetching panel groups:', error);
      res.status(500).json({ message: 'Failed to fetch panel groups' });
    }
  });

  app.post('/api/servers/:serverId/panel-groups', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Get the current highest order number
      const existingGroups = await storage.getPanelGroupsByServerId(parseInt(req.params.serverId));
      const maxOrder = existingGroups.reduce((max, group) => Math.max(max, group.order), -1);

      const group = await storage.createPanelGroup({
        ...req.body,
        serverId: parseInt(req.params.serverId),
        order: maxOrder + 1
      });

      res.json(group);
    } catch (error) {
      console.error('Error creating panel group:', error);
      res.status(500).json({ message: 'Failed to create panel group' });
    }
  });

  app.patch('/api/servers/:serverId/panels/:panelId/order', requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const panelId = parseInt(req.params.panelId);
      const { order, groupId } = req.body;

      const server = await storage.getServer(serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const panel = await storage.getPanel(panelId);
      if (!panel) {
        return res.status(404).json({ message: 'Panel not found' });
      }

      const updatedPanel = await storage.updatePanelOrder(panelId, order, groupId);
      res.json(updatedPanel);
    } catch (error) {
      console.error('Error updating panel order:', error);
      res.status(500).json({ message: 'Failed to update panel order' });
    }
  });

  app.post('/api/servers/:serverId/panels', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const panel = await storage.createPanel({
        ...req.body,
        serverId: server.id,
        formEnabled: req.body.formEnabled,
        formFields: req.body.formFields
      });

      await createTicketPanel(
        server.discordId,
        req.body.channelId,
        {
          ...panel,
          serverId: server.id
        }
      );

      res.json(panel);
    } catch (error) {
      console.error('Error creating panel:', error);
      res.status(500).json({ message: 'Failed to create panel' });
    }
  });

  app.patch('/api/servers/:serverId/panels/:panelId', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const panelId = parseInt(req.params.panelId);
      const panel = await storage.getPanel(panelId);
      if (!panel) {
        return res.status(404).json({ message: 'Panel not found' });
      }

      const updatedPanel = await storage.updatePanel(panelId, {
        ...req.body,
        formEnabled: req.body.formEnabled,
        formFields: req.body.formFields
      });

      // Update Discord panel
      await createTicketPanel(
        server.discordId,
        panel.channelId,
        {
          ...updatedPanel,
          serverId: server.id
        }
      );

      res.json(updatedPanel);
    } catch (error) {
      console.error('Error updating panel:', error);
      res.status(500).json({ message: 'Failed to update panel' });
    }
  });

  app.delete('/api/servers/:serverId/panels/:panelId', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      await storage.deletePanel(parseInt(req.params.panelId));
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting panel:', error);
      res.status(500).json({ 
        message: 'Failed to delete panel',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post('/api/servers/:serverId/panels/:panelId/resend', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const panel = await storage.getPanel(parseInt(req.params.panelId));
      if (!panel) {
        return res.status(404).json({ message: 'Panel not found' });
      }

      await createTicketPanel(
        server.discordId,
        panel.channelId,
        {
          id: panel.id,
          title: panel.title,
          description: panel.description,
          prefix: panel.prefix,
          categoryId: panel.categoryId,
          supportRoleIds: panel.supportRoleIds,
          serverId: panel.serverId
        }
      );

      res.json({ success: true });
    } catch (error) {
      console.error('Error resending panel:', error);
      res.status(500).json({ 
        message: 'Failed to resend panel',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get('/api/servers/:serverId/channels', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const channels = await getServerChannels(server.discordId);
      res.json(channels);
    } catch (error) {
      console.error('Error fetching channels:', error);
      res.status(500).json({ message: 'Failed to fetch channels' });
    }
  });

  app.get('/api/servers/:serverId/categories', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const categories = await getServerCategories(server.discordId);
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ message: 'Failed to fetch categories' });
    }
  });

  app.get('/api/servers/:serverId/roles', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const roles = await getServerRoles(server.discordId);
      res.json(roles.filter(role => role.name !== '@everyone'));
    } catch (error) {
      console.error('Error fetching roles:', error);
      res.status(500).json({ message: 'Failed to fetch roles' });
    }
  });

  app.post('/api/stripe/webhook', setupStripeWebhooks());

  setupDiscordBot(httpServer).catch((error) => {
    console.error('Failed to initialize Discord bot:', error);
  });

  async function validateRoleId(guildId: string, roleId: string): Promise<any | null> {
    try {
      const guild = await client?.guilds.fetch(guildId);
      if (!guild) {
        throw new Error('Guild not found');
      }

      const role = await guild.roles.fetch(roleId);
      return role;
    } catch (error) {
      console.error('Error validating role:', error);
      return null;
    }
  }

  return httpServer;
}

let client: any;