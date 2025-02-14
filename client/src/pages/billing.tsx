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

  const handleSubscribe = async () => {
    try {
      setLoading(true);
      const session = await createSubscription(PRICE_ID);
      window.location.href = session.url!;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create subscription",
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
        <Card>
          <CardHeader>
            <CardTitle>Pro Plan</CardTitle>
            <CardDescription>
              Unlimited tickets and premium support
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <span className="text-3xl font-bold">$10</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <Button
              className="w-full"
              onClick={handleSubscribe}
              disabled={loading}
            >
              Subscribe Now
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}