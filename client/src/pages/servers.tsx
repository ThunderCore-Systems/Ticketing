import { useQuery } from "@tanstack/react-query";
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
import { createSubscription, SUBSCRIPTION_PRICE_ID } from "@/lib/stripe";
import type { Server, User } from "@shared/schema";

export default function Servers() {
  const { toast } = useToast();
  const { data: servers } = useQuery<Server[]>({ 
    queryKey: ["/api/servers"]
  });
  const { data: user } = useQuery<User>({ 
    queryKey: ["/api/auth/user"]
  });

  if (!servers || !user) {
    return null;
  }

  const availableTokens = user.serverTokens || 0;
  const claimedServers = servers.filter(s => s.claimedByUserId === user.id);
  const canClaimMore = availableTokens > claimedServers.length;

  const handleClaimServer = async (serverId: number) => {
    try {
      await createSubscription(SUBSCRIPTION_PRICE_ID, serverId);
    } catch (error) {
      console.error('Failed to claim server:', error);
      toast({
        title: "Error",
        description: "Failed to claim server. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Servers</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Server Claims Available:
          </span>
          <Badge variant={canClaimMore ? "default" : "secondary"}>
            {availableTokens - claimedServers.length} / {availableTokens}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => {
          const isClaimed = Boolean(server.claimedByUserId);
          const isOwnClaim = server.claimedByUserId === user.id;

          return (
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
                  {isClaimed && (
                    <Badge variant="outline">
                      {isOwnClaim ? "Your Claim" : "Claimed"}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isClaimed ? (
                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-3xl font-bold">$10</span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                      <Badge variant="outline">
                        {isOwnClaim ? "Your Claim" : "Claimed"}
                      </Badge>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-3xl font-bold">$10</span>
                          <span className="text-muted-foreground">/month</span>
                        </div>
                        <Badge variant="outline">Available</Badge>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => handleClaimServer(server.id)}
                        disabled={!canClaimMore}
                      >
                        {canClaimMore ? "Claim Server" : "No Claims Available"}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}