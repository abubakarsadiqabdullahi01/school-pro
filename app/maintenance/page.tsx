// app/maintenance/page.tsx
import { AlertCircle, Server, CloudOff, RefreshCw, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function MaintenancePage() {
  const handleRefresh = () => {
    window.location.reload()
  }

  const handleContactSupport = () => {
    window.location.href = "mailto:support@schoolpro.com?subject=System Maintenance Assistance"
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-blue-100 rounded-full opacity-75 animate-ping"></div>
              <div className="relative bg-blue-600 p-4 rounded-full">
                <Server className="h-8 w-8 text-white" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">System Maintenance</h1>
          <p className="text-gray-600">We're currently performing essential maintenance</p>
        </div>

        {/* Main Card */}
        <Card className="shadow-lg border-0">
          <CardHeader className="text-center pb-4">
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Temporary Service Interruption
            </CardTitle>
            <CardDescription>
              Our team is working diligently to restore full functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Status Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <CloudOff className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-blue-900">Service Status</p>
                <p className="text-xs text-blue-700">Temporarily Unavailable</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <AlertCircle className="h-6 w-6 text-amber-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-amber-900">Estimated Recovery</p>
                <p className="text-xs text-amber-700">Within 30 minutes</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Server className="h-6 w-6 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-900">Last Update</p>
                <p className="text-xs text-green-700">{new Date().toLocaleTimeString()}</p>
              </div>
            </div>

            {/* Alert Message */}
            <Alert variant="default" className="bg-slate-50 border-slate-200">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>What's Happening?</AlertTitle>
              <AlertDescription>
                We're performing critical system updates to improve performance and security. 
                This maintenance is essential to ensure the best experience for all users.
              </AlertDescription>
            </Alert>

            {/* Progress Indicator */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Maintenance Progress</span>
                <span>65%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-1000 ease-in-out" 
                  style={{ width: '65%' }}
                ></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button onClick={handleRefresh} className="flex-1 gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </Button>
              <Button onClick={handleContactSupport} variant="outline" className="flex-1 gap-2">
                <Mail className="h-4 w-4" />
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <div className="text-center text-sm text-gray-500 space-y-1">
          <p>Need immediate assistance? Call our support line at +1 (555) 123-HELP</p>
          <p>© {new Date().getFullYear()} SchoolPro. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}