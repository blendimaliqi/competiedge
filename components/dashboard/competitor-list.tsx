"use client";

import { useState } from "react";
import { Website, Article, Category } from "@/lib/types";
import { websiteService } from "@/lib/services/website-service";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw,
  Settings,
  InfoIcon,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { WebsiteCard } from "./website-card";
import { formatDate, formatDuration } from "@/lib/utils";
import { useToast } from "@/components/ui";

interface CompetitorListProps {
  categoryId: string | null;
  categories: Category[];
  onDeleteCategory?: (categoryId: string) => Promise<void>;
}

export function CompetitorList({
  categoryId,
  categories,
  onDeleteCategory,
}: CompetitorListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newArticles, setNewArticles] = useState<{ [key: string]: Article[] }>(
    {}
  );
  const [expandedHistory, setExpandedHistory] = useState<{
    [key: string]: boolean;
  }>({});
  const [editingPatterns, setEditingPatterns] = useState<string | null>(null);
  const [newContentPattern, setNewContentPattern] = useState("");
  const [newSkipPattern, setNewSkipPattern] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [sitesWithNewContent, setSitesWithNewContent] = useState<Set<string>>(
    new Set()
  );
  const [totalRefreshTime, setTotalRefreshTime] = useState<string>("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [expandedNewArticles, setExpandedNewArticles] = useState<Set<string>>(
    new Set()
  );
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [hasSelectedSort, setHasSelectedSort] = useState(false);

  // Track which websites are being refreshed individually
  const [refreshingWebsites, setRefreshingWebsites] = useState<Set<string>>(
    new Set()
  );

  const currentCategory = categories.find((c) => c.id === categoryId);

  const { data: websites = [], isLoading } = useQuery({
    queryKey: ["websites", categoryId, sortOrder],
    queryFn: async () => {
      try {
        const data = await websiteService.getWebsites(categoryId);
        return data.sort((a: Website, b: Website) => {
          const dateA = new Date(a.createdAt || 0).getTime();
          const dateB = new Date(b.createdAt || 0).getTime();
          return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
        });
      } catch (error) {
        console.error("Failed to fetch websites:", error);
        toast({
          title: "Error",
          description: "Failed to fetch websites. Please try again.",
          variant: "destructive",
        });
        return [];
      }
    },
  });

  const updateWebsiteMutation = useMutation({
    mutationFn: async (websiteId: string) => {
      try {
        const { newArticles } = await websiteService.updateWebsite({
          websiteId,
        });
        return { websiteId, newArticles };
      } catch (error) {
        console.error("Failed to update website:", error);
        throw error;
      }
    },
    onMutate: (websiteId) => {
      setRefreshingWebsites(
        (prev) => new Set([...Array.from(prev), websiteId])
      );
      setError(null);
    },
    onSettled: (_, __, websiteId) => {
      setRefreshingWebsites((prev) => {
        const next = new Set(Array.from(prev));
        next.delete(websiteId);
        return next;
      });
    },
    onSuccess: ({ websiteId, newArticles: updatedArticles }) => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });

      if (updatedArticles.length > 0) {
        setSitesWithNewContent(
          (prev) => new Set([...Array.from(prev), websiteId])
        );
        setNewArticles((prev) => ({
          ...prev,
          [websiteId]: updatedArticles,
        }));
        setExpandedNewArticles(
          (prev) => new Set([...Array.from(prev), websiteId])
        );

        toast({
          title: "New Content Found",
          description: `Found ${updatedArticles.length} new articles!`,
        });
      }
    },
    onError: (error) => {
      console.error("Failed to refresh website:", error);
      toast({
        title: "Error",
        description: "Failed to refresh website. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteWebsiteMutation = useMutation({
    mutationFn: async (websiteId: string) => {
      const response = await fetch(`/api/websites/${websiteId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete website");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: (error) => {
      console.error("Failed to delete website:", error);
      toast({
        title: "Error",
        description: "Failed to delete website. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updatePatternsMutation = useMutation({
    mutationFn: async ({
      websiteId,
      contentPatterns,
      skipPatterns,
    }: {
      websiteId: string;
      contentPatterns: string[];
      skipPatterns: string[];
    }) => {
      const response = await fetch(`/api/websites/${websiteId}/patterns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customContentPatterns: contentPatterns,
          customSkipPatterns: skipPatterns,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to update patterns");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: (error) => {
      console.error("Failed to update patterns:", error);
      toast({
        title: "Error",
        description: "Failed to update patterns. Please try again.",
        variant: "destructive",
      });
    },
  });

  const changeCategoryMutation = useMutation({
    mutationFn: async ({
      websiteId,
      newCategoryId,
    }: {
      websiteId: string;
      newCategoryId: string | null;
    }) => {
      const { data, error } = await supabase
        .from("websites")
        .update({
          category_id: newCategoryId === "null" ? null : newCategoryId,
        })
        .eq("id", websiteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => {
      console.error("Failed to update category:", error);
      setError("Failed to update category");
    },
  });

  const handleRefresh = (websiteId: string) => {
    updateWebsiteMutation.mutate(websiteId);
  };

  const handleDelete = (websiteId: string) => {
    if (confirm("Are you sure you want to delete this website?")) {
      deleteWebsiteMutation.mutate(websiteId);
    }
  };

  const toggleHistory = (websiteId: string) => {
    setExpandedHistory((prev) => ({
      ...prev,
      [websiteId]: !prev[websiteId],
    }));
  };

  const handleAddContentPattern = async (websiteId: string) => {
    if (!newContentPattern.trim()) return;

    try {
      const website = websites.find((w) => w.id === websiteId);
      if (!website) return;

      const updatedPatterns = [
        ...(website.customContentPatterns || []),
        newContentPattern.trim(),
      ];

      const updatedWebsite = await updatePatternsMutation.mutate({
        websiteId,
        contentPatterns: updatedPatterns,
        skipPatterns: website.customSkipPatterns,
      });

      queryClient.setQueryData(
        ["websites", categoryId, sortOrder],
        (oldData: Website[] = []) =>
          oldData.map((w) => (w.id === websiteId ? updatedWebsite : w))
      );

      setNewContentPattern("");
    } catch (error) {
      console.error("Failed to add content pattern:", error);
      setError("Failed to update patterns");
    }
  };

  const handleAddSkipPattern = async (websiteId: string) => {
    if (!newSkipPattern.trim()) return;

    try {
      const website = websites.find((w) => w.id === websiteId);
      if (!website) return;

      const updatedPatterns = [
        ...(website.customSkipPatterns || []),
        newSkipPattern.trim(),
      ];

      const updatedWebsite = await updatePatternsMutation.mutate({
        websiteId,
        contentPatterns: website.customContentPatterns,
        skipPatterns: updatedPatterns,
      });

      queryClient.setQueryData(
        ["websites", categoryId, sortOrder],
        (oldData: Website[] = []) =>
          oldData.map((w) => (w.id === websiteId ? updatedWebsite : w))
      );

      setNewSkipPattern("");
    } catch (error) {
      console.error("Failed to add skip pattern:", error);
      setError("Failed to update patterns");
    }
  };

  const handleRemovePattern = async (
    websiteId: string,
    pattern: string,
    type: "content" | "skip"
  ) => {
    try {
      const website = websites.find((w) => w.id === websiteId);
      if (!website) return;

      const updatedContentPatterns =
        type === "content"
          ? website.customContentPatterns?.filter((p) => p !== pattern)
          : website.customContentPatterns;

      const updatedSkipPatterns =
        type === "skip"
          ? website.customSkipPatterns?.filter((p) => p !== pattern)
          : website.customSkipPatterns;

      const updatedWebsite = await updatePatternsMutation.mutate({
        websiteId,
        contentPatterns: updatedContentPatterns,
        skipPatterns: updatedSkipPatterns,
      });

      queryClient.setQueryData(
        ["websites", categoryId, sortOrder],
        (oldData: Website[] = []) =>
          oldData.map((w) => (w.id === websiteId ? updatedWebsite : w))
      );
    } catch (error) {
      console.error("Failed to remove pattern:", error);
      setError("Failed to update patterns");
    }
  };

  const toggleFeedMutation = useMutation({
    mutationFn: async ({
      websiteId,
      enabled,
    }: {
      websiteId: string;
      enabled: boolean;
    }) => {
      const { data, error } = await supabase
        .from("websites")
        .update({ feed_enabled: enabled })
        .eq("id", websiteId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: (error) => {
      console.error("Failed to toggle feed:", error);
      setError("Failed to update feed settings");
    },
  });

  const handleToggleFeed = (websiteId: string, enabled: boolean) => {
    toggleFeedMutation.mutate({ websiteId, enabled });
  };

  const handleCategoryChange = (websiteId: string, newCategoryId: string) => {
    changeCategoryMutation.mutate({
      websiteId,
      newCategoryId: newCategoryId === "null" ? null : newCategoryId,
    });
  };

  const toggleArticleVisibility = async (
    articleId: string,
    hidden: boolean
  ) => {
    try {
      const response = await fetch(`/api/articles/${articleId}/visibility`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hidden }),
      });

      if (!response.ok) throw new Error("Failed to update visibility");

      // Update the query cache
      queryClient.setQueryData(
        ["websites", categoryId, sortOrder],
        (oldData: Website[] = []) =>
          oldData.map((w) => ({
            ...w,
            articles: w.articles?.map((a) =>
              a.id === articleId ? { ...a, hidden } : a
            ),
          }))
      );
    } catch (error) {
      console.error("Failed to toggle article visibility:", error);
      setError("Failed to update article visibility");
    }
  };

  const handleRefreshAll = async () => {
    if (refreshingAll) return;

    setRefreshingAll(true);
    setRefreshProgress(0);
    setStartTime(new Date());
    setError(null);

    try {
      const total = websites.length;
      let completed = 0;

      // Process websites in batches of 3 to avoid rate limiting
      for (let i = 0; i < websites.length; i += 3) {
        const batch = websites.slice(i, i + 3);
        await Promise.all(
          batch.map(async (website) => {
            try {
              await updateWebsiteMutation.mutateAsync(website.id);
            } catch (error) {
              console.error(`Failed to update website ${website.id}:`, error);
            }
            completed++;
            setRefreshProgress((completed / total) * 100);
          })
        );

        // Add a small delay between batches
        if (i + 3 < websites.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      const endTime = new Date();
      const duration = formatDuration(
        Math.floor((endTime.getTime() - (startTime?.getTime() || 0)) / 1000)
      );
      setTotalRefreshTime(duration);

      toast({
        title: "Refresh Complete",
        description: `All websites refreshed in ${duration}`,
      });
    } catch (error) {
      console.error("Failed to refresh all websites:", error);
      toast({
        title: "Error",
        description:
          "Failed to refresh all websites. Some updates may have failed.",
        variant: "destructive",
      });
    } finally {
      setRefreshingAll(false);
      setRefreshProgress(0);
      setStartTime(null);
    }
  };

  const handleUpdateCategoryName = async () => {
    if (!categoryId || !newCategoryName.trim()) return;

    setIsUpdatingName(true);
    try {
      const { error } = await supabase
        .from("categories")
        .update({ name: newCategoryName.trim() })
        .eq("id", categoryId);

      if (error) throw error;

      // Update local state
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      setIsSettingsOpen(false);
    } catch (err) {
      console.error("Failed to update category name:", err);
      setError("Failed to update category name");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryId || !onDeleteCategory) return;

    setIsDeleting(true);
    try {
      await onDeleteCategory(categoryId);
      setIsDeleteOpen(false);
    } catch (error) {
      console.error("Failed to delete category:", error);
      setError("Failed to delete category");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <div>Loading websites...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mt-14">
        <h2 className="text-2xl font-bold">
          {categoryId ? currentCategory?.name : "Latest Additions"}
        </h2>
        <div className="flex items-center gap-4">
          {refreshingAll && (
            <div className="flex items-center gap-2 min-w-[300px]">
              <div className="flex-1 flex items-center gap-2">
                <Progress value={refreshProgress} className="w-[200px]" />
                <span className="text-sm text-muted-foreground">
                  {Math.round(refreshProgress)}%
                </span>
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {totalRefreshTime}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleRefreshAll}
              disabled={refreshingAll || isLoading}
            >
              {refreshingAll ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh All
                </>
              )}
            </Button>

            <Select
              value={sortOrder}
              onValueChange={(value: "newest" | "oldest") => {
                setSortOrder(value);
                setHasSelectedSort(true);
              }}
            >
              <SelectTrigger className="w-[100px]">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>
                    {!hasSelectedSort
                      ? "Sort by"
                      : sortOrder === "newest"
                      ? "New"
                      : "Old"}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">New</SelectItem>
                <SelectItem value="oldest">Old</SelectItem>
              </SelectContent>
            </Select>

            {categoryId && onDeleteCategory && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <Settings className="w-4 h-4" />
                </Button>

                <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Category Settings</DialogTitle>
                      <DialogDescription>
                        Manage settings for category "{currentCategory?.name}"
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium">
                          Category Name
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id="name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder={currentCategory?.name}
                          />
                          <Button
                            onClick={handleUpdateCategoryName}
                            disabled={isUpdatingName || !newCategoryName.trim()}
                          >
                            {isUpdatingName ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>

                      <div className="">
                        <div className=" rounded-lg ">
                          <div className="flex justify-between items-center">
                            <div>
                              <h5 className="font-medium">Delete Category</h5>
                              <p className="text-sm text-muted-foreground w-64">
                                This will permanently delete this category and
                                all its websites
                              </p>
                            </div>
                            <Button
                              variant="destructive"
                              onClick={() => {
                                setIsSettingsOpen(false);
                                setIsDeleteOpen(true);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Category</DialogTitle>
                      <DialogDescription className="text-black-600">
                        Warning: This will permanently delete the category "
                        {currentCategory?.name}" and ALL websites within it.
                        This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setIsDeleteOpen(false)}
                        disabled={isDeleting}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteCategory}
                        disabled={isDeleting}
                      >
                        {isDeleting ? "Deleting..." : "Delete Category"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {websites.map((website) => (
          <WebsiteCard
            key={website.id}
            website={website}
            categories={categories}
            expandedHistory={expandedHistory}
            editingPatterns={editingPatterns}
            refreshingWebsites={refreshingWebsites}
            deleting={deleting}
            sitesWithNewContent={sitesWithNewContent}
            expandedNewArticles={expandedNewArticles}
            newArticles={newArticles}
            onToggleHistory={toggleHistory}
            onRefresh={handleRefresh}
            onDelete={handleDelete}
            onSetEditingPatterns={(websiteId) =>
              setEditingPatterns(
                editingPatterns === websiteId ? null : websiteId
              )
            }
            onToggleNewArticles={(websiteId) => {
              setExpandedNewArticles((prev) => {
                const next = new Set(Array.from(prev));
                if (next.has(websiteId)) {
                  next.delete(websiteId);
                } else {
                  next.add(websiteId);
                }
                return next;
              });
            }}
            onToggleArticleVisibility={toggleArticleVisibility}
            onAddContentPattern={handleAddContentPattern}
            onAddSkipPattern={handleAddSkipPattern}
            onRemovePattern={handleRemovePattern}
            onToggleFeed={handleToggleFeed}
            onCategoryChange={handleCategoryChange}
            formatDate={formatDate}
          />
        ))}
      </div>
    </div>
  );
}
