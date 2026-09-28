import { notFound } from "next/navigation";
import { PageTransition } from "@/components/dashboard/page-transition";
import { ParentDetails } from "@/components/parent-managements/parent-details";
import { getParentDetails } from "@/app/actions/parent-management";
import { requireAdminSchool } from "@/lib/admin-page-context";
import { InfoGuide } from "@/components/ui/info-guide"

export default async function AdminParentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSchool("parents.manage");

  const { id } = await params;
  const result = await getParentDetails(id);

  if (!result.success || !result.data) {
    notFound();
  }
  const parent = result.data;

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-3xl font-bold tracking-tight">{parent.fullName}</h2>
            <InfoGuide guideKey="admin.parents" />
          </div>
          <p className="text-muted-foreground">
            Parent details for {parent.school.name} ({parent.school.code})
          </p>
        </div>
        <ParentDetails parent={parent} />
      </div>
    </PageTransition>
  );
}
