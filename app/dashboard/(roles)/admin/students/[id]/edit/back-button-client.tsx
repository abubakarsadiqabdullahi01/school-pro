// app/dashboard/(roles)/admin/students/[id]/edit/back-button-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export function BackButtonClient() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      onClick={() => router.push("/dashboard/admin/students")}
      className="flex items-center gap-2"
    >
      <ChevronLeft className="h-4 w-4" />
      Back to Students
    </Button>
  );
}
