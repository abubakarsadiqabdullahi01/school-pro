"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, UserCog, Loader2, Plus, Search, X } from "lucide-react"
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

/** Login account types, written the way the office says them. */
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrator",
  TEACHER: "Teacher",
}

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
    jobTitle: string | null
    staffNo: string | null
    department: string | null
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
  const [staffQuery, setStaffQuery] = useState("")
  const [isPending, startTransition] = useTransition()

  // Search covers what people actually know about a colleague: their name, their
  // staff number off a payslip, their job title or their department.
  const visibleStaff = useMemo(() => {
    const query = staffQuery.trim().toLowerCase()
    if (!query) return data.users

    return data.users.filter((user) =>
      [user.name, user.staffNo, user.jobTitle, user.department, user.role]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query)),
    )
  }, [data.users, staffQuery])

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

          {/* Columns, not one long list. Twenty-odd permissions stacked two
              abreast pushed the Create button and the existing profiles below
              the fold, so building a role meant scrolling past everything you
              had already ticked. Each permission is one line now: the label is
              what an administrator reads, and the code sits beside it for
              anyone who needs it. */}
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {data.permissionGroups.map((group) => (
              <div key={group.name} className="rounded-md border p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.name}
                </h3>
                <div className="mt-2 space-y-1">
                  {group.permissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex cursor-pointer items-start gap-2.5 rounded px-1 py-1.5 text-sm hover:bg-muted/60"
                    >
                      <Checkbox
                        checked={selectedPermissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      {/* Wraps rather than truncates: a permission you cannot
                          read in full is one you cannot safely tick. */}
                      <span className="min-w-0 flex-1 leading-snug" title={permission}>
                        {data.permissionLabels[permission]}
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

          {/* Existing profiles side by side for the same reason: four of them
              stacked full width was most of the page. */}
          <div className="grid gap-3 xl:grid-cols-2">
            {data.profiles.map((profile) => (
              <div key={profile.id} className="rounded-md border p-4">
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

      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Staff Roles
          </CardTitle>
          <CardDescription>
            Grant or revoke profiles without changing anyone&apos;s login account type. Students and
            parents are not listed — profiles govern office duties only.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          {/* Who to configure */}
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="staff-search"
                value={staffQuery}
                onChange={(event) => setStaffQuery(event.target.value)}
                placeholder="Search name, staff no, role"
                className="pl-8"
                aria-label="Search staff"
              />
            </div>

            <div className="max-h-[22rem] overflow-y-auto rounded-md border">
              {visibleStaff.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {data.users.length === 0
                    ? "No staff accounts yet. Add teachers or administrators first."
                    : "No staff match that search."}
                </p>
              ) : (
                visibleStaff.map((user) => {
                  const isSelected = user.id === selectedUserId
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => setSelectedUserId(user.id)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center justify-between gap-3 border-b p-3 text-left transition-colors last:border-b-0 ${
                        isSelected ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {user.jobTitle ?? ROLE_LABELS[user.role] ?? user.role}
                          {user.staffNo ? ` · ${user.staffNo}` : ""}
                        </span>
                      </span>
                      {user.profiles.length > 0 && (
                        <Badge variant="secondary" className="shrink-0 tabular-nums">
                          {user.profiles.length}
                        </Badge>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {visibleStaff.length} of {data.users.length} staff
            </p>
          </div>

          {/* What they can do */}
          {selectedUser ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-lg font-semibold leading-tight">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedUser.jobTitle ?? ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                    {selectedUser.department ? ` · ${selectedUser.department}` : ""}
                  </p>
                </div>
                <Badge variant="secondary">
                  {effectivePermissionCount} permission{effectivePermissionCount === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Assigned profiles
                </Label>
                {selectedUser.profiles.length ? (
                  selectedUser.profiles.map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{profile.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile.permissions.length} permission
                          {profile.permissions.length === 1 ? "" : "s"} · {profile.code}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeProfile(profile.id)}
                        disabled={isPending}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Revoke
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No profiles yet — this person has only what their login role allows.
                  </p>
                )}
              </div>

              <div className="mt-auto space-y-2 border-t pt-4">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Add a profile
                </Label>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          assignableProfiles.length ? "Choose a profile" : "Every profile is assigned"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableProfiles.map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleAssignProfile}
                    disabled={isPending || !selectedUserId || !selectedProfileId}
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Assign
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a staff member to see and change what they can do.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
