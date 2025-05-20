import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/dashboard/page-transition";
import { ParentDetails } from "@/components/parent-managements/parent-details";
import { getParentDetails } from "@/app/actions/parent-management";

export default async function AdminParentDetailsPage({ params }: { params: { id: string } }) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const id = (await params)?.id;
  const result = await getParentDetails(id);

  if (!result.success) {
    notFound();
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{result.data.fullName}</h2>
          <p className="text-muted-foreground">
            Parent details for {result.data.school.name} ({result.data.school.code})
          </p>
        </div>
        <ParentDetails parent={result.data} />
      </div>
    </PageTransition>
  );
}