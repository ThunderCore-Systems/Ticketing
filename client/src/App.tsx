import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Servers from "@/pages/servers";
import Billing from "@/pages/billing";
import NotFound from "@/pages/not-found";
import Navbar from "@/components/layout/navbar";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { useEffect } from "react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false
  });

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) {
    return null;
  }

  return <Component />;
}

function RootRedirect() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false
  });

  useEffect(() => {
    if (!isLoading) {
      setLocation(user ? "/dashboard" : "/login");
    }
  }, [user, isLoading, setLocation]);

  return null;
}

function Router() {
  const { data: user } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    retry: false
  });

  return (
    <div className="min-h-screen bg-background">
      {user && <Navbar />}
      <main className="container mx-auto py-6 px-4">
        <Switch>
          <Route path="/" component={RootRedirect} />
          <Route path="/login" component={Login} />
          <Route path="/dashboard">
            <ProtectedRoute component={Dashboard} />
          </Route>
          <Route path="/servers">
            <ProtectedRoute component={Servers} />
          </Route>
          <Route path="/billing">
            <ProtectedRoute component={Billing} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;