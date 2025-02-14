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
import type { Ticket } from "@shared/schema";

interface TicketListProps {
  serverId: number;
}

export default function TicketList({ serverId }: TicketListProps) {
  const { data: tickets } = useQuery<Ticket[]>({ 
    queryKey: [`/api/servers/${serverId}/tickets`]
  });

  if (!tickets) {
    return null;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow key={ticket.id}>
            <TableCell>{ticket.title}</TableCell>
            <TableCell>
              <Badge
                variant={ticket.status === "open" ? "default" : "secondary"}
              >
                {ticket.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
