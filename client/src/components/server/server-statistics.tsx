import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
import type { Ticket, SupportTeamMember } from "@shared/schema";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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
  const { data: supportStats } = useQuery<SupportTeamMember[]>({
    queryKey: [`/api/servers/${serverId}/support-stats`],
  });

  if (!tickets || !supportStats) return null;

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
          title="Resolution Rate"
          value={`${Math.round((closedTickets / totalTickets) * 100)}%`}
          description="Percentage of tickets resolved"
        />
        <StatsCard
          title="Avg. Response Time"
          value={formatTime(avgResponseTime)}
          description="Average time to first response"
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
          <div className="space-y-6">
            {supportStats.length === 0 ? (
              <p className="text-muted-foreground">No support team activity recorded yet.</p>
            ) : (
              supportStats.map((member) => (
                <Dialog key={member.id}>
                  <DialogTrigger asChild>
                    <div className="space-y-2 hover:bg-muted p-4 rounded-lg cursor-pointer transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarImage src={member.avatar || undefined} />
                            <AvatarFallback>
                              {member.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-medium flex items-center gap-2">
                              {member.name}
                              <Badge variant={member.roleType === 'manager' ? 'default' : 'secondary'}>
                                {member.roleType === 'manager' ? 'Manager' : 'Support'}
                              </Badge>
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              Last active: {member.lastActive ? new Date(member.lastActive).toLocaleDateString() : 'Not yet active'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-muted rounded-lg p-3">
                          <div className="text-sm font-medium">Tickets Handled</div>
                          <div className="text-2xl">{member.ticketsHandled}</div>
                        </div>

                        <div className="bg-muted rounded-lg p-3">
                          <div className="text-sm font-medium">Resolution Rate</div>
                          <div className="text-2xl">{member.resolutionRate}%</div>
                        </div>

                        <div className="bg-muted rounded-lg p-3">
                          <div className="text-sm font-medium">Avg. Response</div>
                          <div className="text-2xl">{formatTime(member.avgResponseTime)}</div>
                        </div>
                      </div>
                    </div>
                  </DialogTrigger>

                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <Avatar>
                          <AvatarImage src={member.avatar || undefined} />
                          <AvatarFallback>
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        {member.name}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6">
                      {/* Detailed Statistics Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <StatBox
                          label="Total Tickets"
                          value={member.ticketsHandled}
                        />
                        <StatBox
                          label="Resolved Tickets"
                          value={member.resolvedTickets}
                        />
                        <StatBox
                          label="Resolution Rate"
                          value={`${member.resolutionRate}%`}
                        />
                        <StatBox
                          label="Fastest Response"
                          value={formatTime(member.fastestResponse / 60)}
                        />
                        <StatBox
                          label="Slowest Response"
                          value={formatTime(member.slowestResponse / 60)}
                        />
                        <StatBox
                          label="Avg. Messages/Ticket"
                          value={member.averageMessagesPerTicket}
                        />
                      </div>

                      {/* Activity Patterns */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Daily Activity Pattern</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={member.peakHours.map((value, hour) => ({
                                hour: `${hour}:00`,
                                activity: value
                              }))}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" />
                                <YAxis />
                                <Tooltip />
                                <Line 
                                  type="monotone" 
                                  dataKey="activity" 
                                  stroke="hsl(var(--primary))"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Categories */}
                      {member.categories && member.categories.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Ticket Categories</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {member.categories.map(({ category, count, percentage }) => (
                                <div key={category} className="flex justify-between items-center">
                                  <span>{category}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">{count}</span>
                                    <Badge variant="secondary">{percentage}%</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted rounded-lg p-3">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
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
    const messages = ticket.messages ? ticket.messages.map(msg => 
      typeof msg === 'string' ? JSON.parse(msg) : msg
    ) : [];
    return messages.length >= 2;
  });

  if (ticketsWithResponses.length === 0) return 0;

  const totalResponseTime = ticketsWithResponses.reduce((total, ticket) => {
    const messages = ticket.messages ? ticket.messages.map(msg => 
      typeof msg === 'string' ? JSON.parse(msg) : msg
    ) : [];
    if (messages.length < 2) return total;

    const firstMessage = messages[0];
    const firstResponse = messages[1];
    return total + (new Date(firstResponse.createdAt).getTime() - new Date(firstMessage.createdAt).getTime());
  }, 0);

  return Math.round(totalResponseTime / ticketsWithResponses.length / (1000 * 60));
}

function calculateAverageResolutionTime(tickets: Ticket[]): number {
  const resolvedTickets = tickets.filter(ticket => 
    ticket.status === "closed" && ticket.closedAt && ticket.createdAt
  );

  if (resolvedTickets.length === 0) return 0;

  const totalResolutionTime = resolvedTickets.reduce((total, ticket) => {
    if (!ticket.createdAt || !ticket.closedAt) return total;
    return total + (new Date(ticket.closedAt).getTime() - new Date(ticket.createdAt).getTime());
  }, 0);

  return Math.round(totalResolutionTime / resolvedTickets.length / (1000 * 60));
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
    const count = tickets.filter(ticket => {
      if (!ticket.createdAt) return false;
      return new Date(ticket.createdAt).toLocaleDateString() === date;
    }).length;

    return {
      date,
      tickets: count
    };
  });

  return ticketCounts;
}