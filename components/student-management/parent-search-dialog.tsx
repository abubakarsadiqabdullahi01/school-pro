// components/student-management/parent-search-dialog.tsx
"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, User } from "lucide-react"
import type { Gender } from "@prisma/client"
import { searchParents, createParent } from "@/app/actions/student-management"
import { toast } from "sonner"

interface Parent {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  occupation: string
  gender?: string
  state?: string
  lga?: string
  address?: string
}

interface ParentSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (parent: Parent) => void
}

export function ParentSearchDialog({ open, onOpenChange, onSelect }: ParentSearchDialogProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Parent[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [activeTab, setActiveTab] = useState("search")

  // New parent form state (includes gender)
  const [newParent, setNewParent] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    occupation: "",
    gender: "",
  })

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setIsSearching(true)
    try {
      const result = await searchParents(searchQuery)
      if (result.success) {
        setSearchResults(result.data || [])
      } else {
        toast.error("Search Failed", {
          description: result.error || "Failed to search for parents"
        })
      }
    } catch (error) {
      console.error("Error searching parents:", error)
      toast.error("Search Failed", {
        description: "An error occurred while searching for parents"
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleCreateParent = async () => {
    if (!newParent.firstName || !newParent.lastName) {
      toast.error("Validation Error", {
        description: "First name and last name are required"
      })
      return
    }

    try {
  // Cast gender to Prisma Gender or undefined
  const payload = { ...newParent, gender: newParent.gender ? (newParent.gender as Gender) : undefined }
  const result = await createParent(payload)
      if (result.success) {
        toast.success("Parent Created", {
          description: `${newParent.firstName} ${newParent.lastName} has been created successfully`
        })
        
        // Pass the new parent data back to the form (include gender)
        onSelect({
          id: result.data?.id || "",
          firstName: result.data?.firstName || newParent.firstName,
          lastName: result.data?.lastName || newParent.lastName,
          email: result.data?.email || newParent.email || "",
          phone: result.data?.phone || newParent.phone || "",
          occupation: result.data?.occupation || newParent.occupation || "",
          gender: result.data?.gender || newParent.gender || "",
        })
        
        onOpenChange(false)
      } else {
        toast.error("Creation Failed", {
          description: result.error || "Failed to create parent"
        })
      }
    } catch (error) {
      console.error("Error creating parent:", error)
      toast.error("Creation Failed", {
        description: "An error occurred while creating the parent"
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Parent/Guardian Management</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">Search Existing</TabsTrigger>
            <TabsTrigger value="create">Create New</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {isSearching ? (
                <div className="text-center py-4">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  {searchQuery ? "No parents found" : "Enter a search term to find parents"}
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((parent) => (
                    <div
                      key={parent.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer"
                      onClick={() => onSelect(parent)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {parent.firstName} {parent.lastName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {parent.email && `${parent.email} • `}
                            {parent.phone}
                          </p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Select
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">First Name *</label>
                <Input
                  placeholder="First name"
                  value={newParent.firstName}
                  onChange={(e) => setNewParent({ ...newParent, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Last Name *</label>
                <Input
                  placeholder="Last name"
                  value={newParent.lastName}
                  onChange={(e) => setNewParent({ ...newParent, lastName: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={newParent.email}
                  onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  placeholder="Phone number"
                  value={newParent.phone}
                  onChange={(e) => setNewParent({ ...newParent, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Occupation</label>
              <Input
                placeholder="Occupation"
                value={newParent.occupation}
                onChange={(e) => setNewParent({ ...newParent, occupation: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Gender</label>
              <select
                className="w-full rounded-md border bg-transparent px-3 py-2"
                value={newParent.gender}
                onChange={(e) => setNewParent({ ...newParent, gender: e.target.value })}
              >
                <option value="">Select gender (optional)</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <Button onClick={handleCreateParent} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create Parent
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}