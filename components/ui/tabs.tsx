"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Tab = {
  title: string;
  value: string;
  content?: string | React.ReactNode | any;
};

interface TabsProps {
  tabs: Tab[];
  containerClassName?: string;
  activeTabClassName?: string;
  tabClassName?: string;
  contentClassName?: string;
  onValueChange?: (value: string) => void;
}

export const Tabs = ({
  tabs: propTabs,
  containerClassName,
  activeTabClassName,
  tabClassName,
  contentClassName,
  onValueChange,
}: TabsProps) => {
  const [active, setActive] = useState<Tab>(propTabs[0]);
  const [tabs, setTabs] = useState<Tab[]>(propTabs);

  // Update tabs when propTabs change
  useEffect(() => {
    setTabs(propTabs);
    // Find and set the currently active tab in the new props
    const currentActiveTab =
      propTabs.find((tab) => tab.value === active.value) || propTabs[0];
    setActive(currentActiveTab);
  }, [propTabs]);

  const moveSelectedTabToTop = (idx: number) => {
    const selectedTab = propTabs[idx];
    setActive(selectedTab);
    onValueChange?.(selectedTab.value);
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-row items-center justify-start [perspective:1000px] relative overflow-auto sm:overflow-visible no-visible-scrollbar max-w-full w-full",
          containerClassName
        )}
      >
        {propTabs.map((tab, idx) => (
          <button
            key={tab.value}
            onClick={() => moveSelectedTabToTop(idx)}
            className={cn("relative px-4 py-2 rounded-full", tabClassName)}
            style={{
              transformStyle: "preserve-3d",
            }}
          >
            {active.value === tab.value && (
              <motion.div
                layoutId="clickedbutton"
                transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
                className={cn(
                  "absolute inset-0 bg-gray-200 dark:bg-zinc-800 rounded-full ",
                  activeTabClassName
                )}
              />
            )}

            <span className="relative block text-black dark:text-white">
              {tab.title}
            </span>
          </button>
        ))}
      </div>
      <div className="relative w-full min-h-[500px] mt-6">
        {propTabs.map((tab) => (
          <motion.div
            key={tab.value}
            initial={{ opacity: 0, x: 20 }}
            animate={{
              opacity: tab.value === active.value ? 1 : 0,
              x: tab.value === active.value ? 0 : 20,
              pointerEvents: tab.value === active.value ? "auto" : "none",
            }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className={cn(
              "absolute top-0 left-0 w-full",
              tab.value === active.value ? "relative" : "absolute",
              contentClassName
            )}
          >
            {tab.content}
          </motion.div>
        ))}
      </div>
    </>
  );
};
