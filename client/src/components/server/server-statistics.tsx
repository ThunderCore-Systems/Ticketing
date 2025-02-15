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
                <Bar dataKey="tickets" fill="#3b82f6" />
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
  // Implement calculation logic
  return 0;
}

function calculateAverageResolutionTime(tickets: Ticket[]): number {
  // Implement calculation logic
  return 0;
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getTicketActivityData(tickets: Ticket[], timeframe: string) {
  // Implement data transformation logic
  return [];
}
