import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare } from "lucide-react";
import type { Ticket, Panel, Server } from "@shared/schema";

interface TicketListProps {
  serverId: number;
}

export default function TicketList({ serverId }: TicketListProps) {
  const [, setLocation] = useLocation();
  const [selectedPanelId, setSelectedPanelId] = useState<string>("all");

  // Get current user
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"]
  });

  // Get server details for permissions
  const { data: server } = useQuery<Server>({
    queryKey: [`/api/servers/${serverId}`]
  });

  // Get tickets - backend now handles filtering based on role
  const { data: tickets } = useQuery<Ticket[]>({ 
    queryKey: [`/api/servers/${serverId}/tickets`]
  });

  const { data: panels } = useQuery<Panel[]>({
    queryKey: [`/api/servers/${serverId}/panels`],
  });

  if (!tickets || !panels || !server || !user) {
    return null;
  }

  // Check if user is a ticket manager
  const isTicketManager = server.ticketManagerRoleId === user.discordId;

  // Filter tickets based on selected panel
  const filteredTickets = selectedPanelId === "all" 
    ? tickets
    : tickets.filter(ticket => ticket.panelId === parseInt(selectedPanelId));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Select 
          value={selectedPanelId} 
          onValueChange={setSelectedPanelId}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by panel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Panels</SelectItem>
            {panels.map(panel => (
              <SelectItem key={panel.id} value={panel.id.toString()}>
                {panel.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticket</TableHead>
            <TableHead>Panel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead>Claimed By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTickets.map((ticket) => (
            <TableRow 
              key={ticket.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => setLocation(`/tickets/${ticket.id}`)}
            >
              <TableCell>#{ticket.number}</TableCell>
              <TableCell>
                {panels.find(p => p.id === ticket.panelId)?.title || 'Unknown Panel'}
              </TableCell>
              <TableCell>
                <Badge
                  variant={ticket.status === "open" ? "default" : "secondary"}
                >
                  {ticket.status}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground">
                  {ticket.userId}
                </span>
              </TableCell>
              <TableCell>
                {ticket.claimedBy && (
                  <Badge variant="outline">
                    {ticket.claimedBy}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
          {filteredTickets.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {isTicketManager ? 'No tickets found' : 'No open tickets found'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}