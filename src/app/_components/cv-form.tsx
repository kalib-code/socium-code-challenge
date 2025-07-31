"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";

interface CVFormData {
  fullName: string;
  email: string;
  phone: string;
  skills: string;
  experience: string;
  cvFile: File | null;
}

interface ValidationResults {
  fields: Array<{
    field: string;
    status: string;
    confidence: number;
    reason: string;
    extractedValue?: string;
  }>;
  summary: {
    totalChecked: number;
    matchCount: number;
    partialMatchCount: number;
    noMatchCount: number;
    overallConfidence: number;
  };
}

export function CVForm() {
  const [formData, setFormData] = useState<CVFormData>({
    fullName: "",
    email: "",
    phone: "",
    skills: "",
    experience: "",
    cvFile: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [cvId, setCvId] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResults | null>(null);
  const uploadCV = api.cv.upload.useMutation({
    onSuccess: (result) => {
      setErrorMessage("");
      setUploadProgress(100);
      setCvId(result.id);
      setValidationStatus("pending");
      setTimeout(() => {
        setUploadProgress(0);
      }, 500);
    },
    onError: (error) => {
      console.error("Error submitting CV:", error);
      setErrorMessage(error.message || "Error submitting CV. Please try again.");
      setUploadProgress(0);
    },
  });

  // Query for validation status
  const { data: validationData } = api.cv.getValidationStatus.useQuery(
    { id: cvId! },
    { 
      enabled: !!cvId,
      refetchInterval: (query) => {
        const status = query.state.data?.validationStatus;
        // Poll every 3 seconds if status is pending or validating
        return status === "pending" || status === "validating" ? 3000 : false;
      },
    }
  );

  // Update validation status when data changes
  useEffect(() => {
    if (validationData) {
      setValidationStatus(validationData.validationStatus);
      // Type-safe handling of validation results
      if (validationData.validationResults && typeof validationData.validationResults === 'object') {
        setValidationResults(validationData.validationResults as unknown as ValidationResults);
      }
    }
  }, [validationData]);

  const resetForm = () => {
    setFormData({
      fullName: "",
      email: "",
      phone: "",
      skills: "",
      experience: "",
      cvFile: null,
    });
    setCvId(null);
    setValidationStatus(null);
    setValidationResults(null);
    setErrorMessage("");
    setUploadProgress(0);
    // Reset file input
    const fileInput = document.getElementById("cvFile") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setErrorMessage("");
    
    if (!file) return;
    
    // Validate file type
    if (file.type !== "application/pdf") {
      setErrorMessage("Please select a PDF file");
      e.target.value = "";
      return;
    }
    
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      setErrorMessage("File too large. Maximum size is 10MB");
      e.target.value = "";
      return;
    }
    
    setFormData((prev) => ({
      ...prev,
      cvFile: file,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    
    if (!formData.cvFile) {
      setErrorMessage("Please select a CV file");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(10);

    try {
      // Simulate progress
      setUploadProgress(30);
      
      // Convert file to base64
      const fileBuffer = await formData.cvFile.arrayBuffer();
      setUploadProgress(50);
      
      const base64String = btoa(
        new Uint8Array(fileBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );
      
      setUploadProgress(70);

      await uploadCV.mutateAsync({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        skills: formData.skills,
        experience: formData.experience,
        fileName: formData.cvFile.name,
        fileContent: base64String,
      });
    } catch (error) {
      console.error("Error submitting CV:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl rounded-xl bg-white/10 p-8 backdrop-blur-sm">
      <h2 className="mb-6 text-3xl font-bold text-white">Submit Your CV</h2>
      
      {errorMessage && (
        <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500 p-3 text-red-200">
          {errorMessage}
        </div>
      )}
      
      {isSubmitting && uploadProgress > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-white">Uploading...</span>
            <span className="text-sm text-white">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Validation Status */}
      {validationStatus && (
        <div className="mb-4">
          {validationStatus === "pending" && (
            <div className="rounded-lg bg-blue-500/20 border border-blue-500 p-3 text-blue-200">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-200"></div>
                <span>AI validation is starting...</span>
              </div>
            </div>
          )}
          
          {validationStatus === "validating" && (
            <div className="rounded-lg bg-yellow-500/20 border border-yellow-500 p-3 text-yellow-200">
              <div className="flex items-center gap-2">
                <div className="animate-pulse rounded-full h-4 w-4 bg-yellow-200"></div>
                <span>AI is validating your CV data...</span>
              </div>
            </div>
          )}
          
          {validationStatus === "validated" && (
            <div className="rounded-lg bg-green-500/20 border border-green-500 p-3 text-green-200">
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-5 w-5 text-green-200" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Validation Successful!</span>
                </div>
                <p className="text-sm">Your form data matches the information in your CV.</p>
                {validationResults?.summary && (
                  <div className="mt-2 text-xs">
                    <span>Confidence: {Math.round(validationResults.summary.overallConfidence * 100)}%</span>
                    <span className="ml-3">Matches: {validationResults.summary.matchCount}/{validationResults.summary.totalChecked}</span>
                  </div>
                )}
                <button 
                  onClick={resetForm}
                  className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
                >
                  Submit Another CV
                </button>
              </div>
            </div>
          )}
          
          {validationStatus === "failed" && (
            <div className="rounded-lg bg-red-500/20 border border-red-500 p-3 text-red-200">
              <div className="mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-5 w-5 text-red-200" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 001.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Validation Failed</span>
                </div>
                <p className="text-sm mb-2">The information in your form doesn&apos;t match your CV:</p>
                <ul className="text-sm space-y-1 ml-4">
                  {validationData?.validationErrors?.map((error, index) => (
                    <li key={index} className="list-disc">{error}</li>
                  ))}
                </ul>
                <button 
                  onClick={resetForm}
                  className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className={`space-y-6 ${validationStatus && validationStatus !== "failed" ? "opacity-50 pointer-events-none" : ""}`}>
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-white mb-2">
            Full Name *
          </label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={formData.fullName}
            onChange={handleInputChange}
            required
            className="w-full rounded-lg bg-white/20 px-4 py-3 text-white placeholder-white/70 backdrop-blur-sm focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter your full name"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
            Email Address *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            className="w-full rounded-lg bg-white/20 px-4 py-3 text-white placeholder-white/70 backdrop-blur-sm focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter your email address"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-white mb-2">
            Phone Number
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            className="w-full rounded-lg bg-white/20 px-4 py-3 text-white placeholder-white/70 backdrop-blur-sm focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Enter your phone number"
          />
        </div>

        <div>
          <label htmlFor="skills" className="block text-sm font-medium text-white mb-2">
            Skills
          </label>
          <textarea
            id="skills"
            name="skills"
            value={formData.skills}
            onChange={handleInputChange}
            rows={3}
            className="w-full rounded-lg bg-white/20 px-4 py-3 text-white placeholder-white/70 backdrop-blur-sm focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            placeholder="List your key skills (e.g., JavaScript, React, Node.js)"
          />
        </div>

        <div>
          <label htmlFor="experience" className="block text-sm font-medium text-white mb-2">
            Experience
          </label>
          <textarea
            id="experience"
            name="experience"
            value={formData.experience}
            onChange={handleInputChange}
            rows={4}
            className="w-full rounded-lg bg-white/20 px-4 py-3 text-white placeholder-white/70 backdrop-blur-sm focus:bg-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            placeholder="Describe your work experience and achievements"
          />
        </div>

        <div>
          <label htmlFor="cvFile" className="block text-sm font-medium text-white mb-2">
            Upload CV (PDF) * <span className="text-xs text-white/70">(Max 10MB)</span>
          </label>
          <div className="relative">
            <input
              type="file"
              id="cvFile"
              accept=".pdf"
              onChange={handleFileChange}
              required
              className="w-full rounded-lg bg-white/20 px-4 py-3 text-white file:mr-4 file:rounded-md file:border-0 file:bg-purple-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          {formData.cvFile && (
            <div className="mt-2 text-sm text-green-300">
              <p>Selected: {formData.cvFile.name}</p>
              <p>Size: {(formData.cvFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? "Submitting..." : "Submit CV"}
        </button>
      </form>
    </div>
  );
}