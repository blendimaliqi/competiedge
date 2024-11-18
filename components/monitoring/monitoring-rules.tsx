"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitoringRule } from "@/lib/types/monitoring";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

export function MonitoringRules({ websiteId }: { websiteId: string }) {
  const [newRule, setNewRule] = useState({
    type: "ARTICLE_COUNT",
    threshold: 0,
    keyword: "",
    notifyEmail: "",
  });

  const queryClient = useQueryClient();

  const { data: rules } = useQuery({
    queryKey: ["monitoringRules", websiteId],
    queryFn: async () => {
      const response = await fetch(
        `/api/monitoring/rules?websiteId=${websiteId}`
      );
      if (!response.ok) throw new Error("Failed to fetch rules");
      return response.json();
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
    },
  });

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Monitoring Rules</h3>

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
            <option value="SOCIAL_MENTIONS">Social Mentions</option>
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

          <Button type="submit">Add Rule</Button>
        </form>
      </Card>

      <div className="space-y-2">
        {rules?.map((rule: MonitoringRule) => (
          <Card key={rule.id} className="p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium">{rule.type}</p>
                <p className="text-sm text-muted-foreground">
                  Threshold: {rule.threshold}
                  {rule.keyword && ` | Keyword: ${rule.keyword}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  Notify: {rule.notifyEmail}
                </p>
              </div>
              {/* Add edit/delete buttons here */}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
