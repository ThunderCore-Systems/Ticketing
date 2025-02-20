import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Server, User } from "@shared/schema";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { data: allServers } = useQuery<Server[]>({
    queryKey: ["/api/admin/servers"],
  });
  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const addTokens = useMutation({
    mutationFn: async ({
      userId,
      tokens,
    }: {
      userId: number;
      tokens: number;
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!res.ok) throw new Error("Failed to add tokens");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "Success",
        description: "Tokens added successfully",
      });
    },
  });

  const addServerToUser = useMutation({
    mutationFn: async ({
      userId,
      serverId,
    }: {
      userId: number;
      serverId: number;
    }) => {
      const res = await fetch(`/api/admin/users/${userId}/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
      });
      if (!res.ok) throw new Error("Failed to add server");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/servers"] });
      toast({
        title: "Success",
        description: "Server added successfully",
      });
    },
  });

  if (!allServers || !allUsers) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {allUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border rounded"
                >
                  <div>
                    <div className="font-bold">{user.username}</div>
                    <div className="text-sm text-muted-foreground">
                      Tokens: {user.serverTokens}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Tokens"
                      className="w-24"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const tokens = parseInt(
                            (e.target as HTMLInputElement).value,
                          );
                          if (!isNaN(tokens)) {
                            addTokens.mutate({ userId: user.id, tokens });
                            (e.target as HTMLInputElement).value = "";
                          }
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const serverId = prompt("Enter server ID to add:");
                        if (serverId) {
                          addServerToUser.mutate({
                            userId: user.id,
                            serverId: parseInt(serverId),
                          });
                        }
                      }}
                    >
                      Add Server
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Servers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allServers.map((server) => (
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
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>ID: {server.id}</div>
                      <div>Owner ID: {server.ownerId}</div>
                      <div>
                        Status:{" "}
                        <Badge>
                          {server.subscriptionStatus || "No subscription"}
                        </Badge>
                      </div>
                      <Button
                        className="w-full"
                        onClick={() =>
                          (window.location.href = `/server/${server.id}`)
                        }
                      >
                        Manage Server
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
