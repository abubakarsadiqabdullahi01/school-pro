// components/student-management/edit-student-button.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";

interface EditStudentButtonProps {
  studentId: string;
}

export function EditStudentButton({ studentId }: EditStudentButtonProps) {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => router.push(`/dashboard/admin/students/${studentId}/edit`)}
    >
      <Edit className="h-4 w-4 mr-2" />
      Edit
    </Button>
  );
}
