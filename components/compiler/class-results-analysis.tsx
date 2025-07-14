"use client";

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ChartContainer, ChartTooltipContent, ChartLegendContent } from "@/components/ui/chart";

interface ClassResultsAnalysisProps {
  results: Array<{
    studentId: string;
    studentName: string;
    admissionNo: string;
    gender: string;
    subjects: Record<string, { score: number | null; grade: string | null }>;
    totalScore: number;
    averageScore: number;
    grade: string;
    position: number;
  }>;
  subjects: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  className: string;
  termName: string;
  sessionName: string;
}

export function ClassResultsAnalysis({
  results,
  subjects,
}: ClassResultsAnalysisProps) {
  // Calculate gender distribution
  const genderDistribution = useMemo(() => {
    const distribution = {
      male: 0,
      female: 0,
      other: 0,
    };

    results.forEach((result) => {
      if (result.gender === "MALE") distribution.male++;
      else if (result.gender === "FEMALE") distribution.female++;
      else distribution.other++;
    });

    return [
      { name: "Male", count: distribution.male, color: "#2563eb" },
      { name: "Female", count: distribution.female, color: "#ec4899" },
      ...(distribution.other > 0 ? [{ name: "Other", count: distribution.other, color: "#6b7280" }] : []),
    ];
  }, [results]);

  // Calculate grade distribution
  const gradeDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};

    results.forEach((result) => {
      if (!distribution[result.grade]) {
        distribution[result.grade] = 0;
      }
      distribution[result.grade]++;
    });

    return Object.entries(distribution)
      .sort(([gradeA], [gradeB]) => gradeA.localeCompare(gradeB))
      .map(([grade, count]) => ({
        grade,
        count,
        color: grade.startsWith("A")
          ? "#22c55e"
          : grade.startsWith("B")
          ? "#3b82f6"
          : grade.startsWith("C")
          ? "#eab308"
          : grade.startsWith("D") || grade.startsWith("E")
          ? "#f97316"
          : "#ef4444",
      }));
  }, [results]);

  // Calculate subject performance
  const subjectPerformance = useMemo(() => {
    return subjects.map((subject) => {
      const scores = results
        .map((result) => result.subjects[subject.id]?.score)
        .filter((score): score is number => score !== null && score !== undefined);

      const totalScore = scores.reduce((sum, score) => sum + score, 0);
      const averageScore = scores.length > 0 ? totalScore / scores.length : 0;
      const passCount = scores.filter((score) => score >= 40).length;
      const passRate = scores.length > 0 ? (passCount / scores.length) * 100 : 0;

      return {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        averageScore,
        passRate,
        highestScore: Math.max(...scores, 0),
        lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
        color:
          passRate >= 80
            ? "#22c55e"
            : passRate >= 60
            ? "#3b82f6"
            : passRate >= 40
            ? "#eab308"
            : "#ef4444",
      };
    });
  }, [results, subjects]);

  // Calculate class statistics
  const classStats = useMemo(() => {
    const totalStudents = results.length;
    const averageScores = results.map((r) => r.averageScore);
    const classAverage = averageScores.reduce((sum, score) => sum + score, 0) / totalStudents;
    const passCount = results.filter((r) => r.averageScore >= 40).length;
    const passRate = (passCount / totalStudents) * 100;

    return {
      totalStudents,
      classAverage,
      passCount,
      passRate,
      highestAverage: Math.max(...averageScores, 0),
      lowestAverage: Math.min(...averageScores, 0),
      topStudent: results.find((r) => r.position === 1)?.studentName || "N/A",
    };
  }, [results]);

  // Chart configurations
  const gradeChartConfig = gradeDistribution.reduce(
    (acc, { grade, color }) => ({
      ...acc,
      [grade]: { label: grade, color },
    }),
    {} as Record<string, { label: string; color: string }>,
  );

  const subjectChartConfig = subjectPerformance.reduce(
    (acc, { code, color }) => ({
      ...acc,
      [code]: { label: code, color },
    }),
    {} as Record<string, { label: string; color: string }>,
  );

  const genderChartConfig = genderDistribution.reduce(
    (acc, { name, color }) => ({
      ...acc,
      [name]: { label: name, color },
    }),
    {} as Record<string, { label: string; color: string }>,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classStats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              {genderDistribution.find((g) => g.name === "Male")?.count} Male,{" "}
              {genderDistribution.find((g) => g.name === "Female")?.count} Female
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Class Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classStats.classAverage.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Range: {classStats.lowestAverage.toFixed(1)} - {classStats.highestAverage.toFixed(1)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{classStats.passRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {classStats.passCount} of {classStats.totalStudents} students passed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Student</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{classStats.topStudent}</div>
            <p className="text-xs text-muted-foreground">Position 1</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="grade-distribution" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="grade-distribution">Grade Distribution</TabsTrigger>
          <TabsTrigger value="subject-performance">Subject Performance</TabsTrigger>
          <TabsTrigger value="gender-analysis">Gender Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="grade-distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Grade Distribution</CardTitle>
              <CardDescription>Distribution of grades across the class</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <ChartContainer config={gradeChartConfig}>
                <BarChart data={gradeDistribution} height={300}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="grade" />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend content={<ChartLegendContent />} />
                  <Bar dataKey="count" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subject-performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subject Performance</CardTitle>
              <CardDescription>Average scores across different subjects</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <ChartContainer config={subjectChartConfig}>
                <BarChart data={subjectPerformance} height={300}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="code" />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend content={<ChartLegendContent />} />
                  <Bar dataKey="averageScore" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {subjectPerformance.map((subject) => (
              <Card key={subject.id}>
                <CardHeader className="pb-2">
                  <CardTitle>
                    {subject.name} ({subject.code})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium">Average Score</p>
                      <p className="text-2xl font-bold">{subject.averageScore.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Pass Rate</p>
                      <p className="text-2xl font-bold">{subject.passRate.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Highest Score</p>
                      <p className="text-xl font-bold">{subject.highestScore.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Lowest Score</p>
                      <p className="text-xl font-bold">{subject.lowestScore.toFixed(1)}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="gender-analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Gender Distribution</CardTitle>
              <CardDescription>Distribution of students by gender</CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
              <ChartContainer config={genderChartConfig}>
                <BarChart data={genderDistribution} height={300}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Legend content={<ChartLegendContent />} />
                  <Bar dataKey="count" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance by Gender</CardTitle>
              <CardDescription>Comparison of academic performance between genders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Male Students</h3>
                  {(() => {
                    const maleStudents = results.filter((r) => r.gender === "MALE");
                    const maleAvg =
                      maleStudents.reduce((sum, r) => sum + r.averageScore, 0) / (maleStudents.length || 1);
                    const malePassCount = maleStudents.filter((r) => r.averageScore >= 40).length;
                    const malePassRate = (malePassCount / (maleStudents.length || 1)) * 100;

                    return (
                      <div className="space-y-2">
                        <p>Count: {maleStudents.length}</p>
                        <p>Average: {maleAvg.toFixed(1)}%</p>
                        <p>Pass Rate: {malePassRate.toFixed(1)}%</p>
                        <p>
                          Top Position:{" "}
                          {maleStudents.length > 0 ? Math.min(...maleStudents.map((s) => s.position)) : "N/A"}
                        </p>
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">Female Students</h3>
                  {(() => {
                    const femaleStudents = results.filter((r) => r.gender === "FEMALE");
                    const femaleAvg =
                      femaleStudents.reduce((sum, r) => sum + r.averageScore, 0) / (femaleStudents.length || 1);
                    const femalePassCount = femaleStudents.filter((r) => r.averageScore >= 40).length;
                    const femalePassRate = (femalePassCount / (femaleStudents.length || 1)) * 100;

                    return (
                      <div className="space-y-2">
                        <p>Count: {femaleStudents.length}</p>
                        <p>Average: {femaleAvg.toFixed(1)}%</p>
                        <p>Pass Rate: {femalePassRate.toFixed(1)}%</p>
                        <p>
                          Top Position:{" "}
                          {femaleStudents.length > 0 ? Math.min(...femaleStudents.map((s) => s.position)) : "N/A"}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}