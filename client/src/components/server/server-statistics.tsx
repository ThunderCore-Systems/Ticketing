import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import type { Ticket } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ServerStatisticsProps {
  serverId: number;
}

export default function ServerStatistics({ serverId }: ServerStatisticsProps) {
  const [timeframe, setTimeframe] = useState("7d");

  // Get tickets data
  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: [`/api/servers/${serverId}/tickets`],
  });

  // Get support team stats
  const { data: supportStats } = useQuery({
    queryKey: [`/api/servers/${serverId}/support-stats`],
  });

  if (!tickets) return null;

  // Calculate general statistics
  const totalTickets = tickets.length;
  const openTickets = tickets.filter(t => t.status === "open").length;
  const closedTickets = tickets.filter(t => t.status === "closed").length;
  const avgResponseTime = calculateAverageResponseTime(tickets);
  const avgResolutionTime = calculateAverageResolutionTime(tickets);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Server Statistics</h2>
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Select timeframe" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatsCard
          title="Total Tickets"
          value={totalTickets}
          description="Total tickets created"
        />
        <StatsCard
          title="Open Tickets"
          value={openTickets}
          description="Currently open tickets"
        />
        <StatsCard
          title="Avg. Response Time"
          value={formatTime(avgResponseTime)}
          description="Average time to first response"
        />
        <StatsCard
          title="Avg. Resolution Time"
          value={formatTime(avgResolutionTime)}
          description="Average time to close ticket"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ticket Activity</CardTitle>
          <CardDescription>Number of tickets over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getTicketActivityData(tickets, timeframe)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tickets" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Support Team Performance</CardTitle>
          <CardDescription>Individual support member statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {supportStats?.map((member: any) => (
              <div key={member.id} className="flex items-center justify-between border-b pb-4">
                <div>
                  <h4 className="font-medium">{member.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Tickets handled: {member.ticketsHandled}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">
                    Avg. response time: {formatTime(member.avgResponseTime)}
                  </p>
                  <p className="text-sm">
                    Resolution rate: {member.resolutionRate}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({ title, value, description }: { 
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function calculateAverageResponseTime(tickets: Ticket[]): number {
  const ticketsWithResponses = tickets.filter(ticket => {
    const messages = ticket.messages || [];
    return messages.length > 1; // At least one response after initial ticket creation
  });

  if (ticketsWithResponses.length === 0) return 0;

  const totalResponseTime = ticketsWithResponses.reduce((total, ticket) => {
    const messages = ticket.messages || [];
    if (messages.length < 2) return total;

    const firstMessage = new Date(messages[0].createdAt);
    const firstResponse = new Date(messages[1].createdAt);
    return total + (firstResponse.getTime() - firstMessage.getTime());
  }, 0);

  return Math.round(totalResponseTime / ticketsWithResponses.length / (1000 * 60)); // Convert to minutes
}

function calculateAverageResolutionTime(tickets: Ticket[]): number {
  const resolvedTickets = tickets.filter(ticket => 
    ticket.status === "closed" && ticket.closedAt
  );

  if (resolvedTickets.length === 0) return 0;

  const totalResolutionTime = resolvedTickets.reduce((total, ticket) => {
    const createdAt = new Date(ticket.createdAt);
    const closedAt = new Date(ticket.closedAt!);
    return total + (closedAt.getTime() - createdAt.getTime());
  }, 0);

  return Math.round(totalResolutionTime / resolvedTickets.length / (1000 * 60)); // Convert to minutes
}

function formatTime(minutes: number): string {
  if (minutes === 0) return "N/A";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getTicketActivityData(tickets: Ticket[], timeframe: string) {
  const days = timeframe === "7d" ? 7 : timeframe === "30d" ? 30 : timeframe === "90d" ? 90 : 365;
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Create an array of dates
  const dates = Array.from({ length: days }, (_, i) => {
    const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    return date.toLocaleDateString();
  });

  // Count tickets per date
  const ticketCounts = dates.map(date => {
    const count = tickets.filter(ticket => 
      new Date(ticket.createdAt).toLocaleDateString() === date
    ).length;

    return {
      date,
      tickets: count
    };
  });

  return ticketCounts;
}