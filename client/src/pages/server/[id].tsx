import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import TicketList from "@/components/tickets/ticket-list";
import TicketPanels from "@/components/server/ticket-panels";
import ServerSettings from "@/components/server/server-settings";
import ServerStatistics from "@/components/server/server-statistics";
import KnowledgeBase from "@/components/server/knowledge-base";
import type { Server } from "@shared/schema";

export default function ServerDashboard() {
  const params = useParams();
  const serverId = parseInt(params.id);

  const { data: server } = useQuery<Server>({
    queryKey: [`/api/servers/${serverId}`],
  });

  if (!server) {
    return (
      <Alert>
        <AlertDescription>Loading server details...</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {server.icon && (
          <img
            src={server.icon}
            alt={server.name}
            className="h-12 w-12 rounded-full"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold">{server.name}</h1>
          <p className="text-sm text-muted-foreground">Server Management</p>
        </div>
      </div>

      <Tabs defaultValue="tickets" className="h-[calc(100vh-12rem)] overflow-auto">
        <TabsList className="sticky top-0 bg-background z-10">
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="panels">Ticket Panels</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Tickets</CardTitle>
              <CardDescription>
                View and manage all tickets in this server
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TicketList serverId={serverId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="panels">
          <TicketPanels serverId={serverId} />
        </TabsContent>

        <TabsContent value="statistics">
          <ServerStatistics serverId={serverId} />
        </TabsContent>

        <TabsContent value="knowledge">
          <KnowledgeBase serverId={serverId} />
        </TabsContent>

        <TabsContent value="settings">
          <ServerSettings server={server} />
        </TabsContent>
      </Tabs>
    </div>
  );
}