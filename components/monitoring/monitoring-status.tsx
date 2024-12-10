import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";
import { AlertCircle, Pause, Play } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MonitoringStatus() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Query monitoring status
  const { data: status, isLoading } = useQuery({
    queryKey: ["monitoringStatus"],
    queryFn: async () => {
      const response = await fetch("/api/monitoring/status");
      if (!response.ok) {
        throw new Error("Failed to fetch monitoring status");
      }
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Mutation to update monitoring status
  const updateStatus = useMutation({
    mutationFn: async (action: "pause" | "resume") => {
      const response = await fetch("/api/monitoring/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          credentials: "include",
        },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Failed to update monitoring status"
        );
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoringStatus"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to update status");
    },
  });

  if (!user) return null;

  return (
    <div className="flex items-center gap-4">
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Monitoring is {status?.enabled ? "active" : "paused"}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            updateStatus.mutate(status?.enabled ? "pause" : "resume")
          }
          disabled={updateStatus.isPending || isLoading}
        >
          {updateStatus.isPending ? (
            "Updating..."
          ) : status?.enabled ? (
            <>
              <Pause className="h-4 w-4 mr-2" />
              Pause Monitoring
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Resume Monitoring
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
