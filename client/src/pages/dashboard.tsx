import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketList from "@/components/tickets/ticket-list";
import type { Server } from "@shared/schema";

export default function Dashboard() {
  const { data: servers } = useQuery<Server[]>({ 
    queryKey: ["/api/servers"]
  });

  if (!servers) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
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
            </CardHeader>
            <CardContent>
              <TicketList serverId={server.id} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
