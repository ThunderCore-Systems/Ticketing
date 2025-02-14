import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import type { Ticket, Message, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface TicketDetailProps {
  ticketId: number;
}

export default function TicketDetail({ ticketId }: TicketDetailProps) {
  const [newMessage, setNewMessage] = useState("");
  const { toast } = useToast();

  const { data: ticket } = useQuery<Ticket>({
    queryKey: [`/api/tickets/${ticketId}`]
  });

  const { data: messages } = useQuery<Message[]>({
    queryKey: [`/api/tickets/${ticketId}/messages`]
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/user"]
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/tickets/${ticketId}/messages`, {
        content,
        userId: user?.id,
      });
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({
        queryKey: [`/api/tickets/${ticketId}/messages`]
      });
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!ticket || !messages || !user) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-48">
            <p className="text-muted-foreground">Loading ticket...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[calc(100vh-12rem)]">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-xl">{ticket.title}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Created {format(new Date(ticket.createdAt), "PPp")}
          </p>
        </div>
        <Badge variant={ticket.status === "open" ? "default" : "secondary"}>
          {ticket.status}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-col h-full">
        <ScrollArea className="flex-1 pr-4 -mr-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2" />
              <p>No messages yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col ${
                    message.userId === user.id ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.userId === user.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p>{message.content}</p>
                  </div>
                  <span className="text-xs text-muted-foreground mt-1">
                    {format(new Date(message.createdAt), "p")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator className="my-4" />

        <div className="flex gap-2">
          <Textarea
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="resize-none"
            rows={2}
          />
          <Button
            onClick={() => sendMessage.mutate(newMessage)}
            disabled={!newMessage.trim() || sendMessage.isPending}
          >
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
