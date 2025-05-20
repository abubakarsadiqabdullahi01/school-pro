"use client"

import type React from "react"

import { useState } from "react"
import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { Edit, Loader2, Plus, Star, Trash2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  createGradingSystem,
  updateGradingSystem,
  deleteGradingSystem,
  setDefaultGradingSystem,
  addGradeLevel,
  updateGradeLevel,
  deleteGradeLevel,
} from "@/app/actions/school-settings"

interface GradingSystemsManagerProps {
  schoolId: string
  gradingSystems: any[]
}

export function GradingSystemsManager({ schoolId, gradingSystems: initialGradingSystems }: GradingSystemsManagerProps) {
  const router = useRouter()
  const [gradingSystems, setGradingSystems] = useState(initialGradingSystems)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  const [isAddingGradeLevel, setIsAddingGradeLevel] = useState(false)
  const [isEditingGradeLevel, setIsEditingGradeLevel] = useState(false)
  const [isDeletingGradeLevel, setIsDeletingGradeLevel] = useState(false)
  const [selectedSystem, setSelectedSystem] = useState<any>(null)
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    passMark: "40",
  })
  const [gradeLevelFormData, setGradeLevelFormData] = useState({
    minScore: "",
    maxScore: "",
    grade: "",
    remark: "",
  })
  const [openDialogs, setOpenDialogs] = useState({
    create: false,
    edit: false,
    delete: false,
    setDefault: false,
    addGradeLevel: false,
    editGradeLevel: false,
    deleteGradeLevel: false,
  })

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // Handle grade level form input changes
  const handleGradeLevelInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setGradeLevelFormData((prev) => ({ ...prev, [name]: value }))
  }

  // Open create dialog
  const openCreateDialog = () => {
    setFormData({
      name: "",
      description: "",
      passMark: "40",
    })
    setOpenDialogs((prev) => ({ ...prev, create: true }))
  }

  // Open edit dialog
  const openEditDialog = (system: any) => {
    setSelectedSystem(system)
    setFormData({
      name: system.name,
      description: system.description || "",
      passMark: system.passMark.toString(),
    })
    setOpenDialogs((prev) => ({ ...prev, edit: true }))
  }

  // Open delete dialog
  const openDeleteDialog = (system: any) => {
    setSelectedSystem(system)
    setOpenDialogs((prev) => ({ ...prev, delete: true }))
  }

  // Open set default dialog
  const openSetDefaultDialog = (system: any) => {
    setSelectedSystem(system)
    setOpenDialogs((prev) => ({ ...prev, setDefault: true }))
  }

  // Open add grade level dialog
  const openAddGradeLevelDialog = (system: any) => {
    setSelectedSystem(system)
    setGradeLevelFormData({
      minScore: "",
      maxScore: "",
      grade: "",
      remark: "",
    })
    setOpenDialogs((prev) => ({ ...prev, addGradeLevel: true }))
  }

  // Open edit grade level dialog
  const openEditGradeLevelDialog = (system: any, gradeLevel: any) => {
    setSelectedSystem(system)
    setSelectedGradeLevel(gradeLevel)
    setGradeLevelFormData({
      minScore: gradeLevel.minScore.toString(),
      maxScore: gradeLevel.maxScore.toString(),
      grade: gradeLevel.grade,
      remark: gradeLevel.remark,
    })
    setOpenDialogs((prev) => ({ ...prev, editGradeLevel: true }))
  }

  // Open delete grade level dialog
  const openDeleteGradeLevelDialog = (system: any, gradeLevel: any) => {
    setSelectedSystem(system)
    setSelectedGradeLevel(gradeLevel)
    setOpenDialogs((prev) => ({ ...prev, deleteGradeLevel: true }))
  }

  // Close all dialogs
  const closeAllDialogs = () => {
    setOpenDialogs({
      create: false,
      edit: false,
      delete: false,
      setDefault: false,
      addGradeLevel: false,
      editGradeLevel: false,
      deleteGradeLevel: false,
    })
  }

  // Handle create grading system
  const handleCreateGradingSystem = async () => {
    setIsCreating(true)

    try {
      const result = await createGradingSystem({
        schoolId,
        name: formData.name,
        description: formData.description,
        passMark: Number.parseFloat(formData.passMark),
      })

      if (result.success) {
        toast.success("Grading system created successfully")
        setGradingSystems([...gradingSystems, result.data])
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to create grading system")
      }
    } catch (error) {
      console.error("Error creating grading system:", error)
      toast.error("Failed to create grading system", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsCreating(false)
    }
  }

  // Handle update grading system
  const handleUpdateGradingSystem = async () => {
    if (!selectedSystem) return

    setIsEditing(true)

    try {
      const result = await updateGradingSystem({
        id: selectedSystem.id,
        name: formData.name,
        description: formData.description,
        passMark: Number.parseFloat(formData.passMark),
      })

      if (result.success) {
        toast.success("Grading system updated successfully")
        const updatedSystems = gradingSystems.map((system) =>
          system.id === selectedSystem.id ? { ...system, ...result.data } : system,
        )
        setGradingSystems(updatedSystems)
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to update grading system")
      }
    } catch (error) {
      console.error("Error updating grading system:", error)
      toast.error("Failed to update grading system", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsEditing(false)
    }
  }

  // Handle delete grading system
  const handleDeleteGradingSystem = async () => {
    if (!selectedSystem) return

    setIsDeleting(true)

    try {
      const result = await deleteGradingSystem({
        id: selectedSystem.id,
      })

      if (result.success) {
        toast.success("Grading system deleted successfully")
        const updatedSystems = gradingSystems.filter((system) => system.id !== selectedSystem.id)
        setGradingSystems(updatedSystems)
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to delete grading system")
      }
    } catch (error) {
      console.error("Error deleting grading system:", error)
      toast.error("Failed to delete grading system", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle set default grading system
  const handleSetDefaultGradingSystem = async () => {
    if (!selectedSystem) return

    setIsSettingDefault(true)

    try {
      const result = await setDefaultGradingSystem({
        id: selectedSystem.id,
        schoolId,
      })

      if (result.success) {
        toast.success(`${selectedSystem.name} set as default grading system`)
        const updatedSystems = gradingSystems.map((system) => ({
          ...system,
          isDefault: system.id === selectedSystem.id,
        }))
        setGradingSystems(updatedSystems)
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to set default grading system")
      }
    } catch (error) {
      console.error("Error setting default grading system:", error)
      toast.error("Failed to set default grading system", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsSettingDefault(false)
    }
  }

  // Handle add grade level
  const handleAddGradeLevel = async () => {
    if (!selectedSystem) return

    setIsAddingGradeLevel(true)

    try {
      const result = await addGradeLevel({
        gradingSystemId: selectedSystem.id,
        minScore: Number.parseFloat(gradeLevelFormData.minScore),
        maxScore: Number.parseFloat(gradeLevelFormData.maxScore),
        grade: gradeLevelFormData.grade,
        remark: gradeLevelFormData.remark,
      })

      if (result.success) {
        toast.success("Grade level added successfully")
        const updatedSystems = gradingSystems.map((system) => {
          if (system.id === selectedSystem.id) {
            return {
              ...system,
              levels: [...system.levels, result.data].sort((a, b) => b.maxScore - a.maxScore),
            }
          }
          return system
        })
        setGradingSystems(updatedSystems)
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to add grade level")
      }
    } catch (error) {
      console.error("Error adding grade level:", error)
      toast.error("Failed to add grade level", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsAddingGradeLevel(false)
    }
  }

  // Handle update grade level
  const handleUpdateGradeLevel = async () => {
    if (!selectedSystem || !selectedGradeLevel) return

    setIsEditingGradeLevel(true)

    try {
      const result = await updateGradeLevel({
        id: selectedGradeLevel.id,
        minScore: Number.parseFloat(gradeLevelFormData.minScore),
        maxScore: Number.parseFloat(gradeLevelFormData.maxScore),
        grade: gradeLevelFormData.grade,
        remark: gradeLevelFormData.remark,
      })

      if (result.success) {
        toast.success("Grade level updated successfully")
        const updatedSystems = gradingSystems.map((system) => {
          if (system.id === selectedSystem.id) {
            const updatedLevels = system.levels.map((level: any) =>
              level.id === selectedGradeLevel.id ? result.data : level,
            )
            return {
              ...system,
              levels: updatedLevels.sort((a: any, b: any) => b.maxScore - a.maxScore),
            }
          }
          return system
        })
        setGradingSystems(updatedSystems)
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to update grade level")
      }
    } catch (error) {
      console.error("Error updating grade level:", error)
      toast.error("Failed to update grade level", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsEditingGradeLevel(false)
    }
  }

  // Handle delete grade level
  const handleDeleteGradeLevel = async () => {
    if (!selectedSystem || !selectedGradeLevel) return

    setIsDeletingGradeLevel(true)

    try {
      const result = await deleteGradeLevel({
        id: selectedGradeLevel.id,
      })

      if (result.success) {
        toast.success("Grade level deleted successfully")
        const updatedSystems = gradingSystems.map((system) => {
          if (system.id === selectedSystem.id) {
            return {
              ...system,
              levels: system.levels.filter((level: any) => level.id !== selectedGradeLevel.id),
            }
          }
          return system
        })
        setGradingSystems(updatedSystems)
        closeAllDialogs()
        router.refresh()
      } else {
        throw new Error(result.error || "Failed to delete grade level")
      }
    } catch (error) {
      console.error("Error deleting grade level:", error)
      toast.error("Failed to delete grade level", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setIsDeletingGradeLevel(false)
    }
  }

  // Validate if there are overlapping score ranges in grade levels
  const validateGradeLevels = (system: any) => {
    const levels = system.levels
    if (!levels || levels.length <= 1) return true

    // Sort levels by maxScore in descending order
    const sortedLevels = [...levels].sort((a, b) => b.maxScore - a.maxScore)

    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const currentLevel = sortedLevels[i]
      const nextLevel = sortedLevels[i + 1]

      // Check if the minScore of current level is less than or equal to maxScore of next level
      if (currentLevel.minScore <= nextLevel.maxScore) {
        return false
      }

      // Check if the minScore of current level is greater than maxScore of current level
      if (currentLevel.minScore > currentLevel.maxScore) {
        return false
      }
    }

    return true
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Available Grading Systems</h3>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Grading System
        </Button>
      </div>

      {gradingSystems.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Star className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">No Grading Systems</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              You haven't created any grading systems yet. Create your first grading system to start managing student
              grades.
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Create Grading System
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {gradingSystems.map((system) => (
            <Card key={system.id} className={system.isDefault ? "border-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center">
                      {system.name}
                      {system.isDefault && <Badge className="ml-2 bg-primary text-primary-foreground">Default</Badge>}
                    </CardTitle>
                    <CardDescription>{system.description || "No description provided"}</CardDescription>
                  </div>
                  <div className="flex space-x-1">
                    {!system.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openSetDefaultDialog(system)}
                        title="Set as Default"
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(system)}
                      title="Edit Grading System"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openDeleteDialog(system)}
                      title="Delete Grading System"
                      disabled={system.isDefault}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-muted-foreground">Pass Mark:</span>
                    <span className="font-medium">{system.passMark}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Grade Levels:</span>
                    <span className="font-medium">{system.levels.length}</span>
                  </div>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="grades">
                    <AccordionTrigger className="text-sm font-medium">View Grade Levels</AccordionTrigger>
                    <AccordionContent>
                      {!validateGradeLevels(system) && (
                        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md flex items-start">
                          <AlertTriangle className="h-4 w-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
                          <p className="text-xs text-amber-700">
                            Warning: There are overlapping score ranges in your grade levels. This may cause
                            inconsistent grading.
                          </p>
                        </div>
                      )}

                      {system.levels.length === 0 ? (
                        <div className="text-center py-2">
                          <p className="text-sm text-muted-foreground mb-2">No grade levels defined</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAddGradeLevelDialog(system)}
                            className="w-full"
                          >
                            <Plus className="mr-2 h-3 w-3" />
                            Add Grade Level
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid grid-cols-5 gap-2 text-xs font-medium text-muted-foreground px-2">
                            <div>Grade</div>
                            <div className="col-span-2">Score Range</div>
                            <div className="col-span-2">Remark</div>
                          </div>

                          {system.levels.map((level: any) => (
                            <div
                              key={level.id}
                              className="grid grid-cols-5 gap-2 text-sm p-2 rounded-md hover:bg-muted/50 relative group"
                            >
                              <div className="font-medium">{level.grade}</div>
                              <div className="col-span-2">
                                {level.minScore} - {level.maxScore}%
                              </div>
                              <div className="col-span-2 flex items-center justify-between">
                                <span>{level.remark}</span>
                                <div className="hidden group-hover:flex space-x-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => openEditGradeLevelDialog(system, level)}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => openDeleteGradeLevelDialog(system, level)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAddGradeLevelDialog(system)}
                            className="w-full mt-2"
                          >
                            <Plus className="mr-2 h-3 w-3" />
                            Add Grade Level
                          </Button>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Grading System Dialog */}
      <Dialog open={openDialogs.create} onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, create: open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Grading System</DialogTitle>
            <DialogDescription>Add a new grading system to manage student grades and assessments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">System Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., WAEC Standard, School Standard"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe this grading system..."
                value={formData.description}
                onChange={handleInputChange}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passMark">Pass Mark (%)</Label>
              <Input
                id="passMark"
                name="passMark"
                type="number"
                min="0"
                max="100"
                placeholder="40"
                value={formData.passMark}
                onChange={handleInputChange}
              />
              <p className="text-xs text-muted-foreground">Students must score at least this percentage to pass.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAllDialogs}>
              Cancel
            </Button>
            <Button onClick={handleCreateGradingSystem} disabled={isCreating || !formData.name || !formData.passMark}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Grading System"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Grading System Dialog */}
      <Dialog open={openDialogs.edit} onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, edit: open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Grading System</DialogTitle>
            <DialogDescription>Update the details of this grading system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">System Name</Label>
              <Input
                id="edit-name"
                name="name"
                placeholder="e.g., WAEC Standard, School Standard"
                value={formData.name}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (Optional)</Label>
              <Textarea
                id="edit-description"
                name="description"
                placeholder="Describe this grading system..."
                value={formData.description}
                onChange={handleInputChange}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-passMark">Pass Mark (%)</Label>
              <Input
                id="edit-passMark"
                name="passMark"
                type="number"
                min="0"
                max="100"
                placeholder="40"
                value={formData.passMark}
                onChange={handleInputChange}
              />
              <p className="text-xs text-muted-foreground">Students must score at least this percentage to pass.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAllDialogs}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGradingSystem} disabled={isEditing || !formData.name || !formData.passMark}>
              {isEditing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Grading System"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Grading System Dialog */}
      <AlertDialog
        open={openDialogs.delete}
        onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, delete: open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{selectedSystem?.name}" grading system and all its grade levels. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeAllDialogs}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGradingSystem}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Default Grading System Dialog */}
      <Dialog
        open={openDialogs.setDefault}
        onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, setDefault: open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set as Default Grading System</DialogTitle>
            <DialogDescription>
              Make "{selectedSystem?.name}" the default grading system for your school. This will be used for all
              assessments unless specified otherwise.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeAllDialogs}>
              Cancel
            </Button>
            <Button onClick={handleSetDefaultGradingSystem} disabled={isSettingDefault}>
              {isSettingDefault ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting Default...
                </>
              ) : (
                <>
                  <Star className="mr-2 h-4 w-4" />
                  Set as Default
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Grade Level Dialog */}
      <Dialog
        open={openDialogs.addGradeLevel}
        onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, addGradeLevel: open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Grade Level</DialogTitle>
            <DialogDescription>Add a new grade level to the "{selectedSystem?.name}" grading system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minScore">Minimum Score (%)</Label>
                <Input
                  id="minScore"
                  name="minScore"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="70"
                  value={gradeLevelFormData.minScore}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxScore">Maximum Score (%)</Label>
                <Input
                  id="maxScore"
                  name="maxScore"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="100"
                  value={gradeLevelFormData.maxScore}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grade">Grade</Label>
                <Input
                  id="grade"
                  name="grade"
                  placeholder="e.g., A1, B2"
                  value={gradeLevelFormData.grade}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remark">Remark</Label>
                <Input
                  id="remark"
                  name="remark"
                  placeholder="e.g., Excellent, Very Good"
                  value={gradeLevelFormData.remark}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAllDialogs}>
              Cancel
            </Button>
            <Button
              onClick={handleAddGradeLevel}
              disabled={
                isAddingGradeLevel ||
                !gradeLevelFormData.minScore ||
                !gradeLevelFormData.maxScore ||
                !gradeLevelFormData.grade ||
                !gradeLevelFormData.remark
              }
            >
              {isAddingGradeLevel ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Grade Level"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Grade Level Dialog */}
      <Dialog
        open={openDialogs.editGradeLevel}
        onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, editGradeLevel: open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Grade Level</DialogTitle>
            <DialogDescription>Update the grade level details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-minScore">Minimum Score (%)</Label>
                <Input
                  id="edit-minScore"
                  name="minScore"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="70"
                  value={gradeLevelFormData.minScore}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-maxScore">Maximum Score (%)</Label>
                <Input
                  id="edit-maxScore"
                  name="maxScore"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="100"
                  value={gradeLevelFormData.maxScore}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-grade">Grade</Label>
                <Input
                  id="edit-grade"
                  name="grade"
                  placeholder="e.g., A1, B2"
                  value={gradeLevelFormData.grade}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-remark">Remark</Label>
                <Input
                  id="edit-remark"
                  name="remark"
                  placeholder="e.g., Excellent, Very Good"
                  value={gradeLevelFormData.remark}
                  onChange={handleGradeLevelInputChange}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAllDialogs}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateGradeLevel}
              disabled={
                isEditingGradeLevel ||
                !gradeLevelFormData.minScore ||
                !gradeLevelFormData.maxScore ||
                !gradeLevelFormData.grade ||
                !gradeLevelFormData.remark
              }
            >
              {isEditingGradeLevel ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Grade Level"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Grade Level Dialog */}
      <AlertDialog
        open={openDialogs.deleteGradeLevel}
        onOpenChange={(open) => setOpenDialogs((prev) => ({ ...prev, deleteGradeLevel: open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the "{selectedGradeLevel?.grade}" grade level. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeAllDialogs}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGradeLevel}
              disabled={isDeletingGradeLevel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingGradeLevel ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
