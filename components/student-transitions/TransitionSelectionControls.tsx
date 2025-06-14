"use client"

import { memo } from "react"
import { Loader2, ArrowRight } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

interface TransitionSelectionControlsProps {
  form: {
    fromTermId: string
    toTermId: string
    fromClassTermId: string
    toClassTermId: string
    transitionType: string
  }
  transitionOptions: any
  transitionClasses: any
  isLoadingOptions: boolean
  isLoadingClasses: boolean
  onFromTermChange: (value: string) => void
  onToTermChange: (value: string) => void
  onFromClassChange: (value: string) => void
  onToClassChange: (value: string) => void
}

export const TransitionSelectionControls = memo(function TransitionSelectionControls({
  form,
  transitionOptions,
  transitionClasses,
  isLoadingOptions,
  isLoadingClasses,
  onFromTermChange,
  onToTermChange,
  onFromClassChange,
  onToClassChange,
}: TransitionSelectionControlsProps) {
  const getTermDisplayName = (term: any) => {
    if (!term) return "Unknown Term"
    const sessionName = term.session?.name || "Unknown Session"
    const termName = term.name || "Unknown"
    const currentIndicator = term.isCurrent ? " (Current)" : ""
    return `${sessionName} - ${termName}${currentIndicator}`
  }

  // Check if source classes are available
  const hasSourceClasses = Array.isArray(transitionClasses?.sourceClasses) && transitionClasses.sourceClasses.length > 0
  
  // Check if destination classes are available
  const hasDestinationClasses = Array.isArray(transitionClasses?.destinationClasses) && transitionClasses.destinationClasses.length > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transition Configuration</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-3 ">
          {/* Source Term and Class */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Source (From)</h3>
              <Badge variant="outline">Current Location</Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-term" className="text-sm font-medium">
                Source Term
              </Label>
              <Select value={form.fromTermId} onValueChange={onFromTermChange} disabled={isLoadingOptions}>
                <SelectTrigger id="from-term">
                  {isLoadingOptions ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select source term" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {transitionOptions?.sessions?.length > 0 ? (
                    transitionOptions.sessions.map((session: any) =>
                      (session?.terms || []).map((term: any) => (
                        <SelectItem key={term?.id} value={term?.id || ""}>
                          {getTermDisplayName(term)}
                        </SelectItem>
                      )),
                    )
                  ) : (
                    <SelectItem value="none" disabled>
                      No terms available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="from-class" className="text-sm font-medium">
                Source Class
              </Label>
              <Select
                value={form.fromClassTermId}
                onValueChange={onFromClassChange}
                disabled={!form.fromTermId || isLoadingClasses}
              >
                <SelectTrigger id="from-class">
                  {isLoadingClasses ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select source class" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {hasSourceClasses ? (
                    transitionClasses.sourceClasses.map((classTerm: any) => (
                      <SelectItem key={classTerm.id} value={classTerm.id}>
                        {classTerm.class.name} ({classTerm.class.level}) - {classTerm._count.students} students
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {form.fromTermId ? "No classes available for this term" : "Select a term first"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {form.fromTermId && !hasSourceClasses && !isLoadingClasses && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No classes found for this term. You need to create ClassTerm records first.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <ArrowRight className="h-8 w-8 text-muted-foreground" />
          </div>

          {/* Destination Term and Class */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Destination (To)</h3>
              <Badge variant="outline">New Location</Badge>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-term" className="text-sm font-medium">
                Destination Term
              </Label>
              <Select value={form.toTermId} onValueChange={onToTermChange} disabled={isLoadingOptions}>
                <SelectTrigger id="to-term">
                  {isLoadingOptions ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select destination term" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {transitionOptions?.sessions?.length > 0 ? (
                    transitionOptions.sessions.map((session: any) =>
                      (session?.terms || []).map((term: any) => (
                        <SelectItem key={term?.id} value={term?.id || ""}>
                          {getTermDisplayName(term)}
                        </SelectItem>
                      )),
                    )
                  ) : (
                    <SelectItem value="none" disabled>
                      No terms available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="to-class" className="text-sm font-medium">
                Destination Class
              </Label>
              <Select
                value={form.toClassTermId}
                onValueChange={onToClassChange}
                disabled={!form.toTermId || isLoadingClasses}
              >
                <SelectTrigger id="to-class">
                  {isLoadingClasses ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Select destination class" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {hasDestinationClasses ? (
                    transitionClasses.destinationClasses.map((classTerm: any) => (
                      <SelectItem key={classTerm.id} value={classTerm.id}>
                        {classTerm.class.name} ({classTerm.class.level}) - {classTerm._count.students} students
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {form.toTermId ? "No classes available for this term" : "Select a term first"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {form.toTermId && !hasDestinationClasses && !isLoadingClasses && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No classes found for this term. You need to create ClassTerm records first.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
})