import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { minioClient } from "~/server/minio";
import { env } from "~/env";
import { tasks } from "@trigger.dev/sdk/v3";

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // %PDF

const validateFileContent = (base64Content: string, fileName: string) => {
  // Decode base64 to get file buffer
  const buffer = Buffer.from(base64Content, 'base64');
  
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }
  
  // Check if it's actually a PDF by magic bytes
  const magicBytes = Array.from(buffer.slice(0, 4));
  const isPDF = PDF_MAGIC_BYTES.every((byte, index) => magicBytes[index] === byte);
  
  if (!isPDF) {
    throw new Error('Invalid file format. Only PDF files are allowed.');
  }
  
  // Validate file extension
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error('Invalid file extension. Only .pdf files are allowed.');
  }
  
  return buffer;
};

export const cvRouter = createTRPCRouter({
  upload: publicProcedure
    .input(z.object({
      fullName: z.string().min(1, "Full name is required"),
      email: z.string().email("Valid email is required"),
      phone: z.string().optional(),
      skills: z.string().optional(),
      experience: z.string().optional(),
      fileName: z.string().min(1, "File name is required"),
      fileContent: z.string().min(1, "File content is required"), // base64 encoded file content
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        console.log('CV upload started for:', input.email);
        console.log('File name:', input.fileName);
        
        // Validate and convert file content
        const fileBuffer = validateFileContent(input.fileContent, input.fileName);
        console.log('File validation passed, buffer size:', fileBuffer.length);
        
        // Generate unique filename
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}-${input.fileName}`;
        
        // Upload to MinIO
        console.log('Uploading to MinIO:', uniqueFileName);
        await minioClient.putObject('cvs', uniqueFileName, fileBuffer, fileBuffer.length, {
          'Content-Type': 'application/pdf',
        });
        console.log('MinIO upload successful');
        
        // Generate URL for the uploaded file
        const protocol = env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
        const fileUrl = `${protocol}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/cvs/${uniqueFileName}`;
        
        // Save CV data to database (only URL, not file content)
        const cv = await ctx.db.cV.create({
          data: {
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            skills: input.skills,
            experience: input.experience,
            fileName: uniqueFileName,
            fileUrl: fileUrl,
          },
        });

        // Trigger AI validation task
        console.log('Triggering AI validation task', {
          cvId: cv.id,
          fileUrl: fileUrl,
          formDataKeys: Object.keys({
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            skills: input.skills,
            experience: input.experience,
          })
        });
        
        const payload = {
          cvId: cv.id,
          fileUrl: fileUrl,
          formData: {
            fullName: input.fullName,
            email: input.email,
            phone: input.phone,
            skills: input.skills,
            experience: input.experience,
          },
        };
        
        try {
          // Check if we're in development mode and Trigger.dev is available
          if (process.env.NODE_ENV === 'development') {
            console.log('Development mode: Attempting to trigger validation task');
          }
          
          const result = await tasks.trigger("validate-cv-data", payload);
          console.log('AI validation task triggered successfully', result);
        } catch (triggerError) {
          console.error('Failed to trigger validation task:', triggerError);
          
          // Check if it's a configuration issue
          if (triggerError instanceof Error && (
              triggerError.message.includes('TRIGGER_API_KEY') || 
              triggerError.message.includes('authentication') ||
              triggerError.message.includes('project'))) {
            // Trigger.dev configuration issue - validation will not run
          }
          
          // Don't fail the upload if validation trigger fails
        }

        return {
          success: true,
          id: cv.id,
          message: "CV uploaded successfully. AI validation is in progress.",
        };
      } catch (error) {
        console.error("Error uploading CV:", error);
        
        // Handle specific error types
        if (error instanceof Error) {
          // File validation errors
          if (error.message.includes('File too large') || 
              error.message.includes('Invalid file format') ||
              error.message.includes('Invalid file extension')) {
            throw error; // Re-throw validation errors as-is
          }
          
          // MinIO connection errors
          if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            throw new Error("Storage service is currently unavailable. Please try again later.");
          }
          
          // Database errors
          if (error.message.includes('Unique constraint')) {
            throw new Error("A CV with this email already exists.");
          }
        }
        
        // Generic error for unknown issues
        throw new Error("Failed to upload CV. Please try again.");
      }
    }),

  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.cV.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.cV.findUnique({
        where: { id: input.id },
      });
    }),

  getValidationStatus: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const cv = await ctx.db.cV.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          validationStatus: true,
          validationResults: true,
          validationErrors: true,
          validatedAt: true,
        },
      });

      if (!cv) {
        throw new Error("CV not found");
      }

      return cv;
    }),

  getAllWithValidation: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.cV.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        skills: true,
        experience: true,
        fileName: true,
        fileUrl: true,
        validationStatus: true,
        validationResults: true,
        validationErrors: true,
        validatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }),
});