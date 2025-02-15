import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { Ticket, Panel } from "@shared/schema";

interface TicketListProps {
  serverId: number;
}

export default function TicketList({ serverId }: TicketListProps) {
  const { data: tickets } = useQuery<Ticket[]>({ 
    queryKey: [`/api/servers/${serverId}/tickets`]
  });

  const { data: panels } = useQuery<Panel[]>({
    queryKey: [`/api/servers/${serverId}/panels`],
  });

  const [selectedPanelId, setSelectedPanelId] = useState<string>("all");

  if (!tickets || !panels) {
    return null;
  }

  const filteredTickets = selectedPanelId === "all" 
    ? tickets
    : tickets.filter(ticket => ticket.panelId === parseInt(selectedPanelId));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
            <TableHead>ID</TableHead>
            <TableHead>Panel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTickets.map((ticket) => (
            <TableRow key={ticket.id}>
              <TableCell>{ticket.prefix}-{ticket.number}</TableCell>
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
            </TableRow>
          ))}
          {filteredTickets.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No tickets found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}