"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

export function ClassTermSetupWizard({ terms, classes, onSetupComplete }: any) {
  const [selectedTerm, setSelectedTerm] = useState("")
  const [selectedClasses, setSelectedClasses] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleClassToggle = (classId: string) => {
    setSelectedClasses((current) => {
      if (current.includes(classId)) {
        return current.filter((id) => id !== classId)
      } else {
        return [...current, classId]
      }
    })
  }

  const handleSelectAll = () => {
    if (selectedClasses.length === classes.length) {
      setSelectedClasses([])
    } else {
      setSelectedClasses(classes.map((c: any) => c.id))
    }
  }

  const handleSubmit = async () => {
    if (!selectedTerm || selectedClasses.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select a term and at least one class",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      // Call your server action to create ClassTerm records
      // const result = await createClassTerms(selectedTerm, selectedClasses)

      // For now, we'll just simulate success
      await new Promise((resolve) => setTimeout(resolve, 1000))

      toast.success("Success", {
        description: `Created ${selectedClasses.length} class-term associations`,
      })

      if (onSetupComplete) {
        onSetupComplete()
      }
    } catch (error) {
      console.error("Error creating class terms:", error)
      toast.error("Error", {
        description: "Failed to create class-term associations",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class-Term Setup Wizard</CardTitle>
        <CardDescription>Create class-term associations to enable student transitions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="term">Select Term</Label>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
            <SelectTrigger id="term">
              <SelectValue placeholder="Select a term" />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term: any) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name} ({term.session.name})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Select Classes</Label>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedClasses.length === classes.length ? "Deselect All" : "Select All"}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {classes.map((cls: any) => (
              <div key={cls.id} className="flex items-center space-x-2 rounded-md border p-2">
                <Checkbox
                  id={`class-${cls.id}`}
                  checked={selectedClasses.includes(cls.id)}
                  onCheckedChange={() => handleClassToggle(cls.id)}
                />
                <Label htmlFor={`class-${cls.id}`} className="flex-1 cursor-pointer">
                  {cls.name} ({cls.level})
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleSubmit} disabled={isLoading || !selectedTerm || selectedClasses.length === 0}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Create Class-Term Associations
        </Button>
      </CardFooter>
    </Card>
  )
}
