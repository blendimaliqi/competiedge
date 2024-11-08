import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getDaySuffix = (day: number): string => {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

export const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) {
    console.log("Date is null or undefined");
    return "Never";
  }

  try {
    const d = new Date(dateStr);

    if (isNaN(d.getTime())) {
      console.warn("Invalid date:", dateStr);
      return "Invalid Date";
    }

    const day = d.getDate();
    const suffix = getDaySuffix(day);
    const month = d.toLocaleString("default", { month: "long" });
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const time = `${hours}:${minutes}`;

    const formattedDate = `${time} ${day}${suffix} ${month} ${year}`;

    return formattedDate;
  } catch (error) {
    console.error("Date formatting error:", error, "for date:", dateStr);
    return "Invalid Date";
  }
};

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

// Helper function to parse and validate dates
export function parseDate(dateStr: string | undefined): string {
  if (!dateStr) return new Date().toISOString();

  try {
    // Handle relative time formats
    if (
      dateStr.includes("min") ||
      dateStr.includes("hour") ||
      dateStr.includes("day")
    ) {
      return new Date().toISOString();
    }

    // Try parsing the date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return new Date().toISOString();
    }
    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}
