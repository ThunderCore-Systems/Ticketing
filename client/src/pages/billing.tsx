import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createSubscription } from "@/lib/stripe";
import type { Server } from "@shared/schema";

const PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID!;

export default function Billing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { data: servers } = useQuery<Server[]>({ 
    queryKey: ["/api/servers"]
  });

  const handleSubscribe = async (serverId?: number) => {
    try {
      setLoading(true);
      const session = await createSubscription(PRICE_ID, serverId);
      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Subscription error:", error);
      toast({
        title: "Error",
        description: "Failed to create subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!servers) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Billing</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => (
          <Card key={server.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {server.icon && (
                  <img 
                    src={server.icon} 
                    alt={server.name}
                    className="h-6 w-6 rounded-full"
                  />
                )}
                {server.name}
              </CardTitle>
              <CardDescription>
                Status: {server.subscriptionStatus || "No subscription"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <span className="text-3xl font-bold">$10</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Button
                className="w-full"
                onClick={() => handleSubscribe(server.id)}
                disabled={loading || server.subscriptionStatus === "active"}
              >
                {server.subscriptionStatus === "active" 
                  ? "Active" 
                  : "Subscribe Now"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}