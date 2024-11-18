"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitoringRule } from "@/lib/types/monitoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MonitoringRules({ websiteId }: { websiteId: string }) {
  const [newRule, setNewRule] = useState({
    type: "ARTICLE_COUNT",
    threshold: 0,
    keyword: "",
    notifyEmail: "blendi.maliqi93@gmail.com",
  });
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Test email mutation
  const testEmail = useMutation({
    mutationFn: async () => {
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
      const response = await fetch("/api/monitoring/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!response.ok) throw new Error("Failed to create rule");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoringRules"] });
      setError("Rule created successfully!");
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Monitoring Rules</h3>
        <Button
          variant="outline"
          onClick={() => testEmail.mutate()}
          disabled={testEmail.isPending}
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createRule.mutate({
              ...newRule,
              websiteId,
              enabled: true,
            } as MonitoringRule);
          }}
          className="space-y-4"
        >
          <Select
            value={newRule.type}
            onValueChange={(value) => setNewRule({ ...newRule, type: value })}
          >
            <option value="ARTICLE_COUNT">Article Count</option>
            <option value="KEYWORD">Keyword</option>
          </Select>

          <Input
            type="number"
            placeholder="Threshold"
            value={newRule.threshold}
            onChange={(e) =>
              setNewRule({ ...newRule, threshold: parseInt(e.target.value) })
            }
          />

          {newRule.type === "KEYWORD" && (
            <Input
              placeholder="Keyword"
              value={newRule.keyword}
              onChange={(e) =>
                setNewRule({ ...newRule, keyword: e.target.value })
              }
            />
          )}

          <Input
            type="email"
            placeholder="Notification Email"
            value={newRule.notifyEmail}
            onChange={(e) =>
              setNewRule({ ...newRule, notifyEmail: e.target.value })
            }
          />

          <Button type="submit" disabled={createRule.isPending}>
            {createRule.isPending ? "Creating..." : "Add Rule"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
