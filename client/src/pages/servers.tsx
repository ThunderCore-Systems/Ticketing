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
import type { Server } from "@shared/schema";

export default function Servers() {
  const { data: servers } = useQuery<Server[]>({ 
    queryKey: ["/api/servers"]
  });

  if (!servers) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Servers</h1>

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
                Status:{" "}
                <Badge variant={server.subscriptionStatus === "active" ? "default" : "destructive"}>
                  {server.subscriptionStatus || "No subscription"}
                </Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                className="w-full"
                variant={server.subscriptionStatus === "active" ? "secondary" : "default"}
                asChild
              >
                <a href="/billing">
                  {server.subscriptionStatus === "active"
                    ? "Manage Subscription"
                    : "Subscribe Now"}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
