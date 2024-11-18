"use client";

import { useEffect } from "react";
import { monitoringService } from "@/lib/services/monitoring-service";

export function ClientMonitor() {
  useEffect(() => {
    const checkRules = async () => {
      try {
        await monitoringService.checkAllRules();
      } catch (error) {
        console.error("Failed to check monitoring rules:", error);
      }
    };

    // Check when component mounts
    checkRules();

    // Check every 15 minutes while the page is open
    const interval = setInterval(checkRules, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return null; // This component doesn't render anything
}
