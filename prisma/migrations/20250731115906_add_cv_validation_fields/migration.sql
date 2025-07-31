-- AlterTable
ALTER TABLE "public"."CV" ADD COLUMN     "validatedAt" TIMESTAMP(3),
ADD COLUMN     "validationErrors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "validationResults" JSONB,
ADD COLUMN     "validationStatus" TEXT NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "CV_validationStatus_idx" ON "public"."CV"("validationStatus");
