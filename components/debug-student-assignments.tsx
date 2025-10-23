"use client"

import { useState, useEffect } from 'react'
import { 
  debugStudentAssignments, 
  getStudentAssignmentHistory, 
  fixDuplicateAssignments,
  removeAllStudentAssignmentsForTerm,
  getTermAssignmentsSummary
} from '@/app/actions/debug-student-assignments'

interface DebugResult {
  duplicateAssignments: any[]
  currentTermOverview: any[]
  assignmentAnalysis: any[]
  recentStudents: any[]
  summary: {
    totalStudentsWithDuplicates: number
    totalProblematicStudents: number
    recentStudentsAnalyzed: number
  }
}

export function DebugStudentAssignments() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DebugResult | null>(null)
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const [studentHistory, setStudentHistory] = useState<any>(null)
  const [termSummary, setTermSummary] = useState<any>(null)
  const [selectedTermId, setSelectedTermId] = useState('')
  const [showTermRemoval, setShowTermRemoval] = useState(false)

  const runDebug = async () => {
    setLoading(true)
    try {
      const response = await debugStudentAssignments()
      if (response.success) {
        setResult(response.data)
      } else {
        alert(`Error: ${response.error}`)
      }
    } catch (error) {
      alert(`Error running debug: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const viewStudentHistory = async (studentId: string) => {
    setLoading(true)
    try {
      const response = await getStudentAssignmentHistory(studentId)
      if (response.success) {
        setStudentHistory(response.data)
        setSelectedStudent(response.data.student)
      } else {
        alert(`Error: ${response.error}`)
      }
    } catch (error) {
      alert(`Error getting student history: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const fixDuplicates = async (studentId: string, termId: string) => {
    if (!confirm('Are you sure you want to remove duplicate assignments? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fixDuplicateAssignments(studentId, termId)
      if (response.success) {
        alert(`Fixed duplicates: ${JSON.stringify(response.data, null, 2)}`)
        await runDebug()
      } else {
        alert(`Error: ${response.error}`)
      }
    } catch (error) {
      alert(`Error fixing duplicates: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const loadTermSummary = async (termId: string) => {
    setLoading(true)
    try {
      const response = await getTermAssignmentsSummary(termId)
      if (response.success) {
        setTermSummary(response.data)
        setSelectedTermId(termId)
        setShowTermRemoval(true)
      } else {
        alert(`Error: ${response.error}`)
      }
    } catch (error) {
      alert(`Error loading term summary: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  const removeAllTermAssignments = async () => {
    if (!selectedTermId) return
    
    const confirmation = confirm(
      `⚠️ DANGER ZONE ⚠️\n\nThis will permanently remove ALL student assignments for term "${termSummary.summary.termName}"\n\n` +
      `• ${termSummary.summary.totalStudents} students will be unassigned\n` +
      `• ${termSummary.summary.totalAssessments} assessments will be deleted\n\n` +
      `This action cannot be undone! Type "DELETE" to confirm.`
    )

    if (!confirmation) return

    const userInput = prompt('Please type "DELETE" to confirm this destructive operation:')
    if (userInput !== 'DELETE') {
      alert('Operation cancelled. The confirmation text did not match.')
      return
    }

    setLoading(true)
    try {
      const response = await removeAllStudentAssignmentsForTerm(selectedTermId)
      if (response.success) {
        alert(`✅ ${response.message}\n\nRemoved: ${response.data.deletedAssignments} assignments\nAffected assessments: ${response.data.totalAssessments}`)
        setShowTermRemoval(false)
        setTermSummary(null)
        await runDebug() // Refresh the debug data
      } else {
        alert(`Error: ${response.error}`)
      }
    } catch (error) {
      alert(`Error removing assignments: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  // Load current term from debug results
  useEffect(() => {
    if (result?.currentTermOverview?.[0]) {
      const currentTerm = result.currentTermOverview[0]
      setSelectedTermId(currentTerm.termId)
    }
  }, [result])

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Student Assignments Debug</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTermRemoval(!showTermRemoval)}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            {showTermRemoval ? 'Hide Term Tools' : 'Show Term Tools'}
          </button>
          <button
            onClick={runDebug}
            disabled={loading}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {loading ? 'Running Debug...' : 'Run Debug Analysis'}
          </button>
        </div>
      </div>

      {/* Term Removal Section */}
      {showTermRemoval && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-orange-800 mb-4">Term Assignment Management</h2>
          
          {result?.currentTermOverview?.[0] && (
            <div className="mb-4 p-4 bg-white rounded border">
              <h3 className="font-bold mb-2">Current Term:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-medium">Session:</span>
                  <p>{result.currentTermOverview[0].sessionName}</p>
                </div>
                <div>
                  <span className="font-medium">Term:</span>
                  <p>{result.currentTermOverview[0].termName}</p>
                </div>
                <div>
                  <span className="font-medium">Students:</span>
                  <p>{result.currentTermOverview[0].totalStudents}</p>
                </div>
                <div>
                  <span className="font-medium">Assignments:</span>
                  <p>{result.currentTermOverview[0].totalAssignments}</p>
                </div>
              </div>
              <button
                onClick={() => loadTermSummary(result.currentTermOverview[0].termId)}
                className="mt-3 bg-orange-500 text-white px-3 py-1 rounded text-sm"
              >
                Load Detailed Summary
              </button>
            </div>
          )}

          {termSummary && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-bold text-red-800 mb-3">Term Summary - {termSummary.summary.termName}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white p-3 rounded border">
                  <span className="font-medium block">Total Students</span>
                  <span className="text-2xl font-bold">{termSummary.summary.totalStudents}</span>
                </div>
                <div className="bg-white p-3 rounded border">
                  <span className="font-medium block">Total Assignments</span>
                  <span className="text-2xl font-bold">{termSummary.summary.totalAssignments}</span>
                </div>
                <div className="bg-white p-3 rounded border">
                  <span className="font-medium block">Total Assessments</span>
                  <span className="text-2xl font-bold">{termSummary.summary.totalAssessments}</span>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-4">
                <h4 className="font-bold text-yellow-800 mb-2">Class Breakdown:</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {termSummary.classBreakdown.map((cls: any, index: number) => (
                    <div key={index} className="flex justify-between text-sm">
                      <span>{cls.className} ({cls.classLevel})</span>
                      <span>{cls.studentCount} students, {cls.assessmentCount} assessments</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={removeAllTermAssignments}
                disabled={loading}
                className="w-full bg-red-600 text-white py-3 px-4 rounded font-bold hover:bg-red-700 disabled:opacity-50"
              >
                🚨 REMOVE ALL ASSIGNMENTS FOR THIS TERM 🚨
              </button>
              <p className="text-xs text-red-600 mt-2 text-center">
                This will delete all student assignments and their assessments permanently
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rest of your existing component remains the same */}
            {result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-100 p-4 rounded border border-red-300">
              <h3 className="font-bold text-red-800">Students with Duplicates</h3>
              <p className="text-2xl">{result.summary.totalStudentsWithDuplicates}</p>
            </div>
            <div className="bg-yellow-100 p-4 rounded border border-yellow-300">
              <h3 className="font-bold text-yellow-800">Problematic Students</h3>
              <p className="text-2xl">{result.summary.totalProblematicStudents}</p>
            </div>
            <div className="bg-blue-100 p-4 rounded border border-blue-300">
              <h3 className="font-bold text-blue-800">Recent Students Analyzed</h3>
              <p className="text-2xl">{result.summary.recentStudentsAnalyzed}</p>
            </div>
          </div>

          {/* Duplicate Assignments */}
          {result.duplicateAssignments.length > 0 && (
            <div className="bg-white p-4 rounded shadow">
              <h2 className="text-xl font-bold mb-4 text-red-600">Duplicate Assignments Found</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="py-2 px-4 border">Student</th>
                      <th className="py-2 px-4 border">Admission No</th>
                      <th className="py-2 px-4 border">Term</th>
                      <th className="py-2 px-4 border">Class Count</th>
                      <th className="py-2 px-4 border">Classes</th>
                      <th className="py-2 px-4 border">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.duplicateAssignments.map((dup: any, index: number) => (
                      <tr key={index} className="border-t">
                        <td className="py-2 px-4 border">
                          {dup.firstName} {dup.lastName}
                        </td>
                        <td className="py-2 px-4 border">{dup.admissionNo}</td>
                        <td className="py-2 px-4 border">{dup.termName}</td>
                        <td className="py-2 px-4 border text-center">{dup.classCount}</td>
                        <td className="py-2 px-4 border">{dup.classNames}</td>
                        <td className="py-2 px-4 border">
                          <button
                            onClick={() => viewStudentHistory(dup.studentId)}
                            className="bg-green-500 text-white px-3 py-1 rounded text-sm mr-2"
                          >
                            View History
                          </button>
                          <button
                            onClick={() => fixDuplicates(dup.studentId, dup.termId)}
                            className="bg-red-500 text-white px-3 py-1 rounded text-sm"
                          >
                            Fix
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Students */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-bold mb-4">Recent Student Creations</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border">Admission No</th>
                    <th className="py-2 px-4 border">Name</th>
                    <th className="py-2 px-4 border">Created</th>
                    <th className="py-2 px-4 border">Class Terms</th>
                    <th className="py-2 px-4 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.recentStudents.map((student: any) => (
                    <tr key={student.id} className="border-t">
                      <td className="py-2 px-4 border">{student.admissionNo}</td>
                      <td className="py-2 px-4 border">{student.name}</td>
                      <td className="py-2 px-4 border">
                        {new Date(student.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-4 border">
                        {student.assignments.map((ass: any, idx: number) => (
                          <div key={idx} className="text-sm">
                            {ass.className} - {ass.termName}
                          </div>
                        ))}
                      </td>
                      <td className="py-2 px-4 border">
                        <button
                          onClick={() => viewStudentHistory(student.id)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                        >
                          Debug
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Student History Modal */}
      {studentHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded shadow-lg max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                Assignment History: {studentHistory.student.name} ({studentHistory.student.admissionNo})
              </h2>
              <button
                onClick={() => setStudentHistory(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            {studentHistory.termsWithDuplicates.length > 0 && (
              <div className="mb-6 p-4 bg-red-100 rounded border border-red-300">
                <h3 className="font-bold text-red-800 mb-2">Terms with Multiple Assignments:</h3>
                {studentHistory.termsWithDuplicates.map((term: any, index: number) => (
                  <div key={index} className="mb-3 p-3 bg-white rounded border">
                    <h4 className="font-bold">{term.sessionName} - {term.termName}</h4>
                    <div className="ml-4">
                      {term.assignments.map((ass: any, assIndex: number) => (
                        <div key={assIndex} className="flex justify-between items-center py-1">
                          <span>
                            {ass.className} (Assigned: {new Date(ass.assignedAt).toLocaleDateString()})
                          </span>
                          {assIndex > 0 && (
                            <button
                              onClick={() => fixDuplicates(studentHistory.student.id, term.termId)}
                              className="bg-red-500 text-white px-2 py-1 rounded text-xs"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3 className="font-bold mb-2">All Assignments by Term:</h3>
              {Object.entries(studentHistory.assignmentsByTerm).map(([termKey, termData]: [string, any]) => (
                <div key={termKey} className="mb-4 p-3 bg-gray-50 rounded border">
                  <h4 className="font-bold">
                    {termData.sessionName} - {termData.termName}
                    {termData.assignments.length > 1 && (
                      <span className="ml-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                        DUPLICATE ({termData.assignments.length} classes)
                      </span>
                    )}
                  </h4>
                  <div className="ml-4">
                    {termData.assignments.map((ass: any, index: number) => (
                      <div key={index} className="py-1">
                        {ass.className} - Assigned: {new Date(ass.assignedAt).toLocaleDateString()}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}