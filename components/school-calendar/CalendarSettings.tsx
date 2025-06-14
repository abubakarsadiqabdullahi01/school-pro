"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { updateSessionDates, updateTermDates } from "@/app/actions/school-calendar"
import { Save, Edit } from "lucide-react"
import { format } from "date-fns"

interface CalendarSettingsProps {
  sessions: any[]
  onUpdate: () => void
}

export function CalendarSettings({ sessions, onUpdate }: CalendarSettingsProps) {
  const [editingSession, setEditingSession] = useState<string | null>(null)
  const [editingTerm, setEditingTerm] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleUpdateSession = async (sessionId: string, formData: FormData) => {
    setIsLoading(true)
    try {
      const startDate = new Date(formData.get("startDate") as string)
      const endDate = new Date(formData.get("endDate") as string)

      const result = await updateSessionDates(sessionId, startDate, endDate)

      if (result.success) {
        toast.success("Success", {
          description: result.message,
        })
        setEditingSession(null)
        onUpdate()
      } else {
        toast.error("Error", {
          description: result.message,
        })
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update session dates",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateTerm = async (termId: string, formData: FormData) => {
    setIsLoading(true)
    try {
      const startDate = new Date(formData.get("startDate") as string)
      const endDate = new Date(formData.get("endDate") as string)

      const result = await updateTermDates(termId, startDate, endDate)

      if (result.success) {
        toast.success("Success", {
          description: result.message,
        })
        setEditingTerm(null)
        onUpdate()
      } else {
        toast.error("Error", {
          description: result.message,
        })
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update term dates",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Calendar Settings</CardTitle>
          <CardDescription>Manage your academic calendar dates and schedules</CardDescription>
        </CardHeader>
      </Card>

      {/* Sessions */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Academic Sessions</h3>

        {sessions.map((session) => (
          <Card key={session.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{session.name}</CardTitle>
                  <CardDescription>
                    {session.terms.length} terms • {session.totalWeeks} weeks total
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {session.isCurrent && <Badge variant="default">Current</Badge>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSession(editingSession === session.id ? null : session.id)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {editingSession === session.id ? (
                <form action={(formData) => handleUpdateSession(session.id, formData)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`session-start-${session.id}`}>Start Date</Label>
                      <Input
                        id={`session-start-${session.id}`}
                        name="startDate"
                        type="date"
                        defaultValue={format(new Date(session.startDate), "yyyy-MM-dd")}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`session-end-${session.id}`}>End Date</Label>
                      <Input
                        id={`session-end-${session.id}`}
                        name="endDate"
                        type="date"
                        defaultValue={format(new Date(session.endDate), "yyyy-MM-dd")}
                        required
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={isLoading}>
                      <Save className="h-4 w-4 mr-2" />
                      {isLoading ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingSession(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Start Date:</span>
                      <div className="font-medium">{format(new Date(session.startDate), "MMM dd, yyyy")}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">End Date:</span>
                      <div className="font-medium">{format(new Date(session.endDate), "MMM dd, yyyy")}</div>
                    </div>
                  </div>

                  {/* Terms */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Terms</h4>
                    {session.terms.map((term: any) => (
                      <div key={term.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{term.name}</span>
                            <Badge
                              variant={
                                term.status === "current"
                                  ? "default"
                                  : term.status === "completed"
                                    ? "secondary"
                                    : "outline"
                              }
                              className="text-xs"
                            >
                              {term.status}
                            </Badge>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingTerm(editingTerm === term.id ? null : term.id)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>

                        {editingTerm === term.id ? (
                          <form action={(formData) => handleUpdateTerm(term.id, formData)} className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label htmlFor={`term-start-${term.id}`} className="text-xs">
                                  Start Date
                                </Label>
                                <Input
                                  id={`term-start-${term.id}`}
                                  name="startDate"
                                  type="date"
                                  defaultValue={format(new Date(term.startDate), "yyyy-MM-dd")}
                                  className="text-sm"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor={`term-end-${term.id}`} className="text-xs">
                                  End Date
                                </Label>
                                <Input
                                  id={`term-end-${term.id}`}
                                  name="endDate"
                                  type="date"
                                  defaultValue={format(new Date(term.endDate), "yyyy-MM-dd")}
                                  className="text-sm"
                                  required
                                />
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Button type="submit" size="sm" disabled={isLoading}>
                                <Save className="h-3 w-3 mr-1" />
                                {isLoading ? "Saving..." : "Save"}
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => setEditingTerm(null)}>
                                Cancel
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground">Start:</span>
                              <div>{format(new Date(term.startDate), "MMM dd, yyyy")}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">End:</span>
                              <div>{format(new Date(term.endDate), "MMM dd, yyyy")}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duration:</span>
                              <div>{term.weeks} weeks</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
