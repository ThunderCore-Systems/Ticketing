import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { createSubscription, SUBSCRIPTION_PRICE_ID } from "@/lib/stripe";
import TicketList from "@/components/tickets/ticket-list";
import type { Server, User } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";

export default function Dashboard() {
  const { toast } = useToast();
  const { data: servers } = useQuery<Server[]>({ 
    queryKey: ["/api/servers"]
  });
  const { data: user } = useQuery<User>({ 
    queryKey: ["/api/auth/user"]
  });

  const activateServer = useMutation({
    mutationFn: async (serverId: number) => {
      const res = await apiRequest("POST", `/api/servers/${serverId}/activate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Server Activated",
        description: "Successfully activated server using 1 token.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to activate server. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleServerActivation = async (serverId: number) => {
    try {
      if (!user?.serverTokens || user.serverTokens <= 0) {
        // No tokens available, redirect to subscription
        const session = await createSubscription(SUBSCRIPTION_PRICE_ID, serverId);
        if (session.url) {
          window.location.href = session.url;
        }
      } else {
        // Use a token to activate the server
        await activateServer.mutateAsync(serverId);
      }
    } catch (error) {
      console.error('Failed to handle server activation:', error);
      toast({
        title: "Error",
        description: "Failed to process server activation. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!servers || !user) {
    return null;
  }

  const availableTokens = user.serverTokens || 0;
  const claimedServers = servers.filter(s => s.claimedByUserId === user.id);
  const canClaimMore = availableTokens > 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            Server Tokens Available:
          </span>
          <Badge variant={canClaimMore ? "default" : "secondary"}>
            {availableTokens}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => {
          const isClaimed = Boolean(server.claimedByUserId);
          const isOwnClaim = server.claimedByUserId === user.id;
          const hasActiveSubscription = server.subscriptionStatus === "active";

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
                    variant={hasActiveSubscription ? "default" : "destructive"}
                  >
                    {hasActiveSubscription ? "Active" : "Inactive"}
                  </Badge>
                  {isClaimed && (
                    <Badge variant="outline">
                      {isOwnClaim ? "Your Claim" : "Claimed"}
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hasActiveSubscription ? (
                  <TicketList serverId={server.id} />
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-baseline justify-between">
                      <div className="text-sm text-muted-foreground">
                        {availableTokens > 0 ? (
                          "Use 1 token to activate"
                        ) : (
                          "Purchase subscription to activate"
                        )}
                      </div>
                      <Badge variant="outline">
                        {canClaimMore ? "Available" : "No Tokens"}
                      </Badge>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => handleServerActivation(server.id)}
                      disabled={activateServer.isPending}
                    >
                      {availableTokens > 0 ? (
                        "Activate with Token"
                      ) : (
                        "Purchase Subscription"
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}