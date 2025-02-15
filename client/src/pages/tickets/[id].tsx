import { useRoute } from "wouter";
import TicketDetail from "@/components/tickets/ticket-detail";

export default function TicketPage() {
  const [, params] = useRoute<{ id: string }>("/tickets/:id");
  
  if (!params?.id) {
    return null;
  }

  return <TicketDetail ticketId={parseInt(params.id)} />;
}
