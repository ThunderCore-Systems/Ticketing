import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
  attachments?: Array<{
    url: string;
    name: string;
    contentType?: string;
  }>;
}

interface TicketMessagesProps {
  ticketId: number;
}

export default function TicketMessages({ ticketId }: TicketMessagesProps) {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryKey = [`/api/tickets/${ticketId}/messages`];

  // Set up polling for new messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey,
    refetchInterval: 1000, // Poll every second
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="space-y-4 overflow-auto h-[calc(100vh-20rem)] p-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={cn(
      "flex gap-3 items-start",
      message.isSupport && "flex-row-reverse"
    )}>
      <Avatar>
        <AvatarImage src={message.avatarUrl} />
        <AvatarFallback>
          {message.username?.[0]?.toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      <div className={cn(
        "flex flex-col max-w-[80%]",
        message.isSupport && "items-end"
      )}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {message.username || 'Unknown User'}
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
          "mt-1 rounded-lg p-3 break-words",
          message.isSupport 
            ? "bg-primary text-primary-foreground" 
            : "bg-muted"
        )}>
          {message.content}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((attachment, index) => (
                <a
                  key={index}
                  href={attachment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm underline"
                >
                  📎 {attachment.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}