import { PrismaClient } from "@prisma/client";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";

// Input schema for the validation task
const CVValidationPayload = z.object({
  cvId: z.string(),
  fileUrl: z.string(),
  formData: z.object({
    fullName: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    skills: z.string().optional(),
    experience: z.string().optional(),
  }),
});

type CVValidationPayload = z.infer<typeof CVValidationPayload>;

interface ValidationField {
  field: string;
  status: "match" | "partial_match" | "no_match" | "not_found";
  confidence: number;
  reason: string;
  extractedValue?: string;
}

interface AIValidationResponse {
  fields: ValidationField[];
}

interface ProcessedValidationResults {
  fields: ValidationField[];
  summary: {
    totalChecked: number;
    matchCount: number;
    partialMatchCount: number;
    noMatchCount: number;
    overallConfidence: number;
  };
}

export const validateCvDataTask = task({
  id: "validate-cv-data",
  maxDuration: 300, // 5 minutes max
  run: async (payload: CVValidationPayload) => {
    const prisma = new PrismaClient();

    try {
      logger.log("Starting CV validation", {
        receivedPayload: payload,
        cvId: payload.cvId,
        payloadKeys: Object.keys(payload || {})
      });

      // Validate payload
      const validatedPayload = CVValidationPayload.parse(payload);
      logger.log("Payload validated successfully", { cvId: validatedPayload.cvId });

      // Update status to validating
      await prisma.cV.update({
        where: { id: validatedPayload.cvId },
        data: { validationStatus: "validating" },
      });

      // Download and process PDF/document
      logger.log("Processing document", { fileUrl: validatedPayload.fileUrl });

      // Determine if this is a PDF or image based on URL
      const isPdf = validatedPayload.fileUrl.toLowerCase().includes('.pdf') || validatedPayload.fileUrl.toLowerCase().includes('pdf');
      
      let requestBody: any;

      if (isPdf) {
        // Handle PDF files - download and convert to base64
        logger.log("Processing PDF file", { fileUrl: validatedPayload.fileUrl });
        
        // Download PDF from MinIO
        const urlParts = validatedPayload.fileUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        
        let pdfBuffer: Buffer;
        
        try {
          // Try public URL first
          logger.log("Downloading PDF from URL", { url: validatedPayload.fileUrl });
          const response = await fetch(validatedPayload.fileUrl);
          
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            pdfBuffer = Buffer.from(arrayBuffer);
            logger.log("Downloaded PDF via public URL", { size: pdfBuffer.length });
          } else {
            throw new Error(`Public access failed: ${response.status} ${response.statusText}`);
          }
        } catch (publicError) {
          const errorMessage = publicError instanceof Error ? publicError.message : 'Unknown error';
          logger.log("Public access failed, trying authenticated MinIO access", { 
            error: errorMessage,
            fileName 
          });
          
          // Use authenticated MinIO client access
          const { Client } = await import('minio');
          const minioClient = new Client({
            endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
            port: parseInt(process.env.MINIO_PORT ?? '9000'),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ROOT_USER ?? 'minioadmin',
            secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin',
          });
          
          // Get object from MinIO directly
          const stream = await minioClient.getObject('cvs', fileName!);
          const chunks: Buffer[] = [];
          
          for await (const chunk of stream) {
            chunks.push(chunk as Buffer);
          }
          
          pdfBuffer = Buffer.concat(chunks);
          logger.log("Downloaded PDF via authenticated MinIO access", { size: pdfBuffer.length });
        }

        // Convert PDF to base64
        const base64PDF = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
        logger.log("Converted PDF to base64", { base64Length: base64PDF.length });

        requestBody = {
          model: 'google/gemini-2.0-flash-001',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: createDocumentValidationPrompt(validatedPayload.formData),
                },
                {
                  type: 'file',
                  file: {
                    filename: fileName || 'document.pdf',
                    file_data: base64PDF,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
        };
      } else {
        // Handle image files - use image_url format
        logger.log("Processing image file", { fileUrl: validatedPayload.fileUrl });
        
        requestBody = {
          model: 'google/gemini-2.0-flash-001',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: createDocumentValidationPrompt(validatedPayload.formData),
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: validatedPayload.fileUrl,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
        };
      }

      logger.log("Request body", { requestBody: JSON.stringify(requestBody, null, 2) });

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("OpenRouter API error", { 
          status: response.status, 
          statusText: response.statusText,
          error: errorText 
        });
        throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const completion = await response.json();

      const aiResponse = completion.choices[0]?.message?.content;

      if (!aiResponse) {
        throw new Error("No response from OpenAI");
      }

      logger.log("Received AI validation response", { rawResponse: aiResponse });

      // Clean and parse AI response - handle markdown code blocks
      let cleanedResponse = aiResponse.trim();
      
      // Remove markdown code blocks if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\s*/, '').replace(/\s*```$/, '');
      }
      
      logger.log("Cleaned AI response", { cleanedResponse });

      // Parse AI response
      const validationResults = JSON.parse(cleanedResponse) as AIValidationResponse;

      // Process results and determine overall status
      const { overallStatus, processedResults, errors } = processValidationResults(validationResults);

      // Update database with results
      await prisma.cV.update({
        where: { id: validatedPayload.cvId },
        data: {
          validationStatus: overallStatus,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          validationResults: JSON.parse(JSON.stringify(processedResults)),
          validationErrors: errors,
          validatedAt: new Date(),
        },
      });

      logger.log("CV validation completed", {
        cvId: validatedPayload.cvId,
        status: overallStatus,
        errorsCount: errors.length
      });

      return {
        success: true,
        cvId: validatedPayload.cvId,
        status: overallStatus,
        results: processedResults,
        errors: errors,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown validation error";
      logger.error("CV validation failed", { error: errorMessage, payload });

      // Try to get cvId from payload for error logging
      const cvId = payload?.cvId || "unknown";

      // Update database with failure (only if we have a valid cvId)
      if (payload?.cvId) {
        try {
          await prisma.cV.update({
            where: { id: payload.cvId },
            data: {
              validationStatus: "failed",
              validationErrors: [errorMessage],
              validatedAt: new Date(),
            },
          });
        } catch (updateError) {
          logger.error("Failed to update CV with error status", { updateError, cvId });
        }
      }

      throw error;
    } finally {
      await prisma.$disconnect();
    }
  },
});

