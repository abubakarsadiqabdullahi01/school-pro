"use client"

import { memo } from "react"
import { Save, RotateCcw, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ActionButtonsProps {
  hasChanges: boolean
  errorCount: number
  isSaving: boolean
  saveProgress: number
  onSave: () => void
  onReset: () => void
  canPublish?: boolean
  isPublished?: boolean
  onTogglePublish?: () => void
}

export const ActionButtons = memo(function ActionButtons({
  hasChanges,
  errorCount,
  isSaving,
  saveProgress,
  onSave,
  onReset,
  canPublish = false,
  isPublished = false,
  onTogglePublish,
}: ActionButtonsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <Alert variant="destructive" className="w-auto">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorCount} validation error{errorCount > 1 ? "s" : ""} found
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canPublish && onTogglePublish && (
            <Button
              onClick={onTogglePublish}
              disabled={isSaving || hasChanges}
              variant={isPublished ? "destructive" : "default"}
              className={isPublished ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}
            >
              {isPublished ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Unpublish Results
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Publish Results
                </>
              )}
            </Button>
          )}

          <Button onClick={onReset} disabled={isSaving || !hasChanges} variant="outline" className="border-gray-300">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Changes
          </Button>

          <Button
            onClick={onSave}
            disabled={isSaving || !hasChanges || errorCount > 0}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {isSaving && saveProgress > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Saving assessments...</span>
            <span>{saveProgress}%</span>
          </div>
          <Progress value={saveProgress} className="h-2" />
        </div>
      )}
    </div>
  )
})
