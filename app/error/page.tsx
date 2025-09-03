// app/error/page.tsx
"use client"
import { AlertTriangle, Home, RefreshCw, Mail, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function ErrorPage() {
  const handleRefresh = () => {
    window.location.reload()
  }

  const handleGoHome = () => {
    window.location.href = "/"
  }

  const handleContactSupport = () => {
    window.location.href = "mailto:support@schoolpro.com?subject=System Error Assistance"
  }

  const handleViewStatus = () => {
    window.open("https://status.schoolpro.com", "_blank")
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-rose-100 rounded-full opacity-75 animate-ping"></div>
              <div className="relative bg-rose-600 p-4 rounded-full">
                <AlertTriangle className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Something Went Wrong</h1>
          <p className="text-gray-600">We encountered an unexpected error</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg border-0">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              System Error
            </CardTitle>
            <CardDescription>
              Our technical team has been notified and is investigating the issue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Error Information */}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Application Error</AlertTitle>
              <AlertDescription>
                The application failed to initialize properly. This could be due to a configuration
                issue or temporary service disruption.
              </AlertDescription>
            </Alert>

            {/* Troubleshooting Steps */}
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">Try these steps:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-900">Refresh the page</p>
                  <p className="text-xs text-blue-700">This might resolve temporary issues</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm font-medium text-amber-900">Clear browser cache</p>
                  <p className="text-xs text-amber-700">Remove outdated cached files</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm font-medium text-green-900">Check system status</p>
                  <p className="text-xs text-green-700">View current service status</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm font-medium text-purple-900">Contact support</p>
                  <p className="text-xs text-purple-700">Get help from our team</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
              <Button onClick={handleRefresh} size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={handleGoHome} size="sm" variant="outline" className="gap-2">
                <Home className="h-4 w-4" />
                Home
              </Button>
              <Button onClick={handleViewStatus} size="sm" variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Status
              </Button>
              <Button onClick={handleContactSupport} size="sm" variant="outline" className="gap-2">
                <Mail className="h-4 w-4" />
                Support
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details (Collapsible) */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Technical Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-100 p-3 rounded-lg font-mono text-xs overflow-x-auto">
              <pre>
{`Error: Environment configuration invalid
Time: ${new Date().toISOString()}
Component: Application Bootstrap
Missing Variables: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>Error Reference: ERR-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
          <p>© {new Date().getFullYear()} SchoolPro. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}