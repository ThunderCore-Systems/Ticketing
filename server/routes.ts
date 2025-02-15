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
  sendWebhookMessage
} from "./discord";
import { setupStripeWebhooks, createSubscription } from "./stripe";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import type { DiscordGuild, TicketMessage } from "./types";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_CALLBACK_URL = `${process.env.APP_URL}/api/auth/discord/callback`;

// Add authentication middleware
function requireAuth(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
}

async function registerUserServers(userId: number, guilds: DiscordGuild[]) {
  for (const guild of guilds) {
    // Only register servers where the user is an admin
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

  // Session setup
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

  // Discord OAuth strategy with improved error handling
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

      // Register user's servers
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

  // Auth routes
  app.get('/api/auth/discord', passport.authenticate('discord'));
  app.get('/api/auth/discord/callback',
    (req, res, next) => {
      passport.authenticate('discord', (err: any, user: any) => {
        if (err) {
          console.error('Discord auth error:', err);
          return res.redirect('/login?error=' + encodeURIComponent(err.message));
        }
        if (!user) {
          return res.redirect('/login?error=auth_failed');
        }
        req.logIn(user, (err) => {
          if (err) {
            console.error('Login error:', err);
            return res.redirect('/login?error=login_failed');
          }
          return res.redirect('/dashboard');
        });
      })(req, res, next);
    }
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

  // Protected routes - add requireAuth middleware
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

      // Ensure user has access to this server
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
    const tickets = await storage.getTicketsByServerId(parseInt(req.params.serverId));
    res.json(tickets);
  });

  app.post('/api/servers/:serverId/tickets', requireAuth, async (req, res) => {
    const ticket = await storage.createTicket({
      ...insertTicketSchema.parse(req.body),
      serverId: parseInt(req.params.serverId),
    });
    res.json(ticket);
  });

  app.get('/api/tickets/:ticketId/messages', requireAuth, async (req, res) => {
    const messages = await storage.getMessagesByTicketId(parseInt(req.params.ticketId));
    res.json(messages);
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

      // Create message schema for validation
      const messageSchema = z.object({
        content: z.string().min(1, "Message content is required"),
      });

      const { content } = messageSchema.parse(req.body);

      // Get existing messages
      const existingMessages = ticket.messages || [];
      const newMessage: TicketMessage = {
        id: existingMessages.length + 1,
        content,
        userId: (req.user as any).id,
        username: (req.user as any).username,
        createdAt: new Date().toISOString()
      };

      // Update ticket with new message
      await storage.updateTicket(ticketId, {
        messages: [...existingMessages, JSON.stringify(newMessage)],
      });

      // Send webhook message if the user is support staff
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

      // Get server to check permissions
      const server = await storage.getServer(ticket.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check if user has access to this server's tickets
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized to view this ticket' });
      }

      res.json(ticket);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      res.status(500).json({ message: 'Failed to fetch ticket details' });
    }
  });

  app.get('/api/panels/:panelId', requireAuth, async (req, res) => {
    try {
      const panel = await storage.getPanel(parseInt(req.params.panelId));

      if (!panel) {
        return res.status(404).json({ message: 'Panel not found' });
      }

      // Get server to check permissions
      const server = await storage.getServer(panel.serverId);
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check if user has access to this server's panels
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized to view this panel' });
      }

      res.json(panel);
    } catch (error) {
      console.error('Error fetching panel:', error);
      res.status(500).json({ message: 'Failed to fetch panel details' });
    }
  });

  //Add new endpoint for activating servers with tokens
  app.post('/api/servers/:serverId/activate', requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const userId = (req.user as any).id;

      // Get user and check tokens
      const user = await storage.getUser(userId);
      if (!user || !user.serverTokens || user.serverTokens <= 0) {
        return res.status(400).json({
          error: "No server tokens available. Please purchase a subscription."
        });
      }

      // Update user's tokens
      await storage.updateUser(userId, {
        serverTokens: user.serverTokens - 1
      });

      // Activate the server
      const server = await storage.updateServer(serverId, {
        subscriptionStatus: "active",
        claimedByUserId: userId
      });

      res.json(server);
    } catch (error) {
      console.error('Server activation error:', error);
      res.status(500).json({ error: "Failed to activate server" });
    }
  });

  // Discord server information endpoints
  app.get('/api/servers/:serverId/channels', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
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

      // Check access
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

  // Change the server routes for roles endpoint
  app.get('/api/servers/:serverId/roles', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Get roles from Discord and return them directly
      const roles = await getServerRoles(server.discordId);
      res.json(roles.filter(role => role.name !== '@everyone'));
    } catch (error) {
      console.error('Error fetching roles:', error);
      res.status(500).json({ 
        message: 'Failed to fetch roles',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update server settings endpoint
  app.patch('/api/servers/:serverId', requireAuth, async (req, res) => {
    try {
      const serverId = parseInt(req.params.serverId);
      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Update server settings
      const updatedServer = await storage.updateServer(serverId, req.body);
      res.json(updatedServer);
    } catch (error) {
      console.error('Error updating server:', error);
      res.status(500).json({
        message: 'Failed to update server settings',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add the support stats endpoint before the Stripe webhook endpoint
  app.get('/api/servers/:serverId/support-stats', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Get all tickets and panels for this server
      const tickets = await storage.getTicketsByServerId(server.id);
      const panels = await storage.getPanelsByServerId(server.id);

      // Get Discord roles information
      const roles = await getServerRoles(server.discordId);

      // Collect all support role IDs
      const supportRoleIds = new Set<string>();
      if (server.ticketManagerRoleId) {
        supportRoleIds.add(server.ticketManagerRoleId);
      }
      panels.forEach(panel => {
        panel.supportRoleIds.forEach(roleId => supportRoleIds.add(roleId));
      });

      // Create a map to track support member stats
      const supportMembers = new Map();

      // Process ticket data
      tickets.forEach(ticket => {
        if (ticket.claimedBy) {
          // Initialize member stats if not exists
          if (!supportMembers.has(ticket.claimedBy)) {
            supportMembers.set(ticket.claimedBy, {
              id: ticket.claimedBy,
              ticketsHandled: 0,
              resolvedTickets: 0,
              totalResponseTime: 0,
              ticketsWithResponse: 0,
              lastActive: null,
              name: null, //added
            });
          }

          const member = supportMembers.get(ticket.claimedBy);
          member.ticketsHandled++;

          if (ticket.status === "closed") {
            member.resolvedTickets++;
          }

          if (ticket.messages?.length > 1) {
            const firstMessage = ticket.messages[0];
            const firstResponse = ticket.messages[1];
            if (firstMessage && firstResponse) {
              member.totalResponseTime += new Date(firstResponse.createdAt).getTime() - new Date(firstMessage.createdAt).getTime();
              member.ticketsWithResponse++;
            }

            // Update last active time
            const messages = ticket.messages;
            if (messages.length > 0) {
              const lastMessageTime = new Date(messages[messages.length - 1].createdAt);
              if (!member.lastActive || lastMessageTime > member.lastActive) {
                member.lastActive = lastMessageTime;
                // Update username from the last message
                member.name = messages[messages.length - 1].username;
              }
            }
          }
        }
      });

      // Calculate final stats for each member
      const stats = Array.from(supportMembers.values()).map(member => ({
        id: member.id,
        name: member.name || 'Unknown User',
        roleType: server.ticketManagerRoleId === member.id ? 'manager' : 'support',
        ticketsHandled: member.ticketsHandled,
        avgResponseTime: member.ticketsWithResponse > 0 
          ? Math.round(member.totalResponseTime / member.ticketsWithResponse / (1000 * 60))
          : 0,
        resolutionRate: member.ticketsHandled > 0
          ? Math.round((member.resolvedTickets / member.ticketsHandled) * 100)
          : 0,
        lastActive: member.lastActive,
      }));

      res.json(stats);
    } catch (error) {
      console.error('Error fetching support stats:', error);
      res.status(500).json({ 
        message: 'Failed to fetch support team statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add the panels endpoint after the roles endpoint
  app.get('/api/servers/:serverId/panels', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const panels = await storage.getPanelsByServerId(server.id);
      res.json(panels);
    } catch (error) {
      console.error('Error fetching panels:', error);
      res.status(500).json({ message: 'Failed to fetch panels' });
    }
  });

  // Panel creation endpoint
  app.post('/api/servers/:serverId/panels', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      // Create panel in database first
      const panel = await storage.createPanel({
        ...req.body,
        serverId: server.id,
      });

      console.log('Creating Discord panel with data:', {
        guildId: server.discordId,
        channelId: panel.channelId,
        panel: {
          id: panel.id,
          title: panel.title,
          description: panel.description,
          prefix: panel.prefix,
          categoryId: panel.categoryId,
          supportRoleIds: panel.supportRoleIds,
        }
      });

      // Create and send Discord embed
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
        }
      );

      res.json(panel);
    } catch (error) {
      console.error('Error creating panel:', error);
      res.status(500).json({ 
        message: 'Failed to create panel',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Add new endpoints for panel management
  app.patch('/api/servers/:serverId/panels/:panelId', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
      if (server.ownerId !== (req.user as any).id && server.claimedByUserId !== (req.user as any).id) {
        return res.status(403).json({ message: 'Not authorized' });
      }

      const panel = await storage.updatePanel(parseInt(req.params.panelId), req.body);

      // Recreate panel in Discord if requested
      if (req.query.resend === 'true') {
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
      }

      res.json(panel);
    } catch (error) {
      console.error('Error updating panel:', error);
      res.status(500).json({ 
        message: 'Failed to update panel',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete('/api/servers/:serverId/panels/:panelId', requireAuth, async (req, res) => {
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: 'Server not found' });
      }

      // Check access
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

      // Check access
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

  // Stripe webhook - no auth required
  app.post('/api/stripe/webhook', setupStripeWebhooks());

  // Stripe subscription - requires auth
  app.post('/api/stripe/create-subscription', requireAuth, async (req, res) => {
    try {
      const { priceId, serverId } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: "Price ID is required" });
      }

      console.log('Creating subscription:', { priceId, serverId });
      const subscription = await createSubscription(priceId, serverId);

      if (!subscription?.url) {
        throw new Error("Invalid response from Stripe");
      }

      res.json(subscription);
    } catch (error) {
      console.error('Subscription creation error:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Initialize Discord bot in the background
  setupDiscordBot(httpServer).catch((error) => {
    console.error('Failed to initialize Discord bot:', error);
  });

  return httpServer;
}