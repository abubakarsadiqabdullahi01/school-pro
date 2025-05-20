"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { searchParents, createParent } from "@/app/actions/parent-management";

const parentFormSchema = z.object({
  firstName: z.string().min(2, { message: "First name must be at least 2 characters." }),
  lastName: z.string().min(2, { message: "Last name must be at least 2 characters." }),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  state: z.string().optional(),
  lga: z.string().optional(),
  address: z.string().optional(),
  occupation: z.string().optional(),
  createCredentials: z.boolean().default(false),
  credentialType: z.enum(["EMAIL", "PHONE"]).optional(),
  credentialValue: z.string().optional(),
  password: z.string().optional(),
});

type ParentFormValues = z.infer<typeof parentFormSchema>;

interface ParentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (parent: any) => void;
}

export function ParentSearchDialog({ open, onOpenChange, onSelect }: ParentSearchDialogProps) {
  const [parents, setParents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const form = useForm<ParentFormValues>({
    resolver: zodResolver(parentFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      gender: undefined,
      state: "",
      lga: "",
      address: "",
      occupation: "",
      createCredentials: false,
      credentialType: undefined,
      credentialValue: "",
      password: "",
    },
  });

  useEffect(() => {
    if (open) {
      fetchParents(searchQuery);
    }
  }, [open, searchQuery]);

  const fetchParents = async (query: string) => {
    setIsLoading(true);
    try {
      const result = await searchParents(query);
      if (result.success) {
        setParents(result.data || []);
      } else {
        toast.error("Failed to fetch parents", { description: result.error });
      }
    } catch (error) {
      toast.error("Error fetching parents");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSelect = (parent: any) => {
    onSelect(parent);
    onOpenChange(false);
    setSearchQuery("");
    setShowCreateForm(false);
    form.reset();
  };

  const onSubmit = async (data: ParentFormValues) => {
    try {
      const credentials = data.createCredentials && data.credentialType && data.credentialValue && data.password
        ? [{
            type: data.credentialType,
            value: data.credentialValue,
            passwordHash: data.password, // Pass raw password; hashing is handled in createParent
            isPrimary: true,
          }]
        : [];

      const result = await createParent({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || undefined,
        phone: data.phone || undefined,
        occupation: data.occupation || undefined,
        gender: data.gender || undefined,
        state: data.state || undefined,
        lga: data.lga || undefined,
        address: data.address || undefined,
        credentials: credentials.length > 0 ? credentials : undefined,
      });

      if (result.success) {
        toast.success("Parent created successfully");
        handleSelect({ ...result.data, id: `new-${result.data.id}`, credentials }); // Mark as new for UI
      } else {
        toast.error("Failed to create parent", { description: result.error });
      }
    } catch (error) {
      toast.error("Error creating parent", { description: "An unexpected error occurred." });
    }
  };

  

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setSearchQuery("");
        setShowCreateForm(false);
        form.reset();
      }
    }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{showCreateForm ? "Create New Parent" : "Search Parents"}</DialogTitle>
        </DialogHeader>
        {showCreateForm ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter first name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter last name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter phone" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter state" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lga"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LGA (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter LGA" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              <FormField
                control={form.control}
                name="occupation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Occupation (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter occupation" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="createCredentials"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <input type="checkbox" checked={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormLabel>Create Login Credentials</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.watch("createCredentials") && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="credentialType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credential Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="EMAIL">Email</SelectItem>
                            <SelectItem value="PHONE">Phone</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="credentialValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credential Value</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter email or phone" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Parent"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={handleSearch}
                className="flex-1"
              />
              <Button
                variant="outline"
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Create New
              </Button>
            </div>
            {isLoading ? (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : parents.length === 0 ? (
              <p className="text-center text-muted-foreground">No parents found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parents.map((parent) => (
                    <TableRow key={parent.id}>
                      <TableCell>{`${parent.firstName} ${parent.lastName}`}</TableCell>
                      <TableCell>{parent.email || "-"}</TableCell>
                      <TableCell>{parent.phone || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelect(parent)}
                        >
                          Select
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}