import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertTicketSchema, insertMessageSchema } from "@shared/schema";
import { setupDiscordBot } from "./discord";
import { setupStripeWebhooks, createSubscription } from "./stripe";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL!;

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // Session setup
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Discord OAuth
  passport.use(new DiscordStrategy({
    clientID: DISCORD_CLIENT_ID,
    clientSecret: DISCORD_CLIENT_SECRET,
    callbackURL: DISCORD_CALLBACK_URL,
    scope: ['identify', 'guilds']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await storage.getUserByDiscordId(profile.id);

      if (!user) {
        user = await storage.createUser({
          discordId: profile.id,
          username: profile.username,
          avatarUrl: profile.avatar,
          accessToken,
          refreshToken,
        });
      } else {
        user = await storage.updateUser(user.id, {
          accessToken,
          refreshToken,
        });
      }

      done(null, user);
    } catch (error) {
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
    passport.authenticate('discord', { 
      failureRedirect: '/login',
      successRedirect: '/dashboard'
    })
  );

  app.get('/api/auth/user', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    res.json(req.user);
  });

  // Server routes
  app.get('/api/servers', async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    const servers = await storage.getServersByUserId((req.user as any).id);
    res.json(servers);
  });

  // Ticket routes
  app.get('/api/servers/:serverId/tickets', async (req, res) => {
    const tickets = await storage.getTicketsByServerId(parseInt(req.params.serverId));
    res.json(tickets);
  });

  app.post('/api/servers/:serverId/tickets', async (req, res) => {
    const ticket = await storage.createTicket({
      ...insertTicketSchema.parse(req.body),
      serverId: parseInt(req.params.serverId),
    });
    res.json(ticket);
  });

  app.get('/api/tickets/:ticketId/messages', async (req, res) => {
    const messages = await storage.getMessagesByTicketId(parseInt(req.params.ticketId));
    res.json(messages);
  });

  app.post('/api/tickets/:ticketId/messages', async (req, res) => {
    const message = await storage.createMessage({
      ...insertMessageSchema.parse(req.body),
      ticketId: parseInt(req.params.ticketId),
    });
    res.json(message);
  });

  // Stripe webhook
  app.post('/api/stripe/webhook', setupStripeWebhooks());

  // Stripe subscription
  app.post('/api/stripe/create-subscription', async (req, res) => {
    try {
      const subscription = await createSubscription(req.body.priceId);
      res.json(subscription);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Initialize Discord bot in the background
  setupDiscordBot(httpServer).catch((error) => {
    console.error('Failed to initialize Discord bot:', error);
    // Continue running the server even if bot fails to initialize
  });

  return httpServer;
}