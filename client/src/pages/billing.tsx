import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { createSubscription } from "@/lib/stripe";
import type { Server } from "@shared/schema";

const PRICE_ID = "price_1QsY8yP6DDFtG7MvtzQmVgyt"; // Direct price ID

export default function Billing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { data: servers } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  useEffect(() => {
    // Check URL parameters for subscription status
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const canceled = params.get('canceled');
    const serverId = params.get('server_id');

    if (success === 'true') {
      toast({
        title: "Subscription Activated",
        description: "Your subscription has been successfully activated.",
      });
      // Invalidate servers query to refresh subscription status
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
    } else if (canceled === 'true') {
      toast({
        title: "Subscription Canceled",
        description: "Your subscription process was canceled.",
        variant: "destructive",
      });
    }

    // Clean up URL parameters
    if (success || canceled) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [toast, queryClient]);

  const handleSubscribe = async (serverId?: number) => {
    try {
      setLoading(true);
      console.log("Starting subscription process:", {
        serverId,
        priceId: PRICE_ID,
      });

      const session = await createSubscription(PRICE_ID, serverId);
      console.log("Subscription session created:", session);

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
              <CardDescription className="flex items-center gap-2">
                Status:{" "}
                <Badge
                  variant={server.subscriptionStatus === "active" ? "default" : "destructive"}
                >
                  {server.subscriptionStatus || "No subscription"}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {server.subscriptionStatus === "active" ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-3xl font-bold">$10</span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                      <Badge variant="outline">Active</Badge>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => handleSubscribe(server.id)}
                      disabled={loading}
                    >
                      Manage Subscription
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-3xl font-bold">$10</span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                      <Badge variant="outline">Inactive</Badge>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handleSubscribe(server.id)}
                      disabled={loading}
                    >
                      Subscribe Now
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}