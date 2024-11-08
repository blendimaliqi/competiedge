"use client";

import { useState } from "react";
import { Category } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

interface CategoryManagerProps {
  categories: Category[];
  onCategoryCreate: (name: string) => Promise<void>;
}

export function CategoryManager({ onCategoryCreate }: CategoryManagerProps) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    await onCategoryCreate(newCategoryName);
    setNewCategoryName("");
    setIsCreateOpen(false);
  };

  return (
    <div>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1" />
            New Category
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="categoryName" className="text-sm font-medium">
                Category Name
              </label>
              <Input
                id="categoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                className="mt-1"
              />
            </div>
            <Button type="submit">Create Category</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