function createDocumentValidationPrompt(formData: CVValidationPayload["formData"]): string {
  return `
Please analyze the CV/Resume document (PDF or image) and validate if the following form data matches what you can see in the document.

CRITICAL: Your response must be ONLY the JSON object. Do not include any markdown formatting, code blocks, or explanatory text. Just return the raw JSON.

FORM DATA TO VALIDATE:
- Full Name: "${formData.fullName}"
- Email: "${formData.email}"
- Phone: "${formData.phone ?? 'Not provided'}"
- Skills: "${formData.skills ?? 'Not provided'}"
- Experience: "${formData.experience ?? 'Not provided'}"

For each field, determine:
1. Does the form data match what's visible in the CV document?
2. How confident are you in this match (0.0 to 1.0)?
3. What specific value did you find in the CV document (if any)?
4. Why did you make this determination?

Return your analysis as a JSON object with this exact structure:
{
  "fields": [
    {
      "field": "fullName",
      "status": "match|partial_match|no_match|not_found",
      "confidence": 0.95,
      "reason": "Explanation of your reasoning",
      "extractedValue": "What you found in the CV document"
    },
    {
      "field": "email",
      "status": "match|partial_match|no_match|not_found",
      "confidence": 0.90,
      "reason": "Explanation of your reasoning",
      "extractedValue": "What you found in the CV document"
    },
    {
      "field": "phone",
      "status": "match|partial_match|no_match|not_found",
      "confidence": 0.85,
      "reason": "Explanation of your reasoning",
      "extractedValue": "What you found in the CV document"
    },
    {
      "field": "skills",
      "status": "match|partial_match|no_match|not_found",
      "confidence": 0.80,
      "reason": "Explanation of your reasoning",
      "extractedValue": "What you found in the CV document"
    },
    {
      "field": "experience",
      "status": "match|partial_match|no_match|not_found",
      "confidence": 0.75,
      "reason": "Explanation of your reasoning",
      "extractedValue": "What you found in the CV document"
    }
  ]
}

Status definitions:
- "match": Form data exactly or very closely matches what's visible in the CV
- "partial_match": Form data partially matches CV content but has differences
- "no_match": Form data contradicts what's visible in the CV
- "not_found": Could not find this information in the CV document

Be thorough but practical. Consider variations in formatting, abbreviations, and synonyms. Look carefully at all text visible in the CV document, whether it's a PDF or image format.
`;
}

function processValidationResults(aiResponse: AIValidationResponse): {
  overallStatus: string;
  processedResults: ProcessedValidationResults;
  errors: string[];
} {
  const errors: string[] = [];
  const fields = aiResponse.fields;

  let matchCount = 0;
  let partialMatchCount = 0;
  let noMatchCount = 0;
  let totalChecked = 0;

  for (const field of fields) {
    if (field.status === "match") {
      matchCount++;
    } else if (field.status === "partial_match") {
      partialMatchCount++;
    } else if (field.status === "no_match") {
      noMatchCount++;
      errors.push(`${field.field}: ${field.reason}`);
    }

    if (field.status !== "not_found") {
      totalChecked++;
    }
  }

  // Determine overall status
  let overallStatus: string;

  if (noMatchCount > 0) {
    overallStatus = "failed";
  } else if (matchCount === totalChecked && totalChecked > 0) {
    overallStatus = "validated";
  } else if (matchCount + partialMatchCount >= Math.ceil(totalChecked * 0.7)) {
    // At least 70% match or partial match
    overallStatus = "validated";
  } else {
    overallStatus = "failed";
    if (errors.length === 0) {
      errors.push("Insufficient matches found between form data and PDF content");
    }
  }

  return {
    overallStatus,
    processedResults: {
      fields,
      summary: {
        totalChecked,
        matchCount,
        partialMatchCount,
        noMatchCount,
        overallConfidence: fields.reduce((sum: number, f: ValidationField) => sum + (f.confidence ?? 0), 0) / Math.max(fields.length, 1),
      },
    },
    errors,
  };
}
