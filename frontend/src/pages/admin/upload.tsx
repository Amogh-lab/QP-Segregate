import { useState, useCallback, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useDropzone } from 'react-dropzone'
import { useAuth } from '../../hooks/useAuth'
import { api } from '../../utils/api'
import ThemeToggle from '../../components/ThemeToggle'
import { 
  DocumentTextIcon, 
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface UploadState {
  step: 'upload' | 'metadata' | 'processing' | 'completed'
  uploadId?: string
  pageCount?: number
  fileSize?: number
  paperId?: number
  taskId?: string
  progress?: number
  status?: string
}

interface Course {
  course_code: string
  course_name: string
  credits: number
  course_type: string
  description?: string
}

export default function AdminUpload() {
  const { user } = useAuth()
  const router = useRouter()
  const [uploadState, setUploadState] = useState<UploadState>({ step: 'upload' })
  const [metadata, setMetadata] = useState({
    course_code: '',
    academic_year: '',
    semester_type: '',
    exam_type: '',
    exam_date: ''
  })
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [courses, setCourses] = useState<Course[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  
  // Read file type from query parameter, default to 'question_paper'
  const [fileType, setFileType] = useState<'question_paper' | 'syllabus'>('question_paper')

  // Update file type when query parameter changes (only after router is ready)
  useEffect(() => {
    if (!router.isReady) return
    if (router.query.type === 'syllabus') {
      setFileType('syllabus')
    } else if (router.query.type === 'question_paper') {
      setFileType('question_paper')
    }
  }, [router.isReady, router.query.type])

  useEffect(() => {
    if (!user) {
      router.push('/admin/login')
      return
    }
    fetchCourses()
  }, [user, router])

  const fetchCourses = async () => {
    try {
      const response = await api.get('/api/courses')
      setCourses(response.data)
    } catch (error) {
      console.error('Failed to fetch courses:', error)
      toast.error('Failed to load courses')
    } finally {
      setLoadingCourses(false)
    }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    const filename = file.name.toLowerCase()
    if (!filename.endsWith('.pdf') && !filename.endsWith('.docx') && !filename.endsWith('.doc')) {
      toast.error('Only PDF and DOCX files are allowed')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('file_type', fileType)

      console.log('Uploading file:', {
        filename: file.name,
        fileType: fileType,
        fileSize: file.size
      })

      // For FormData, axios should set Content-Type automatically (including boundary)
      // Don't manually set Content-Type, let the browser set it with the boundary
      const response = await api.post('/api/admin/upload-file', formData)

      const result = response.data
      setUploadState({
        step: 'metadata',
        uploadId: result.upload_id,
        pageCount: result.page_count,
        fileSize: result.file_size
      })
      toast.success(`${fileType === 'syllabus' ? 'Syllabus' : 'Question Paper'} uploaded successfully!`)
    } catch (error: any) {
      console.error('Upload error details:', {
        error,
        response: error.response,
        data: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        request: error.request
      })
      
      // Handle different error response formats
      let errorMessage = 'Upload failed. Please try again.'
      
      try {
        if (error.response?.data) {
          const data = error.response.data
          
          // FastAPI typically returns {detail: "message"} or {detail: [...]}
          if (data.detail !== undefined && data.detail !== null) {
            if (typeof data.detail === 'string') {
              // Handle empty string case
              if (data.detail.trim() !== '') {
                errorMessage = data.detail
              } else {
                // If detail is empty, try to get more info
                errorMessage = `Validation error (status ${error.response.status}). Please check the file format and try again.`
              }
            } else if (Array.isArray(data.detail)) {
              const messages = data.detail.map((err: any) => 
                typeof err === 'string' ? err : (err.msg || err.loc?.join('.') || JSON.stringify(err))
              ).filter((msg: string) => msg && msg.trim() !== '')
              errorMessage = messages.length > 0 ? messages.join(', ') : 'Validation error occurred'
            } else {
              errorMessage = String(data.detail) || 'Validation error occurred'
            }
          } else if (data.message) {
            errorMessage = String(data.message)
          } else if (typeof data === 'string') {
            errorMessage = data
          } else {
            // Try to extract any meaningful error message
            const errorStr = JSON.stringify(data)
            if (errorStr && errorStr !== '{}' && errorStr !== '{"detail":""}') {
              errorMessage = `Error: ${errorStr}`
            }
          }
        } else if (error.message) {
          errorMessage = String(error.message)
        } else if (error.response?.status) {
          errorMessage = `Request failed with status ${error.response.status}. Please check the backend logs for details.`
        } else if (error.request) {
          errorMessage = 'Network error: Could not reach server. Please check your connection.'
        }
      } catch (parseError) {
        console.error('Error parsing error message:', parseError)
        errorMessage = `Upload failed: ${String(error)}`
      }
      
      // Ensure we always have a non-empty message
      if (!errorMessage || errorMessage.trim() === '') {
        errorMessage = `Upload failed with status ${error.response?.status || 'unknown'}. Please check the backend terminal for error details.`
      }
      
      console.log('Displaying error message:', errorMessage)
      toast.error(errorMessage, {
        duration: 5000,
        style: {
          maxWidth: '500px',
        },
      })
    } finally {
      setUploading(false)
    }
  }, [fileType])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc']
    },
    multiple: false,
    disabled: uploadState.step !== 'upload'
  })

  const handleMetadataSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate required fields based on file type
    if (fileType === 'question_paper' && !metadata.exam_type) {
      toast.error('Exam type is required for question papers')
      return
    }
    
    setProcessing(true)

    try {
      const payload: any = {
        upload_id: uploadState.uploadId,
        file_type: fileType,
        ...metadata,
        exam_type: fileType === 'question_paper' ? metadata.exam_type : undefined
      }
      // Only include exam_date if it has a value
      if (!payload.exam_date || payload.exam_date.trim() === '') {
        payload.exam_date = null
      }
      
      // Show processing state immediately
      setUploadState({
        ...uploadState,
        step: 'processing',
        progress: 0
      })
      
      toast.loading(fileType === 'question_paper' ? 'Processing question paper...' : 'Uploading syllabus...', { id: 'processing' })
      
      const response = await api.post('/api/admin/submit-metadata', payload)

      const result = response.data
      
      if (fileType === 'question_paper') {
        // Processing is now synchronous, so check final status
        try {
          const statusResponse = await api.get(`/api/admin/processing-status/${result.paper_id}`)
          const status = statusResponse.data
          
          if (status.status === 'COMPLETED') {
            setUploadState({
              ...uploadState,
              step: 'completed',
              paperId: result.paper_id,
              progress: 100
            })
            toast.success('Processing completed!', { id: 'processing' })
          } else if (status.status === 'FAILED') {
            setUploadState({
              ...uploadState,
              step: 'processing',
              paperId: result.paper_id,
              progress: 0
            })
            toast.error('Processing failed', { id: 'processing' })
          } else {
            // If still processing, start polling (fallback)
            setUploadState({
              ...uploadState,
              step: 'processing',
              paperId: result.paper_id,
              taskId: result.task_id
            })
            pollProcessingStatus(result.paper_id)
          }
        } catch (statusError) {
          // If we can't get status, assume it completed
          setUploadState({
            ...uploadState,
            step: 'completed',
            paperId: result.paper_id
          })
          toast.success('Question paper uploaded and processed!', { id: 'processing' })
        }
      } else {
        // Syllabus is always completed immediately
        setUploadState({
          ...uploadState,
          step: 'completed',
          paperId: result.paper_id
        })
        toast.success('Syllabus uploaded successfully!', { id: 'processing' })
      }
    } catch (error) {
      toast.error('Failed to submit metadata')
    } finally {
      setProcessing(false)
    }
  }

  const pollProcessingStatus = async (paperId: number) => {
    let pollCount = 0
    const maxPolls = 300 // Maximum 10 minutes (300 * 2 seconds)
    let consecutiveErrors = 0
    const maxConsecutiveErrors = 10
    
    const pollInterval = setInterval(async () => {
      pollCount++
      
      // Timeout after max polls
      if (pollCount > maxPolls) {
        clearInterval(pollInterval)
        toast.error('Processing is taking longer than expected. Please check the processing status manually.')
        setUploadState(prev => ({ ...prev, step: 'completed' }))
        return
      }
      
      try {
        const response = await api.get(`/api/admin/processing-status/${paperId}`)
        const status = response.data
        consecutiveErrors = 0 // Reset error count on success
        
        setUploadState(prev => ({
          ...prev,
          progress: status.progress,
          status: status.status
        }))

        if (status.status === 'COMPLETED') {
          setUploadState(prev => ({ ...prev, step: 'completed' }))
          clearInterval(pollInterval)
          toast.success('Processing completed!')
        } else if (status.status === 'FAILED') {
          clearInterval(pollInterval)
          toast.error('Processing failed')
        } else if (status.status === 'METADATA_PENDING' && pollCount > 10) {
          // If still in METADATA_PENDING after 20 seconds, Celery might not be running
          clearInterval(pollInterval)
          toast('File uploaded successfully. Note: Background processing may not be running. Please check Celery worker status.', { icon: 'ℹ️' })
          setUploadState(prev => ({ ...prev, step: 'completed' }))
        }
      } catch (error) {
        console.error('Failed to poll status:', error)
        consecutiveErrors++
        
        // Stop polling after too many consecutive errors
        if (consecutiveErrors >= maxConsecutiveErrors) {
          clearInterval(pollInterval)
          toast.error('Unable to check processing status. Please check manually.')
          setUploadState(prev => ({ ...prev, step: 'completed' }))
        }
      }
    }, 2000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setMetadata({
      ...metadata,
      [e.target.name]: e.target.value
    })
  }

  if (!user) {
    return null
  }

  return (
    <>
      <Head>
        <title>{fileType === 'syllabus' ? 'Upload Syllabus' : 'Upload Question Paper'} - QPaper AI</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <button
                  onClick={() => router.push('/admin/dashboard')}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-500 dark:hover:text-primary-300 mr-4 transition-colors"
                >
                  ← Back to Dashboard
                </button>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {fileType === 'syllabus' ? 'Upload Syllabus' : 'Upload Question Paper'}
                </h1>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Step 1: File Upload */}
          {uploadState.step === 'upload' && (
            <div className="card dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Step 1: Upload File</h2>
              
              {/* File Type Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  File Type
                </label>
                <div className="flex space-x-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="file_type"
                      value="question_paper"
                      checked={fileType === 'question_paper'}
                      onChange={(e) => setFileType(e.target.value as 'question_paper' | 'syllabus')}
                      className="mr-2 text-primary-600 dark:text-primary-400"
                    />
                    <span className="text-gray-900 dark:text-white">Question Paper</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="file_type"
                      value="syllabus"
                      checked={fileType === 'syllabus'}
                      onChange={(e) => setFileType(e.target.value as 'question_paper' | 'syllabus')}
                      className="mr-2 text-primary-600 dark:text-primary-400"
                    />
                    <span className="text-gray-900 dark:text-white">Syllabus</span>
                  </label>
                </div>
              </div>
              
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors duration-200 ${
                  isDragActive
                    ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
                } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input {...getInputProps()} />
                <CloudArrowUpIcon className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                {uploading ? (
                  <p className="text-gray-600 dark:text-gray-300">Uploading...</p>
                ) : isDragActive ? (
                  <p className="text-primary-600 dark:text-primary-400">Drop the PDF here...</p>
                ) : (
                  <div>
                    <p className="text-gray-600 dark:text-gray-300 mb-2">
                      Drag & drop a PDF or DOCX file here, or click to browse
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Supported formats: PDF, DOCX (OCR will be applied for image-based PDFs)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Metadata Form */}
          {uploadState.step === 'metadata' && (
            <div className="card dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center mb-6">
                <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-500 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Step 2: Paper Details</h2>
              </div>

              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center">
                  <DocumentTextIcon className="h-5 w-5 text-green-600 dark:text-green-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">File uploaded successfully</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {uploadState.pageCount} pages • {(uploadState.fileSize! / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleMetadataSubmit} className="space-y-6">
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="course_code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Course Code *
                    </label>
                    <select
                      id="course_code"
                      name="course_code"
                      required
                      className="input-field mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      value={metadata.course_code}
                      onChange={handleChange}
                      disabled={loadingCourses}
                    >
                      <option value="">{loadingCourses ? 'Loading courses...' : 'Select Course'}</option>
                      {courses.map((course) => (
                        <option key={course.course_code} value={course.course_code}>
                          {course.course_code} - {course.course_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="academic_year" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Academic Year *
                    </label>
                    <select
                      id="academic_year"
                      name="academic_year"
                      required
                      className="input-field mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      value={metadata.academic_year}
                      onChange={handleChange}
                    >
                      <option value="">Select Year</option>
                      <option value="1">1st Year</option>
                      <option value="2">2nd Year</option>
                      <option value="3">3rd Year</option>
                      <option value="4">4th Year</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="semester_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Semester *
                    </label>
                    <select
                      id="semester_type"
                      name="semester_type"
                      required
                      className="input-field mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      value={metadata.semester_type}
                      onChange={handleChange}
                    >
                      <option value="">Select Semester</option>
                      <option value="ODD">ODD</option>
                      <option value="EVEN">EVEN</option>
                    </select>
                  </div>

                  {fileType === 'question_paper' && (
                    <div>
                      <label htmlFor="exam_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Exam Type *
                      </label>
                      <select
                        id="exam_type"
                        name="exam_type"
                        required
                        className="input-field mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        value={metadata.exam_type}
                        onChange={handleChange}
                      >
                        <option value="">Select Exam Type</option>
                        <option value="CIE 1">CIE 1 (Continuous Internal Evaluation 1)</option>
                        <option value="CIE 2">CIE 2 (Continuous Internal Evaluation 2)</option>
                        <option value="Improvement CIE">Improvement CIE (Re-test for CIE)</option>
                        <option value="SEE">SEE (Semester End Examination)</option>
                      </select>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label htmlFor="exam_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Exam Date (Optional)
                    </label>
                    <input
                      type="date"
                      id="exam_date"
                      name="exam_date"
                      className="input-field mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      value={metadata.exam_date}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => setUploadState({ step: 'upload' })}
                    className="btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={processing}
                    className="btn-primary disabled:opacity-50"
                  >
                    {processing ? 'Processing...' : 'Submit & Process'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 3: Processing Status */}
          {uploadState.step === 'processing' && (
            <div className="card dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center mb-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 dark:border-primary-400 mr-2"></div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Processing Question Paper</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-500 mr-3" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">PDF Uploaded</span>
                </div>

                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-500 mr-3" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">OCR Extraction</span>
                </div>

                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600 dark:border-primary-400 mr-3"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-300">Classifying Questions...</span>
                </div>

                <div className="flex items-center">
                  <div className="h-5 w-5 border-2 border-gray-300 dark:border-gray-600 rounded mr-3"></div>
                  <span className="text-sm text-gray-600 dark:text-gray-300">Duplicate Detection Pending</span>
                </div>

                {uploadState.progress !== undefined && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-2">
                      <span>Progress</span>
                      <span>{Math.round(uploadState.progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadState.progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Completed */}
          {uploadState.step === 'completed' && (
            <div className="card dark:bg-gray-800 dark:border-gray-700">
              <div className="text-center">
                <CheckCircleIcon className="h-16 w-16 text-green-600 dark:text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Processing Completed!</h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  Your question paper has been successfully processed and added to the database.
                </p>
                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => router.push('/admin/dashboard')}
                    className="btn-primary"
                  >
                    Back to Dashboard
                  </button>
                  <button
                    onClick={() => setUploadState({ step: 'upload' })}
                    className="btn-secondary"
                  >
                    Upload Another Paper
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}

export async function getServerSideProps() {
  return { props: {} }
}
