import Stripe from "stripe";
import { storage } from "./storage";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

if (!process.env.APP_URL) {
  throw new Error("APP_URL is required");
}

// Ensure APP_URL doesn't have any spaces or trailing slashes
const APP_URL = process.env.APP_URL.trim().replace(/\/$/, '');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export async function createSubscription(priceId: string, serverId?: number) {
  console.log('Creating subscription:', { 
    priceId, 
    serverId,
  });

  try {
    const metadata: Record<string, string> = {};
    if (serverId) {
      metadata.serverId = serverId.toString();
    }

    // Verify the price exists
    const price = await stripe.prices.retrieve(priceId);
    if (!price) {
      throw new Error(`Invalid price ID: ${priceId}`);
    }

    const session = await stripe.checkout.sessions.create({
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

    console.log('Checkout session created:', { 
      sessionId: session.id,
      url: session.url 
    });

    return session;
  } catch (error) {
    console.error('Stripe checkout session creation failed:', error);
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
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      res.status(400).send(`Webhook Error: ${(err as Error).message}`);
      return;
    }

    try {
      console.log('Processing webhook event:', event.type);

      switch (event.type) {
        case "checkout.session.completed":
          const session = event.data.object as Stripe.Checkout.Session;
          console.log('Checkout completed:', {
            sessionId: session.id,
            serverId: session.metadata?.serverId,
            subscriptionId: session.subscription
          });

          // Update server subscription status
          if (session.metadata?.serverId) {
            await storage.updateServer(parseInt(session.metadata.serverId), {
              subscriptionId: session.subscription as string,
              subscriptionStatus: "active",
            });
            console.log('Server subscription activated:', session.metadata.serverId);
          }
          break;

        case "customer.subscription.deleted":
        case "customer.subscription.updated":
          const subscription = event.data.object as Stripe.Subscription;
          console.log('Subscription updated:', {
            subscriptionId: subscription.id,
            status: subscription.status
          });

          // Find server by subscription ID and update status
          const server = await storage.getServerBySubscriptionId(subscription.id);
          if (server) {
            await storage.updateServer(server.id, {
              subscriptionStatus: subscription.status === "active" ? "active" : "inactive",
            });
            console.log('Server subscription updated:', { 
              serverId: server.id, 
              status: subscription.status 
            });
          }
          break;
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).send('Webhook processing failed');
    }
  };
}