"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitoringRule } from "@/lib/types/monitoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    notifyEmail: "",
  });
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const resetForm = () => {
    setNewRule({
      type: "CONTENT_CHANGE" as RuleType,
      notifyEmail: "",
    });
    setError(null);
  };

  // Test email mutation
  const testEmail = useMutation({
    mutationFn: async () => {
      if (!newRule.notifyEmail) {
        throw new Error("Please enter an email address");
      }
      const response = await fetch("/api/monitoring/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newRule.notifyEmail }),
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
    mutationFn: async (rule: Omit<MonitoringRule, "id">) => {
      if (!rule.notifyEmail) {
        throw new Error("Please enter an email address");
      }

      const response = await fetch("/api/monitoring/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create rule");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoringRules"] });
      setError("Rule created successfully!");
      resetForm();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    },
  });

  const handleTypeChange = (value: RuleType) => {
    setNewRule({
      ...newRule,
      type: value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate email
    if (!newRule.notifyEmail) {
      setError("Please enter an email address");
      return;
    }

    const ruleData = {
      ...newRule,
      websiteId,
      enabled: true,
    };

    createRule.mutate(ruleData as MonitoringRule);
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
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Page Monitoring</h3>
        <Button
          variant="outline"
          onClick={() => testEmail.mutate()}
          disabled={testEmail.isPending || !newRule.notifyEmail}
        >
          {testEmail.isPending ? "Sending..." : "Test Email"}
        </Button>
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

          <Input
            type="email"
            placeholder="Notification Email"
            value={newRule.notifyEmail}
            onChange={(e) =>
              setNewRule({ ...newRule, notifyEmail: e.target.value })
            }
            required
          />

          <Button type="submit" disabled={createRule.isPending}>
            {createRule.isPending ? "Setting up..." : "Start Monitoring"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
