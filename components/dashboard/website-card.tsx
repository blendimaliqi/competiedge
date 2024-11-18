"use client";

import { useState } from "react";
import { WebsiteCardProps } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronUp,
  Settings,
  Trash2,
  ExternalLink,
  RefreshCw,
  X,
  EyeOff,
} from "lucide-react";
import { MonitoringRules } from "@/components/monitoring/monitoring-rules";

export function WebsiteCard({
  website,
  categories,
  expandedHistory,
  editingPatterns,
  refreshingWebsites,
  deleting,
  sitesWithNewContent,
  expandedNewArticles,
  newArticles,
  onToggleHistory,
  onRefresh,
  onDelete,
  onSetEditingPatterns,
  onToggleNewArticles,
  onToggleArticleVisibility,
  onAddContentPattern,
  onAddSkipPattern,
  onRemovePattern,
  onToggleFeed,
  onCategoryChange,
  formatDate,
}: WebsiteCardProps) {
  const [newContentPattern, setNewContentPattern] = useState("");
  const [newSkipPattern, setNewSkipPattern] = useState("");

  const getNewArticlesCount = (websiteId: string) => {
    return newArticles[websiteId]?.length || 0;
  };

  return (
    <Card
      key={website.id}
      className={`p-6 space-y-4 ${
        sitesWithNewContent.has(website.id) ? "border-green-500 border-2" : ""
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{website.name}</h3>
            {sitesWithNewContent.has(website.id) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 bg-green-100 hover:bg-green-200 text-green-700 px-2 rounded-full flex items-center gap-1"
                onClick={() => onToggleNewArticles(website.id)}
              >
                <span className="text-xs font-medium">
                  {getNewArticlesCount(website.id)} new articles
                </span>
                {expandedNewArticles.has(website.id) ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{website.url}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              Articles:{" "}
              <span className="font-medium">{website.articleCount}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Last checked: {formatDate(website.lastChecked)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onToggleHistory(website.id)}
          >
            {expandedHistory[website.id] ? (
              <>
                <ChevronUp className="w-4 h-4" /> History
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" /> History
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onRefresh(website.id)}
            disabled={refreshingWebsites.has(website.id)}
          >
            <RefreshCw
              className={`w-4 h-4 mr-1 ${
                refreshingWebsites.has(website.id) ? "animate-spin" : ""
              }`}
            />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSetEditingPatterns(website.id)}
          >
            <Settings className="w-4 h-4 mr-1" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(website.id)}
            disabled={deleting === website.id}
          >
            <Trash2 className="w-4 h-4" />
            {deleting === website.id ? "Deleting..." : ""}
          </Button>
        </div>
      </div>

      {/* New Articles Section */}
      {sitesWithNewContent.has(website.id) &&
        expandedNewArticles.has(website.id) && (
          <div className="mt-4 border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-sm font-semibold text-green-600">
                New Articles Found:
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleNewArticles(website.id)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2">
              {[...newArticles[website.id]]
                .sort(
                  (a, b) =>
                    new Date(b.firstSeen).getTime() -
                    new Date(a.firstSeen).getTime()
                )
                .map((article, index) => (
                  <Card key={index} className="p-4 bg-green-50">
                    <h5 className="font-medium">{article.title}</h5>
                    {article.date && (
                      <p className="text-xs text-muted-foreground">
                        Published: {formatDate(article.date)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Found at: {article.path}
                    </p>
                    {article.url && (
                      <Button variant="link" size="sm" className="px-0" asChild>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Read Article <ExternalLink className="w-4 h-4 ml-1" />
                        </a>
                      </Button>
                    )}
                    {article.summary && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {article.summary}
                      </p>
                    )}
                  </Card>
                ))}
            </div>
          </div>
        )}

      {/* History Section */}
      {expandedHistory[website.id] && website.articles && (
        <div className="mt-4 border-t pt-4">
          <h4 className="text-sm font-semibold text-foreground mb-2">
            Article History
          </h4>
          <ScrollArea className="h-96">
            <div className="space-y-2">
              {[...website.articles]
                .sort((a, b) => {
                  const dateComparison =
                    new Date(b.firstSeen).getTime() -
                    new Date(a.firstSeen).getTime();
                  if (dateComparison !== 0) return dateComparison;
                  if (a.date && b.date) {
                    return (
                      new Date(b.date).getTime() - new Date(a.date).getTime()
                    );
                  }
                  return 0;
                })
                .filter((article) => !article.hidden)
                .map((article, index) => (
                  <Card key={index} className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-medium">{article.title}</h5>
                        <p className="text-xs text-muted-foreground">
                          First detected: {formatDate(article.firstSeen)}
                        </p>
                        {article.date && (
                          <p className="text-xs text-muted-foreground">
                            Published: {formatDate(article.date)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Location: {article.path}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onToggleArticleVisibility(article.id!, true)
                          }
                          title="Hide from history"
                        >
                          <EyeOff className="w-4 h-4" />
                        </Button>
                        <Button variant="link" size="sm" asChild>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Visit <ExternalLink className="w-4 h-4 ml-1" />
                          </a>
                        </Button>
                      </div>
                    </div>
                    {article.summary && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {article.summary}
                      </p>
                    )}
                  </Card>
                ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Pattern Management Section */}
      {editingPatterns === website.id && (
        <div className="mt-4 border-t pt-4 space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">
              Custom Content Patterns
            </h4>
            <div className="flex gap-2 mb-2">
              <Input
                value={newContentPattern}
                onChange={(e) => setNewContentPattern(e.target.value)}
                placeholder="Add pattern to match (e.g., /news/)"
                className="flex-1"
              />
              <Button
                onClick={() => {
                  onAddContentPattern(website.id, newContentPattern);
                  setNewContentPattern("");
                }}
                variant="secondary"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {website.customContentPatterns?.map((pattern) => (
                <Badge
                  key={pattern}
                  variant="secondary"
                  className="px-2 py-1 flex items-center gap-1"
                >
                  {pattern}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent"
                    onClick={() =>
                      onRemovePattern(website.id, pattern, "content")
                    }
                  >
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Custom Skip Patterns</h4>
            <div className="flex gap-2 mb-2">
              <Input
                value={newSkipPattern}
                onChange={(e) => setNewSkipPattern(e.target.value)}
                placeholder="Add pattern to skip (e.g., /profile/)"
                className="flex-1"
              />
              <Button
                onClick={() => {
                  onAddSkipPattern(website.id, newSkipPattern);
                  setNewSkipPattern("");
                }}
                variant="secondary"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {website.customSkipPatterns?.map((pattern) => (
                <Badge
                  key={pattern}
                  variant="destructive"
                  className="px-2 py-1 flex items-center gap-1"
                >
                  {pattern}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-transparent text-destructive-foreground"
                    onClick={() => onRemovePattern(website.id, pattern, "skip")}
                  >
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {website.feed_url && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id={`feed-${website.id}`}
              checked={website.feed_enabled}
              onCheckedChange={(checked) =>
                onToggleFeed(website.id, checked as boolean)
              }
            />
            <label
              htmlFor={`feed-${website.id}`}
              className="text-sm text-muted-foreground"
            >
              Use RSS Feed
            </label>
          </div>
          <span className="text-xs text-muted-foreground">
            ({website.feed_url})
          </span>
        </div>
      )}

      <div className="mt-4">
        <Select
          value={website.category_id || "null"}
          onValueChange={(value) => onCategoryChange(website.id, value)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue>
              {website.category_id === null
                ? "Latest Additions"
                : categories.find((c) => c.id === website.category_id)?.name ||
                  "Change category"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="null">Latest Additions</SelectItem>
            {categories.map((category) => (
              <SelectItem
                key={category.id}
                value={category.id}
                className={
                  website.category_id === category.id ? "bg-accent" : ""
                }
              >
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {editingPatterns === website.id && (
        <div className="mt-4 border-t pt-4">
          <MonitoringRules websiteId={website.id} />
        </div>
      )}
    </Card>
  );
}
