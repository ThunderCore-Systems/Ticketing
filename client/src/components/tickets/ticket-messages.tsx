import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useDiscordUsername } from "@/hooks/use-discord-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Message {
  id: number;
  content: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  createdAt: string;
  source: 'discord' | 'dashboard';
  isSupport?: boolean;
}

interface TicketMessagesProps {
  ticketId: number;
}

export default function TicketMessages({ ticketId }: TicketMessagesProps) {
  const queryClient = useQueryClient();
  const queryKey = [`/api/tickets/${ticketId}/messages`];

  // Set up polling for new messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey,
    refetchInterval: 3000, // Poll every 3 seconds
  });

  useEffect(() => {
    // Scroll to bottom on new messages
    const chat = document.getElementById('chat-messages');
    if (chat) {
      chat.scrollTop = chat.scrollHeight;
    }
  }, [messages]);

  return (
    <div id="chat-messages" className="space-y-4 overflow-auto h-[calc(100vh-20rem)]">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const username = useDiscordUsername(message.userId);
  
  return (
    <div className={cn(
      "flex gap-3 items-start",
      message.isSupport && "flex-row-reverse"
    )}>
      <Avatar>
        <AvatarImage src={message.avatarUrl} />
        <AvatarFallback>
          {username[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className={cn(
        "flex flex-col",
        message.isSupport && "items-end"
      )}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {username}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.createdAt).toLocaleString()}
          </span>
          {message.source === 'discord' && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              Discord
            </span>
          )}
        </div>
        <div className={cn(
          "mt-1 rounded-lg p-3",
          message.isSupport 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted"
        )}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
