"use client"

import { useState } from "react"
import { Settings, Database, Shield, Mail, Bell, Palette, Server, Key, FileText } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { motion } from "framer-motion"

export function SystemSettings() {
  const [isLoading, setIsLoading] = useState(false)

  const handleSaveSettings = async (section: string) => {
    setIsLoading(true)
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      toast.success("Success", { description: `${section} settings saved successfully` })
    } catch (error) {
      toast.error("Error", { description: "Failed to save settings" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
        <p className="text-muted-foreground">Configure system-wide settings and preferences</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>Basic system configuration and information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="system-name">System Name</Label>
                  <Input id="system-name" defaultValue="School Management System" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="system-version">Version</Label>
                  <Input id="system-version" defaultValue="1.0.0" disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system-description">System Description</Label>
                <Textarea
                  id="system-description"
                  placeholder="Enter system description"
                  defaultValue="Comprehensive school management system for educational institutions"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timezone">Default Timezone</Label>
                  <Select defaultValue="africa/lagos">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="africa/lagos">Africa/Lagos (WAT)</SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                      <SelectItem value="america/new_york">America/New_York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Default Currency</Label>
                  <Select defaultValue="ngn">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ngn">Nigerian Naira (₦)</SelectItem>
                      <SelectItem value="usd">US Dollar ($)</SelectItem>
                      <SelectItem value="eur">Euro (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="maintenance-mode" />
                <Label htmlFor="maintenance-mode">Maintenance Mode</Label>
              </div>

              <Button onClick={() => handleSaveSettings("General")} disabled={isLoading}>
                Save General Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>Configure security policies and authentication settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                  <Input id="session-timeout" type="number" defaultValue="30" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-login-attempts">Max Login Attempts</Label>
                  <Input id="max-login-attempts" type="number" defaultValue="5" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch id="two-factor" defaultChecked />
                  <Label htmlFor="two-factor">Enable Two-Factor Authentication</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="password-complexity" defaultChecked />
                  <Label htmlFor="password-complexity">Enforce Password Complexity</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="auto-logout" defaultChecked />
                  <Label htmlFor="auto-logout">Auto Logout on Inactivity</Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">API Security</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="api-rate-limit">API Rate Limit (requests/minute)</Label>
                    <Input id="api-rate-limit" type="number" defaultValue="100" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api-key-expiry">API Key Expiry (days)</Label>
                    <Input id="api-key-expiry" type="number" defaultValue="90" />
                  </div>
                </div>
              </div>

              <Button onClick={() => handleSaveSettings("Security")} disabled={isLoading}>
                Save Security Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Configuration
              </CardTitle>
              <CardDescription>Configure SMTP settings for system emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input id="smtp-host" placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">SMTP Port</Label>
                  <Input id="smtp-port" type="number" defaultValue="587" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smtp-username">SMTP Username</Label>
                  <Input id="smtp-username" type="email" placeholder="your-email@gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">SMTP Password</Label>
                  <Input id="smtp-password" type="password" placeholder="••••••••" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="from-email">From Email Address</Label>
                <Input id="from-email" type="email" placeholder="noreply@yourschool.com" />
              </div>

              <div className="flex items-center space-x-2">
                <Switch id="email-encryption" defaultChecked />
                <Label htmlFor="email-encryption">Use TLS Encryption</Label>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Email Templates</h4>
                <div className="space-y-2">
                  <Label htmlFor="welcome-template">Welcome Email Template</Label>
                  <Textarea id="welcome-template" placeholder="Welcome email template content..." rows={4} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => handleSaveSettings("Email")} disabled={isLoading}>
                  Save Email Settings
                </Button>
                <Button variant="outline">Test Email Configuration</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Settings */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>Configure system notifications and alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Email Notifications</h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Switch id="new-user-notification" defaultChecked />
                    <Label htmlFor="new-user-notification">New User Registration</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="payment-notification" defaultChecked />
                    <Label htmlFor="payment-notification">Payment Confirmations</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="assessment-notification" />
                    <Label htmlFor="assessment-notification">Assessment Results</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch id="system-alerts" defaultChecked />
                    <Label htmlFor="system-alerts">System Alerts</Label>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">SMS Notifications</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sms-provider">SMS Provider</Label>
                    <Select defaultValue="twilio">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="twilio">Twilio</SelectItem>
                        <SelectItem value="nexmo">Nexmo</SelectItem>
                        <SelectItem value="local">Local Provider</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sms-sender">SMS Sender ID</Label>
                    <Input id="sms-sender" placeholder="SCHOOL" />
                  </div>
                </div>
              </div>

              <Button onClick={() => handleSaveSettings("Notifications")} disabled={isLoading}>
                Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Appearance Settings
              </CardTitle>
              <CardDescription>Customize the look and feel of the system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="theme">Theme</Label>
                <Select defaultValue="system">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System Default</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logo-upload">System Logo</Label>
                <Input id="logo-upload" type="file" />
                <p className="text-sm text-muted-foreground">Upload a new logo for the system (PNG, JPG, SVG)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="favicon-upload">Favicon</Label>
                <Input id="favicon-upload" type="file" />
                <p className="text-sm text-muted-foreground">Upload a favicon for the browser tab (ICO, PNG)</p>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Custom CSS/JS</h4>
                <div className="space-y-2">
                  <Label htmlFor="custom-css">Custom CSS</Label>
                  <Textarea id="custom-css" placeholder="/* Add your custom CSS here */" rows={6} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custom-js">Custom JavaScript</Label>
                  <Textarea id="custom-js" placeholder="// Add your custom JavaScript here" rows={6} />
                </div>
              </div>

              <Button onClick={() => handleSaveSettings("Appearance")} disabled={isLoading}>
                Save Appearance Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Advanced Settings
              </CardTitle>
              <CardDescription>Advanced configurations for system administrators</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="debug-mode">Debug Mode</Label>
                <div className="flex items-center space-x-2">
                  <Switch id="debug-mode" />
                  <Label htmlFor="debug-mode">Enable detailed logging and error reporting</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-logging">API Request Logging</Label>
                <div className="flex items-center space-x-2">
                  <Switch id="api-logging" defaultChecked />
                  <Label htmlFor="api-logging">Log all incoming API requests</Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Data Management</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <Button variant="outline" className="flex items-center gap-2 bg-transparent">
                    <Database className="h-4 w-4" />
                    Backup Database
                  </Button>
                  <Button variant="outline" className="flex items-center gap-2 bg-transparent">
                    <FileText className="h-4 w-4" />
                    Generate System Report
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data-retention">Data Retention Policy (days)</Label>
                  <Input id="data-retention" type="number" defaultValue="365" />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Developer Options</h4>
                <div className="space-y-2">
                  <Label htmlFor="webhook-url">Webhook URL</Label>
                  <Input id="webhook-url" placeholder="https://your-webhook-endpoint.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api-keys">Manage API Keys</Label>
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <Key className="mr-2 h-4 w-4" />
                    View & Manage API Keys
                  </Button>
                </div>
              </div>

              <Button onClick={() => handleSaveSettings("Advanced")} disabled={isLoading}>
                Save Advanced Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  )
}
