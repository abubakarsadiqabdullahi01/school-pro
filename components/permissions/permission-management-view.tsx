"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, UserCog, Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  assignPermissionProfile,
  createPermissionProfile,
  revokePermissionProfile,
} from "@/app/actions/permissions"
import type { PermissionKey } from "@/lib/permissions"

type PermissionManagementData = {
  permissionGroups: Array<{ name: string; permissions: PermissionKey[] }>
  permissionLabels: Record<PermissionKey, string>
  profiles: Array<{
    id: string
    name: string
    code: string
    description: string | null
    permissions: PermissionKey[]
    isSystem: boolean
    isActive: boolean
    activeAssignments: number
  }>
  users: Array<{
    id: string
    name: string
    role: string
    profiles: Array<{
      id: string
      name: string
      code: string
      permissions: PermissionKey[]
    }>
  }>
}

export function PermissionManagementView({ data }: { data: PermissionManagementData }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionKey[]>([])
  const [selectedUserId, setSelectedUserId] = useState(data.users[0]?.id ?? "")
  const [selectedProfileId, setSelectedProfileId] = useState("")
  const [isPending, startTransition] = useTransition()

  const activeProfiles = data.profiles.filter((profile) => profile.isActive)
  const selectedUser = data.users.find((user) => user.id === selectedUserId)
  const assignedProfileIds = new Set(selectedUser?.profiles.map((profile) => profile.id) ?? [])
  const assignableProfiles = activeProfiles.filter((profile) => !assignedProfileIds.has(profile.id))

  const effectivePermissionCount = useMemo(() => {
    const permissions = new Set<PermissionKey>()
    selectedUser?.profiles.forEach((profile) => {
      profile.permissions.forEach((permission) => permissions.add(permission))
    })
    return permissions.size
  }, [selectedUser])

  function togglePermission(permission: PermissionKey) {
    setSelectedPermissions((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    )
  }

  function handleCreateProfile() {
    startTransition(async () => {
      const result = await createPermissionProfile({
        name,
        code: code.trim().toUpperCase().replaceAll(" ", "_"),
        description,
        permissions: selectedPermissions,
      })

      if (!result.success) {
        toast.error("Profile not created", { description: result.error })
        return
      }

      toast.success("Permission profile created")
      setName("")
      setCode("")
      setDescription("")
      setSelectedPermissions([])
      router.refresh()
    })
  }

  function handleAssignProfile() {
    if (!selectedUserId || !selectedProfileId) return

    startTransition(async () => {
      const result = await assignPermissionProfile({
        userId: selectedUserId,
        profileId: selectedProfileId,
      })

      if (!result.success) {
        toast.error("Profile not assigned", { description: result.error })
        return
      }

      toast.success("Permission profile assigned")
      setSelectedProfileId("")
      router.refresh()
    })
  }

  function handleRevokeProfile(profileId: string) {
    if (!selectedUserId) return

    startTransition(async () => {
      const result = await revokePermissionProfile({ userId: selectedUserId, profileId })

      if (!result.success) {
        toast.error("Profile not revoked", { description: result.error })
        return
      }

      toast.success("Permission profile revoked")
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Permission Profiles
          </CardTitle>
          <CardDescription>Create reusable school roles from granular permissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Profile name</Label>
              <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-code">Code</Label>
              <Input
                id="profile-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="EXAMS_OFFICER"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-description">Description</Label>
            <Textarea
              id="profile-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.permissionGroups.map((group) => (
              <div key={group.name} className="rounded-md border p-4">
                <h3 className="text-sm font-semibold">{group.name}</h3>
                <div className="mt-3 space-y-3">
                  {group.permissions.map((permission) => (
                    <label key={permission} className="flex items-start gap-3 text-sm">
                      <Checkbox
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      <span className="grid gap-1">
                        <span>{data.permissionLabels[permission]}</span>
                        <span className="text-xs text-muted-foreground">{permission}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={handleCreateProfile}
            disabled={isPending || !name.trim() || !code.trim() || selectedPermissions.length === 0}
          >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create Profile
          </Button>

          <div className="rounded-md border">
            {data.profiles.map((profile) => (
              <div key={profile.id} className="border-b p-4 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{profile.name}</span>
                  <Badge variant={profile.isSystem ? "secondary" : "outline"}>{profile.code}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {profile.activeAssignments} active assignment{profile.activeAssignments === 1 ? "" : "s"}
                  </span>
                </div>
                {profile.description && <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.permissions.map((permission) => (
                    <Badge key={permission} variant="outline">
                      {data.permissionLabels[permission]}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            User Assignments
          </CardTitle>
          <CardDescription>Grant or revoke profiles without changing login roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>User</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {data.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUser && (
            <div className="rounded-md border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.role}</p>
                </div>
                <Badge variant="secondary">{effectivePermissionCount} profile permissions</Badge>
              </div>

              <div className="mt-4 space-y-2">
                {selectedUser.profiles.length ? (
                  selectedUser.profiles.map((profile) => (
                    <div key={profile.id} className="flex items-center justify-between gap-3 rounded-md bg-muted p-3">
                      <div>
                        <p className="text-sm font-medium">{profile.name}</p>
                        <p className="text-xs text-muted-foreground">{profile.code}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRevokeProfile(profile.id)} disabled={isPending}>
                        <X className="mr-2 h-4 w-4" />
                        Revoke
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No permission profiles assigned.</p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose profile to assign" />
              </SelectTrigger>
              <SelectContent>
                {assignableProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAssignProfile} disabled={isPending || !selectedUserId || !selectedProfileId}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Assign
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
