"use client";

import { useState } from "react";
import { CompetitorList } from "./competitor-list";
import { CategoryManager } from "./category-manager";
import { addWebsite } from "@/lib/services/website-service";
import { Alert, AlertDescription } from "../ui/alert";
import { Tabs } from "../ui/tabs";
import { AlertCircle } from "lucide-react";
import { Category } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { PlaceholdersAndVanishInput } from "@/components/ui/placeholders-and-vanish-input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";

export function CompetitorDashboard() {
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("latest");
  const queryClient = useQueryClient();

  const placeholders = [
    "Enter a website URL (e.g., https://example.com)",
    "Add your competitor's website",
    "Track a new website",
    "Monitor another competitor",
  ];

  // Categories query
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const validateUrl = (url: string): string => {
    try {
      // If URL doesn't start with a protocol, prepend https://
      if (!url.match(/^https?:\/\//i)) {
        url = "https://" + url;
      }
      new URL(url); // This will throw if URL is invalid
      return url;
    } catch (err) {
      throw new Error(
        "Please enter a valid website URL (e.g., https://example.com)"
      );
    }
  };

  // Add website mutation
  const addWebsiteMutation = useMutation({
    mutationFn: async (url: string) => {
      const validatedUrl = validateUrl(url);
      await addWebsite({
        name: new URL(validatedUrl).hostname,
        url: validatedUrl,
      });
    },
    onSuccess: () => {
      setNewUrl("");
      // Invalidate and refetch websites query
      queryClient.invalidateQueries({ queryKey: ["websites"] });
    },
    onError: (err) => {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to add website");
    },
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("categories")
        .insert({
          name,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err) => {
      console.error("Failed to create category:", err);
      setError("Failed to create category");
    },
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      // First delete all websites in the category
      const { error: websitesError } = await supabase
        .from("websites")
        .delete()
        .eq("category_id", categoryId);

      if (websitesError) throw websitesError;

      // Then delete the category itself
      const { error: deleteError } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId);

      if (deleteError) throw deleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["websites"] });
      if (selectedCategory !== "latest") {
        setSelectedCategory("latest");
      }
    },
    onError: (err) => {
      console.error("Failed to delete category:", err);
      setError("Failed to delete category and its websites");
    },
  });

  const handleAddCompetitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) {
      setError("Please enter a website URL");
      return;
    }
    addWebsiteMutation.mutate(newUrl);
  };

  // Handler for category creation that returns a Promise
  const handleCreateCategory = async (name: string) => {
    await createCategoryMutation.mutateAsync(name);
  };

  // Handler for category deletion that returns a Promise
  const handleDeleteCategory = async (categoryId: string) => {
    await deleteCategoryMutation.mutateAsync(categoryId);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Competitor Dashboard</h1>
        <div className="flex items-center gap-4">
          <MonitoringStatus />
          <CategoryManager
            categories={categories}
            onCategoryCreate={handleCreateCategory}
          />
        </div>
      </div>

      <div className="space-y-12">
        <div className="h-[20rem] flex flex-col justify-center items-center px-4">
          <h2 className="mb-10 text-xl text-center sm:text-3xl dark:text-white text-black">
            Monitor Your Competitors
          </h2>
          <div className="w-full max-w-3xl space-y-4">
            <PlaceholdersAndVanishInput
              placeholders={placeholders}
              onChange={(e) => setNewUrl(e.target.value)}
              onSubmit={handleAddCompetitor}
              loading={addWebsiteMutation.isPending}
            />
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="">
          <Tabs
            tabs={[
              {
                title: "Latest Additions",
                value: "latest",
                content: (
                  <CompetitorList
                    key="latest"
                    categoryId={null}
                    categories={categories}
                  />
                ),
              },
              ...categories.map((category) => ({
                title: category.name,
                value: category.id,
                content: (
                  <CompetitorList
                    key={category.id}
                    categoryId={category.id}
                    categories={categories}
                    onDeleteCategory={handleDeleteCategory}
                  />
                ),
              })),
            ]}
            containerClassName="mb-6"
            onValueChange={(value) => setSelectedCategory(value)}
          />
        </div>
      </div>
    </div>
  );
}
