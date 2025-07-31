# 🚀 AI-Powered CV Validation System

An intelligent CV validation application built with the T3 Stack that uses AI vision models to automatically verify if form data matches the content of uploaded CV documents (PDFs and images).

## 🎯 Features

- **Smart CV Upload**: Secure file upload with validation (PDF and images, 10MB max)
- **AI Vision Validation**: Uses Google Gemini 2.0 Flash via OpenRouter to analyze CV documents
- **Real-time Updates**: Live status updates during validation process
- **File Storage**: Secure file storage using MinIO
- **Background Processing**: Asynchronous validation using Trigger.dev
- **Detailed Analysis**: Field-by-field comparison with confidence scores
- **Error Handling**: Robust fallback mechanisms for reliability

## 🏗️ Architecture

```
Frontend (Next.js) → tRPC API → MinIO Storage → Trigger.dev → OpenRouter/Gemini → Database
       ↓                ↓            ↓             ↓              ↓              ↓
   React Form      File Upload   Doc Storage   AI Vision Task  Document Analysis  Results
```

## 🛠️ Tech Stack

### Core Framework
- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[TypeScript](https://www.typescriptlang.org/)** - Type-safe development
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework

### Backend & API
- **[tRPC](https://trpc.io)** - End-to-end typesafe APIs
- **[Prisma](https://prisma.io)** - Database ORM with type safety
- **[PostgreSQL](https://postgresql.org)** - Primary database
- **[Zod](https://zod.dev)** - Schema validation

### File Storage & Processing
- **[MinIO](https://min.io)** - S3-compatible object storage for PDFs and images

### AI & Background Processing
- **[Google Gemini 2.0 Flash](https://ai.google.dev/)** - Vision model for document analysis
- **[OpenRouter](https://openrouter.ai)** - AI API gateway and routing
- **[Trigger.dev](https://trigger.dev)** - Background job processing

### Development & Deployment
- **[Docker](https://docker.com)** - Containerization for services
- **[ESLint](https://eslint.org)** & **[Prettier](https://prettier.io)** - Code quality tools

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Docker & Docker Compose
- OpenRouter API key
- Trigger.dev account

### 1. Clone & Install

```bash
git clone <repository-url>
cd socium-code
npm install
```

### 2. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

Update `.env` with your configuration:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/socium-code"

# MinIO Configuration
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_USE_SSL="false"
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"

# OpenRouter Configuration  
OPENAI_API_KEY="your-openrouter-api-key-here"

# Trigger.dev Configuration
TRIGGER_PROJECT_ID="your-trigger-project-id"
TRIGGER_SECRET_KEY="your-trigger-secret-key"
TRIGGER_API_URL="https://api.trigger.dev"
```

### 3. Start Services

Start PostgreSQL and MinIO:
```bash
docker-compose up -d
```

Run database migrations:
```bash
npx prisma migrate dev
```

### 4. Development

Start the development servers:

```bash
# Terminal 1: Next.js app
npm run dev

# Terminal 2: Trigger.dev background processing
npm run trigger:dev
```

Visit `http://localhost:3000` to see the application.

## 📖 How It Works

### 1. **CV Upload Flow**
- User fills out form with personal information
- Uploads CV document (PDF or image, validated for type, size, and format)
- File stored securely in MinIO object storage
- Database record created with "pending" validation status

### 2. **AI Vision Analysis Process**
- Background task triggered via Trigger.dev
- Document processed using Google Gemini 2.0 Flash vision model
- AI directly analyzes the visual content of CV documents
- Structured comparison with confidence scores generated

### 3. **Real-time Updates**
- Frontend polls for validation status updates
- Users see live progress: pending → validating → completed
- Detailed results displayed with field-by-field analysis

### 4. **Validation Results**
- ✅ **Match**: Form data matches document content
- ⚠️ **Partial Match**: Some similarities with minor differences  
- ❌ **No Match**: Significant discrepancies found
- 📄 **Not Found**: Information not present in document

## 🔧 Development Scripts

```bash
# Development
npm run dev              # Start Next.js dev server
npm run trigger:dev      # Start Trigger.dev development

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run database migrations
npm run db:studio        # Open Prisma Studio
npm run db:push          # Push schema changes

# Code Quality
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run typecheck        # Run TypeScript checks
npm run format:check     # Check Prettier formatting
npm run format:write     # Format code with Prettier

# Build & Deploy
npm run build            # Build for production
npm run start            # Start production server
npm run preview          # Build and preview
```

## 🐳 Docker Services

The application uses Docker Compose for local services:

- **PostgreSQL** (port 5432): Primary database
- **MinIO** (ports 9000, 9001): Object storage with web console

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Restart specific service
docker-compose restart minio
```

## 🔒 Security Features

- **File Validation**: Magic byte verification, size limits, type checking
- **Secure Storage**: MinIO with configurable access policies
- **Environment Variables**: Sensitive data stored in environment files
- **Error Handling**: Graceful degradation with detailed error messages
- **Input Sanitization**: Zod schema validation for all inputs

## 🎨 User Interface

- **Modern Design**: Clean, responsive interface with Tailwind CSS
- **Real-time Feedback**: Live validation status with progress indicators
- **Error States**: Clear error messages with actionable guidance
- **Success States**: Detailed validation results with confidence scores
- **Mobile Responsive**: Works seamlessly across all device sizes

## 🚀 Deployment

### Vercel (Recommended)
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy with automatic CI/CD

### Docker
```bash
# Build production image
docker build -t socium-cv-app .

# Run with environment file
docker run --env-file .env -p 3000:3000 socium-cv-app
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

- Check the [Troubleshooting Guide](#troubleshooting) below
- [T3 Stack Documentation](https://create.t3.gg/)
- [Trigger.dev Documentation](https://trigger.dev/docs)
- [MinIO Documentation](https://docs.min.io/)

## 🔧 Troubleshooting

### Common Issues

**MinIO Connection Errors**
```bash
# Restart MinIO service
docker-compose restart minio

# Check MinIO logs
docker-compose logs minio
```

**Trigger.dev Task Failures**
```bash
# Ensure dev server is running
npm run trigger:dev

# Check environment variables
echo $TRIGGER_SECRET_KEY
```

**Document Processing Errors**
- The system uses AI vision models for direct document analysis
- Check logs for specific processing errors
- Ensure documents are clear and readable (PDFs and images supported)

**Database Connection Issues**
```bash
# Check PostgreSQL status
docker-compose ps postgres

# Run migrations
npx prisma migrate dev
```

---

Built with ❤️ using the [T3 Stack](https://create.t3.gg/)
