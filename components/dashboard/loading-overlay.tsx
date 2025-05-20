"use client";

import { useLoading } from "@/contexts/loading-context";
import { motion } from "framer-motion";

export function LoadingOverlay() {
  const { isLoading } = useLoading();

  if (!isLoading) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-live="polite"
      aria-busy={isLoading}
      role="status"
    >
      <div className="flex flex-col items-center gap-4">
        <motion.div
          className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          aria-hidden="true"
        />
        <span className="text-sm font-medium text-muted-foreground">Loading...</span>
      </div>
    </motion.div>
  );
}