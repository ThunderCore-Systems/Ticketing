import Stripe from "stripe";
import { storage } from "./storage";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

if (!process.env.APP_URL) {
  throw new Error(
    "APP_URL is required for Stripe redirects. It should be your Replit app URL.",
  );
}

// Ensure APP_URL doesn't have any trailing slashes and is a valid URL
const APP_URL = process.env.APP_URL.trim().replace(/\/$/, "");

// Validate APP_URL format
try {
  new URL(APP_URL);
} catch (e) {
  throw new Error(
    `Invalid APP_URL: ${APP_URL}. It should be a complete URL like https://your-app.username.repl.co`,
  );
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export async function createSubscription(priceId: string, serverId?: number) {
  console.log("Creating subscription:", {
    priceId,
    serverId,
  });

  try {
    const metadata: Record<string, string> = {};
    if (serverId) {
      metadata.serverId = serverId.toString();
    }

    const subscription = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata,
      success_url: `${APP_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}&server_id=${serverId}`,
      cancel_url: `${APP_URL}/billing?canceled=true`,
    });

    console.log("Checkout session created:", {
      sessionId: subscription.id,
      url: subscription.url,
    });

    return subscription;
  } catch (error) {
    console.error("Subscription creation error:", error);
    throw error;
  }
}

export function setupStripeWebhooks() {
  return async (req: any, res: any) => {
    const sig = req.headers["stripe-signature"];
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("STRIPE_WEBHOOK_SECRET is required");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
      return;
    }

    try {
      console.log("Processing webhook event:", event.type);

      switch (event.type) {
        case "checkout.session.completed":
          const session = event.data.object as Stripe.Checkout.Session;
          console.log("Checkout completed:", {
            sessionId: session.id,
            serverId: session.metadata?.serverId,
            subscriptionId: session.subscription,
          });

          // Get the user from the server if specified
          let userId: number | undefined;
          if (session.metadata?.serverId) {
            const server = await storage.getServer(
              parseInt(session.metadata.serverId),
            );
            if (server) {
              userId = server.ownerId;
            }
          }

          if (userId) {
            // Update user's server tokens (3 tokens for new subscription)
            const user = await storage.getUser(userId);
            if (user) {
              await storage.updateUser(userId, {
                serverTokens: 1,
              });
            }

            // If a server was specified, claim it
            if (session.metadata?.serverId) {
              await storage.updateServer(parseInt(session.metadata.serverId), {
                subscriptionId: session.subscription as string,
                subscriptionStatus: "active",
                claimedByUserId: userId,
              });
            }
          }
          break;

        case "customer.subscription.deleted":
          const deletedSubscription = event.data.object as Stripe.Subscription;
          // Find server by subscription ID and remove claims
          const serverToUnsubscribe = await storage.getServerBySubscriptionId(
            deletedSubscription.id,
          );
          if (serverToUnsubscribe && serverToUnsubscribe.claimedByUserId) {
            // Remove server claim and update status
            await storage.updateServer(serverToUnsubscribe.id, {
              subscriptionStatus: "inactive",
              claimedByUserId: null,
            });

            // Update user's available tokens
            const user = await storage.getUser(
              serverToUnsubscribe.claimedByUserId,
            );
            if (user) {
              await storage.updateUser(user.id, {
                serverTokens: Math.max(0, (user.serverTokens || 0) - 1),
              });
            }
          }
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).send("Webhook processing failed");
    }
  };
}
