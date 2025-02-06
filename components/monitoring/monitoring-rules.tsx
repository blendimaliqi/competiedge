"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitoringRule } from "@/lib/types/monitoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/components/auth/auth-provider";

type RuleType =
  | "ARTICLE_COUNT"
  | "KEYWORD"
  | "CONTENT_CHANGE"
  | "SOCIAL_MENTIONS";

export function MonitoringRules({ websiteId }: { websiteId: string }) {
  const { user } = useAuth();
  const [newRule, setNewRule] = useState({
    type: "CONTENT_CHANGE" as RuleType,
    notify_email: "",
  });
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Get existing rules
  const { data: rules, refetch } = useQuery({
    queryKey: ["monitoringRules", websiteId],
    queryFn: async () => {
      console.log("Fetching monitoring rules for website:", websiteId);
      const response = await fetch(
        `/api/monitoring/rules?websiteId=${websiteId}`
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch monitoring rules");
      }
      const data = await response.json();
      console.log("Fetched rules:", data);
      return data;
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 10000,
  });

  // Get the active rule's email if it exists
  const activeRule = rules?.find((r: MonitoringRule) => r.enabled);
  console.log("Active rule:", activeRule);

  const resetForm = () => {
    setNewRule({
      type: "CONTENT_CHANGE" as RuleType,
      notify_email: "",
    });
    setError(null);
  };

  // Test email mutation
  const testEmail = useMutation({
    mutationFn: async () => {
      const emailToTest = activeRule?.notify_email || newRule.notify_email;
      console.log("Testing email for:", emailToTest);

      if (!emailToTest) {
        throw new Error("Please enter an email address");
      }
      const response = await fetch("/api/monitoring/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToTest }),
      });
      if (!response.ok) throw new Error("Failed to send test email");
      return response.json();
    },
    onSuccess: () => {
      setError("Test email sent! Check your inbox.");
    },
    onError: (err) => {
      setError(
        err instanceof Error ? err.message : "Failed to send test email"
      );
    },
  });

  const createRule = useMutation({
    mutationFn: async (
      rule: Omit<
        MonitoringRule,
        "id" | "created_at" | "created_by" | "last_triggered"
      >
    ) => {
      if (!user) {
        throw new Error("You must be signed in to create monitoring rules");
      }

      if (!rule.notify_email) {
        throw new Error("Please enter an email address");
      }

      const response = await fetch("/api/monitoring/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          credentials: "include",
        },
        body: JSON.stringify({
          websiteId: rule.website_id,
          type: rule.type,
          notify_email: rule.notify_email,
          enabled: rule.enabled,
          threshold: rule.threshold,
          keyword: rule.keyword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create monitoring rule");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoringRules"] });
      resetForm();
      setError("Monitoring rule created successfully!");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    },
  });

  const stopMonitoring = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error("You must be signed in to stop monitoring");
      }

      console.log("Stopping monitoring for website:", websiteId);
      const response = await fetch("/api/monitoring/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          credentials: "include",
        },
        body: JSON.stringify({ websiteId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to stop monitoring");
      }

      const data = await response.json();
      console.log("Stop monitoring response:", data);
      return data;
    },
    onSuccess: async () => {
      console.log("Monitoring stopped, refreshing data...");
      // Invalidate all relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["monitoringRules"] }),
        queryClient.invalidateQueries({ queryKey: ["monitoringStatus"] }),
        queryClient.invalidateQueries({ queryKey: ["activeRules"] }),
        queryClient.invalidateQueries({ queryKey: ["websites"] }),
      ]);

      // Wait for all queries to be refetched
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["monitoringRules"] }),
        queryClient.refetchQueries({ queryKey: ["monitoringStatus"] }),
        queryClient.refetchQueries({ queryKey: ["activeRules"] }),
        queryClient.refetchQueries({ queryKey: ["websites"] }),
      ]);

      // Double-check the rules after a longer delay to account for eventual consistency
      setTimeout(async () => {
        const result = await refetch();
        if (result.data?.some((r: MonitoringRule) => r.enabled)) {
          console.warn("Some rules are still enabled after stop operation");
          setError(
            "Warning: Some monitoring rules may still be active. Please try again or contact support if the issue persists."
          );
        } else {
          resetForm();
          setError("Monitoring stopped successfully");
        }
      }, 5000); // Increased delay to 5 seconds
    },
    onError: (err) => {
      console.error("Failed to stop monitoring:", err);
      setError(
        err instanceof Error ? err.message : "Failed to stop monitoring"
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRule.mutate({
      website_id: websiteId,
      type: newRule.type,
      notify_email: newRule.notify_email,
      enabled: true,
      threshold: newRule.type === "CONTENT_CHANGE" ? 0 : 1,
      keyword: undefined,
    });
  };

  // If not authenticated, show sign-in prompt
  if (!user) {
    return (
      <div className="p-4 text-center">
        <p className="mb-4">Please sign in to create monitoring rules.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Monitoring Settings</h3>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => testEmail.mutate()}
            disabled={
              testEmail.isPending ||
              (!activeRule?.notify_email && !newRule.notify_email)
            }
          >
            {testEmail.isPending ? "Sending..." : "Test Email"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => stopMonitoring.mutate()}
            disabled={stopMonitoring.isPending || !activeRule?.enabled}
          >
            {stopMonitoring.isPending ? "Stopping..." : "Stop Monitoring"}
          </Button>
        </div>
      </div>

      {error && (
        <Alert
          variant={
            error.includes("success") || error.includes("sent")
              ? "default"
              : "destructive"
          }
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Get notified when new links appear on this page. The system will:
            <ul className="list-disc list-inside mt-2">
              <li>Check the page periodically</li>
              <li>Compare with previous snapshot</li>
              <li>Send you an email if new links are found</li>
            </ul>
          </div>

          {activeRule ? (
            <div className="text-sm">
              Currently monitoring with email:{" "}
              <strong>{activeRule.notify_email}</strong>
            </div>
          ) : (
            <Input
              type="email"
              placeholder="Notification Email"
              value={newRule.notify_email}
              onChange={(e) =>
                setNewRule({ ...newRule, notify_email: e.target.value })
              }
              required
            />
          )}

          {!activeRule && (
            <Button type="submit" disabled={createRule.isPending}>
              {createRule.isPending ? "Setting up..." : "Start Monitoring"}
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
