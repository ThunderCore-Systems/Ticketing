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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import {
  MessageSquare,
  UserCircle2,
  Lock,
  UnlockKeyhole,
  Inbox,
  Users,
  AlertCircle,
  Download,
  Ban,
  Clock,
  Shield,
  UserPlus
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Ticket, Message, User, Panel } from "@shared/schema";

interface TicketDetailProps {
  ticketId: number;
}

export default function TicketDetail({ ticketId }: TicketDetailProps) {
  const [newMessage, setNewMessage] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [isRemoveUserOpen, setIsRemoveUserOpen] = useState(false);
  const [userToRemove, setUserToRemove] = useState("");
  const { toast } = useToast();

  // Get ticket details
  const { data: ticket, isLoading: ticketLoading } = useQuery<Ticket>({
    queryKey: [`/api/tickets/${ticketId}`],
    retry: 2,
  });

  // Get current user
  const { data: user, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: 2,
  });

  // Get ticket messages
  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: [`/api/tickets/${ticketId}/messages`],
    enabled: !!ticket,
    retry: 2,
    refetchInterval: 1000, // Poll every second for new messages
  });

  // Get panel details
  const { data: panel, isLoading: panelLoading } = useQuery<Panel>({
    queryKey: [`/api/panels/${ticket?.panelId}`],
    enabled: !!ticket?.panelId,
    retry: 2,
  });

  // Get ticket creator details
  const { data: ticketCreator } = useQuery<User>({
    queryKey: [`/api/users/${ticket?.userId}`],
    enabled: !!ticket?.userId,
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/messages`, {
        content,
        userId: user?.id,
      });
      return res.json();
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
    onError: (err) => {
      console.error("Error sending message:", err);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update the updateTicketStatus mutation
  const updateTicketStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/tickets/${ticketId}`, {
        status,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update ticket status');
      }
      return res.json();
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
    onError: (err: Error) => {
      console.error("Error updating ticket status:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to update ticket status. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update the claimTicket mutation
  const claimTicket = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/claim`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to claim ticket');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/tickets/${ticketId}`]
      });
      toast({
        title: "Success",
        description: ticket?.claimedBy ? "You have unclaimed this ticket." : "You have claimed this ticket.",
      });
    },
    onError: (err: Error) => {
      console.error("Error claiming ticket:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to claim ticket. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update the saveTranscript mutation
  const saveTranscript = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/transcript`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save transcript');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Ticket transcript has been saved and sent to the configured channel.",
      });
    },
    onError: (err: Error) => {
      console.error("Error saving transcript:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to save transcript. Please try again.",
        variant: "destructive",
      });
    }
  });

  const banUser = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/ban-user`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "User banned",
        description: "The user has been banned from creating new tickets.",
      });
    },
    onError: (err) => {
      console.error("Error banning user:", err);
      toast({
        title: "Error",
        description: "Failed to ban user. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Update other mutations with similar error handling...
  const removeUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/remove-user`, {
        userId,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to remove user');
      }
      return res.json();
    },
    onSuccess: () => {
      setIsRemoveUserOpen(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/tickets/${ticketId}`]
      });
      toast({
        title: "Success",
        description: "User has been removed from the ticket.",
      });
    },
    onError: (err: Error) => {
      console.error("Error removing user:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to remove user. Please try again.",
        variant: "destructive",
      });
    }
  });

  const upgradeTicket = useMutation({
    mutationFn: async (roleId: string) => {
      const res = await apiRequest("POST", `/api/tickets/${ticketId}/upgrade`, {
        roleId,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to upgrade ticket');
      }
      return res.json();
    },
    onSuccess: () => {
      setIsUpgradeOpen(false);
      queryClient.invalidateQueries({
        queryKey: [`/api/tickets/${ticketId}`]
      });
      toast({
        title: "Success",
        description: "Ticket has been upgraded to include the selected role.",
      });
    },
    onError: (err: Error) => {
      console.error("Error upgrading ticket:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to upgrade ticket. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Get server roles
  const { data: roles } = useQuery<{ id: string, name: string }[]>({
    queryKey: [`/api/servers/${ticket?.serverId}/roles`],
    enabled: !!ticket?.serverId,
  });

  const isLoading = ticketLoading || messagesLoading || userLoading || panelLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-48">
            <p className="text-muted-foreground">Loading ticket details...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!ticket || !user) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-48">
            <p className="text-muted-foreground">Could not find ticket #{ticketId}</p>
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
              {panel?.title} #{ticket.number}
            </CardTitle>
            <CardDescription>
              Created {format(new Date(ticket.createdAt || Date.now()), "PPp")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {ticket.claimedBy ? (
              ticket.claimedBy === user.discordId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => claimTicket.mutate()}
                  className="gap-1"
                >
                  <Inbox className="h-4 w-4" />
                  Unclaim Ticket
                </Button>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <UserCircle2 className="h-3 w-3" />
                  Claimed by {ticket.claimedBy === user.discordId ? 'you' : ticket.claimedBy}
                </Badge>
              )
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveTranscript.mutate()}
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              Save Transcript
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  More Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setIsUpgradeOpen(true)}>
                  Upgrade Ticket
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setIsRemoveUserOpen(true)}>
                  Remove User
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <UserPlus className="h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add User to Ticket</DialogTitle>
                  <DialogDescription>
                    Enter the Discord ID of the user you want to add to this ticket.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Input
                      placeholder="Discord User ID"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                    />
                  </div>
                  <Button onClick={() => addUser.mutate(newUserId)}>
                    Add User
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isRemoveUserOpen} onOpenChange={setIsRemoveUserOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Remove User from Ticket</DialogTitle>
                  <DialogDescription>
                    Enter the Discord ID of the user you want to remove from this ticket.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Input
                      placeholder="Discord User ID"
                      value={userToRemove}
                      onChange={(e) => setUserToRemove(e.target.value)}
                    />
                  </div>
                  <Button onClick={() => removeUser.mutate(userToRemove)}>
                    Remove User
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upgrade Ticket</DialogTitle>
                  <DialogDescription>
                    Select a role to upgrade this ticket to.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <select
                      className="w-full p-2 border rounded"
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                    >
                      <option value="">Select a role...</option>
                      {roles?.map(role => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={() => upgradeTicket.mutate(selectedRole)}
                    disabled={!selectedRole}
                  >
                    Upgrade Ticket
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
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
              {!messages || messages.length === 0 ? (
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
                        message.userId === user.discordId ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.userId === user.discordId
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
                User Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {ticketCreator && (
                  <>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Discord Profile</h4>
                      <div className="flex items-center gap-3">
                        {ticketCreator.avatarUrl && (
                          <img
                            src={ticketCreator.avatarUrl}
                            alt={ticketCreator.username}
                            className="w-10 h-10 rounded-full"
                          />
                        )}
                        <div>
                          <p className="font-medium">{ticketCreator.username}</p>
                          <p className="text-sm text-muted-foreground">ID: {ticketCreator.discordId}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => banUser.mutate()}
                        className="gap-1"
                      >
                        <Ban className="h-4 w-4" />
                        Ban User
                      </Button>
                      {/* Add more user management buttons here */}
                    </div>
                  </>
                )}

                {ticket.claimedBy && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Claimed By</h4>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>{ticket.claimedBy}</span>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-medium mb-2">Time Open</h4>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>{format(new Date(ticket.createdAt || Date.now()), "PPpp")}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {panel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Panel Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Panel Name</h4>
                    <p>{panel.title}</p>
                  </div>
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
                  {panel.transcriptChannelId && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Transcript Channel</h4>
                      <Badge variant="outline">
                        #{panel.transcriptChannelId}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}