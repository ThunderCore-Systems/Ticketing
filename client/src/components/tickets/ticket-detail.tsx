import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { 
  MessageSquare, 
  UserCircle2, 
  Lock, 
  UnlockKeyhole, 
  Inbox,
  Users,
  AlertCircle
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Ticket, Message, User, Panel } from "@shared/schema";

interface TicketDetailProps {
  ticketId: number;
}

export default function TicketDetail({ ticketId }: TicketDetailProps) {
  const [newMessage, setNewMessage] = useState("");
  const { toast } = useToast();

  // Get ticket details
  const { data: ticket, isLoading: ticketLoading } = useQuery<Ticket>({
    queryKey: [`/api/tickets/${ticketId}`],
  });

  // Get ticket messages
  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: [`/api/tickets/${ticketId}/messages`],
    enabled: !!ticket,
  });

  // Get current user
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
  });

  // Get panel details
  const { data: panel, isLoading: panelLoading } = useQuery<Panel>({
    queryKey: [`/api/panels/${ticket?.panelId}`],
    enabled: !!ticket?.panelId,
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

  const updateTicketStatus = useMutation({
    mutationFn: async (status: string) => {
      await apiRequest("PATCH", `/api/tickets/${ticketId}`, {
        status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/tickets/${ticketId}`]
      });
      toast({
        title: "Ticket updated",
        description: `Ticket has been ${ticket?.status === 'open' ? 'closed' : 'reopened'}.`,
      });
    },
  });

  const claimTicket = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/tickets/${ticketId}/claim`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/tickets/${ticketId}`]
      });
      toast({
        title: "Ticket claimed",
        description: "You have claimed this ticket.",
      });
    },
  });

  const isLoading = ticketLoading || messagesLoading || userLoading || panelLoading;

  if (isLoading || !ticket || !messages || !user || !panel) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-48">
            <p className="text-muted-foreground">
              {isLoading ? "Loading ticket details..." : "Could not load ticket details"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">
              {panel.title} #{ticket.number}
            </CardTitle>
            <CardDescription>
              Created {format(new Date(ticket.createdAt || Date.now()), "PPp")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={ticket.status === "open" ? "default" : "secondary"}>
              {ticket.status}
            </Badge>
            {ticket.claimedBy ? (
              <Badge variant="outline" className="gap-1">
                <UserCircle2 className="h-3 w-3" />
                Claimed by {ticket.claimedBy === user.discordId ? 'you' : ticket.claimedBy}
              </Badge>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => claimTicket.mutate()}
                className="gap-1"
              >
                <Inbox className="h-4 w-4" />
                Claim Ticket
              </Button>
            )}
            <Button
              variant={ticket.status === "open" ? "destructive" : "default"}
              size="sm"
              onClick={() => updateTicketStatus.mutate(ticket.status === "open" ? "closed" : "open")}
              className="gap-1"
            >
              {ticket.status === "open" ? (
                <>
                  <Lock className="h-4 w-4" />
                  Close Ticket
                </>
              ) : (
                <>
                  <UnlockKeyhole className="h-4 w-4" />
                  Reopen Ticket
                </>
              )}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Card className="h-[calc(100vh-20rem)]">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Messages
            </CardTitle>
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
                        {format(new Date(message.createdAt || Date.now()), "p")}
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

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Participants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Created By</h4>
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4" />
                    <span>{ticket.userId}</span>
                  </div>
                </div>
                {ticket.claimedBy && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Claimed By</h4>
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="h-4 w-4" />
                      <span>{ticket.claimedBy}</span>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-medium mb-2">Support Team</h4>
                  <div className="flex flex-wrap gap-2">
                    {panel.supportRoleIds.map(roleId => (
                      <Badge key={roleId} variant="secondary">
                        @{roleId}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Ticket Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Panel</h4>
                  <p>{panel.title}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Ticket Number</h4>
                  <p>#{ticket.number}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Created</h4>
                  <p>{format(new Date(ticket.createdAt || Date.now()), "PPpp")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}