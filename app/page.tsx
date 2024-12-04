import { CompetitorDashboard } from "@/components/dashboard/competitor-dashboard";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    console.log("Home page loaded");
  }, []);

  return (
    <main className="container mx-auto px-4 py-8">
      <CompetitorDashboard />
    </main>
  );
}
