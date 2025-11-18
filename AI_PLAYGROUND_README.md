# 🤖 AI Playground - Self-Learning RAG System

## Overview

The AI Playground is an advanced **Retrieval Augmented Generation (RAG)** system built with **LangGraphJS** that provides intelligent tutoring and content generation for both teachers and students. The system features **self-learning capabilities** that improve over time through feedback loops and query refinement.

## 🌟 Key Features

### For Students
- **🔍 Research Assistant**: Perplexity-like research with source citations
- **🧮 Math Solver**: Step-by-step solutions with explanations
- **⚛️ Physics Solver**: Detailed physics problem solving with units
- **🧪 Chemistry Solver**: Chemical equations and reactions solver
- **📊 Content Generation**: Create slides and posters for projects
- **💡 Intelligent Hints**: Context-aware hints without giving away answers

### For Teachers
- **All Student Features** PLUS:
- **📝 Quiz Creator**: AI-generated quizzes from uploaded materials
- **📋 Exam Builder**: Comprehensive exam creation with answer keys
- **📚 Document Management**: Upload and manage teaching materials
- **📊 Analytics Dashboard**: Track usage and effectiveness
- **🎯 Custom Content**: Generate educational materials

## 🏗️ Architecture

### LangGraph RAG Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    LangGraph Workflow                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  START → Query Refinement → Document Retrieval →           │
│           ↓                                                 │
│          Answer Generation → Self-Evaluation →              │
│           ↓                      ↓                          │
│          END ←─────────────── Needs Refinement?            │
│                                 (Loop max 3x)               │
└─────────────────────────────────────────────────────────────┘
```

### Self-Learning Components

1. **Query Refinement**
   - Learns from historical successful queries
   - Automatically improves query formulation
   - Stores refinement patterns for reuse

2. **Self-Evaluation**
   - Evaluates answer quality (0.0-1.0 score)
   - Triggers refinement if score < 0.7
   - Detects hallucinations and inaccuracies

3. **Feedback Loop**
   - Collects user feedback (thumbs up/down)
   - Updates improvement scores
   - Trains refinement strategies

4. **Analytics Tracking**
   - Monitors performance metrics
   - Identifies popular queries
   - Tracks success rates

## 📁 Project Structure

```
src/lib/ai/
├── graphs/
│   └── rag-workflow.ts          # Main LangGraph workflow
├── agents/
│   └── (subject-specific agents)
├── tools/
│   └── (specialized tools)
└── utils/
    ├── vector-store.ts          # Vector embeddings & retrieval
    ├── query-refinement.ts      # Self-learning query optimization
    ├── answer-generation.ts     # LLM-based answer generation
    ├── self-evaluation.ts       # Answer quality evaluation
    ├── analytics.ts             # Usage analytics tracking
    └── document-processing.ts   # Document ingestion pipeline
```

## 🗄️ Database Schema

### Core Tables

**AIDocument** - Stores uploaded documents
- Supports PDF, DOCX, TXT, MD formats
- Subject and grade level classification
- Public/private visibility control

**AIDocumentChunk** - Vector-embedded document chunks
- Chunked for optimal retrieval (1000 chars, 200 overlap)
- JSON-stringified embeddings (text-embedding-3-small)
- Metadata for context

**AIConversation** - User conversation sessions
- Tracks mode (research, solver, creator)
- Links to messages and feedback
- Subject and grade level context

**AIMessage** - Individual messages
- Role: user, assistant, system, tool
- Retrieved documents context
- Confidence scores

**AIFeedback** - Self-learning feedback
- User ratings and corrections
- Improvement tracking
- Learning loop integration

**AIQueryRefinement** - Query optimization history
- Original → Refined query mappings
- Improvement scores
- Usage frequency tracking

**AIAnalytics** - Performance metrics
- Response times
- Token usage
- Success rates
- Subject/mode breakdown

**AIGeneratedContent** - Created content
- Quizzes, exams, slides, posters
- Links to conversation context
- Export formats (PDF, PPTX, PNG)

## 🚀 Getting Started

### 1. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Add your API keys:

```env
OPENAI_API_KEY=sk-your-key-here
DATABASE_URL=your-postgresql-url
```

### 2. Install Dependencies

```bash
npm install
```

Key dependencies:
- `@langchain/langgraph` - Graph-based workflow orchestration
- `@langchain/openai` - OpenAI integration
- `langchain` - Core LangChain functionality
- `pdf-parse` - PDF text extraction
- `mammoth` - DOCX text extraction

### 3. Database Migration

```bash
npx prisma migrate dev
```

This creates all AI Playground tables.

### 4. Seed Initial Data (Optional)

Upload sample documents to create the initial knowledge base.

## 📚 Usage Guide

### Document Ingestion

Teachers can upload educational materials:

```typescript
// Example: Upload and process a document
import { processDocument } from '@/lib/ai/utils/document-processing';

const result = await processDocument(
  fileBuffer,
  'application/pdf',
  cloudinaryUrl,
  {
    title: 'Algebra Fundamentals',
    subject: 'math',
    gradeLevel: 9,
    uploadedBy: userId,
    uploadedByRole: 'teacher',
    isPublic: true,
  }
);

// Result: { success: true, documentId: '...', chunksCreated: 45 }
```

### RAG Query Execution

Students and teachers can query the system:

```typescript
// Example: Execute RAG workflow
import { executeRAGWorkflow } from '@/lib/ai/graphs/rag-workflow';

const result = await executeRAGWorkflow(
  'Solve: 2x + 5 = 15',
  userId,
  'student',
  'math_solver',
  conversationId,
  {
    subject: 'math',
    gradeLevel: 9,
  }
);

// Result includes:
// - answer: Step-by-step solution
// - confidence: 0.0-1.0
// - sources: Referenced documents
// - metadata: Performance metrics
```

### Providing Feedback

Users can provide feedback to improve the system:

```typescript
// Example: Submit feedback
await prisma.aIFeedback.create({
  data: {
    conversationId,
    messageId,
    userId,
    feedbackType: 'thumbs_up',
    rating: 5,
    comment: 'Great explanation!',
  },
});

// Feedback is used to:
// 1. Update query refinement scores
// 2. Improve future responses
// 3. Train the self-learning system
```

## 🔧 Configuration

### RAG Parameters

Adjust in `rag-workflow.ts`:

```typescript
const TOP_K = 5;                    // Documents to retrieve
const CHUNK_SIZE = 1000;            // Characters per chunk
const CHUNK_OVERLAP = 200;          // Overlap between chunks
const MIN_EVALUATION_SCORE = 0.7;   // Quality threshold
const MAX_REFINEMENT_ATTEMPTS = 3;  // Max refinement loops
```

### LLM Models

Configure in utility files:

```typescript
// For general queries
const llm = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.7,
});

// For mathematical accuracy
const llmMath = new ChatOpenAI({
  modelName: 'gpt-4o',
  temperature: 0.2,  // Lower temperature for precision
});
```

## 📊 Analytics & Monitoring

### View System Performance

```typescript
import { getSystemAnalytics } from '@/lib/ai/utils/analytics';

const analytics = await getSystemAnalytics({
  start: new Date('2025-01-01'),
  end: new Date('2025-12-31'),
});

// Returns:
// - totalUsers, totalWorkflows
// - successRate, avgResponseTime
// - popularSubjects, popularModes
// - subjectPerformance metrics
```

### User Analytics

```typescript
import { getUserAnalytics } from '@/lib/ai/utils/analytics';

const userStats = await getUserAnalytics(userId);

// Returns:
// - totalQueries, totalWorkflows
// - successRate, avgResponseTime
// - subjectBreakdown, modeBreakdown
// - recentEvents
```

## 🎯 Modes

### Research Mode
- General academic research
- Multiple source citations
- Comprehensive explanations

### Subject Solvers
- **Math Solver**: Algebra, calculus, geometry, statistics
- **Physics Solver**: Mechanics, electromagnetism, thermodynamics
- **Chemistry Solver**: Reactions, equations, stoichiometry

### Content Creators
- **Quiz Creator**: Multiple choice, short answer, true/false
- **Exam Builder**: Comprehensive exams with grading rubrics
- **Slide Generator**: Presentation slides from topics
- **Poster Generator**: Educational posters and infographics

## 🧠 Self-Learning Mechanism

### How It Learns

1. **Query Refinement Learning**
   - Tracks successful query refinements
   - Builds pattern library
   - Applies patterns to new queries

2. **Evaluation Scoring**
   - Self-evaluates answer quality
   - Triggers re-generation if needed
   - Learns from user feedback

3. **Feedback Integration**
   - User thumbs up/down → updates scores
   - Corrections → improves future responses
   - High-frequency queries → optimized paths

4. **Analytics-Driven**
   - Identifies weak areas
   - Optimizes slow operations
   - Adapts to usage patterns

## 🔒 Security & Privacy

- **Role-Based Access**: Students see only public documents
- **Document Ownership**: Teachers control their uploads
- **Data Privacy**: User conversations are private
- **API Key Security**: Environment variables only

## 🚧 Future Enhancements

- [ ] Multi-language support
- [ ] Voice input/output
- [ ] Real-time collaboration
- [ ] Advanced math notation (LaTeX rendering)
- [ ] Image-based problem solving (OCR)
- [ ] Peer learning recommendations
- [ ] Gamification (points, badges)
- [ ] Integration with existing exam system

## 📝 API Reference

### Server Actions (to be created)

```typescript
// AI Playground server actions
export async function queryAI(query: string, options: QueryOptions);
export async function uploadDocument(formData: FormData);
export async function generateQuiz(topic: string, options: QuizOptions);
export async function generateExam(topics: string[], options: ExamOptions);
export async function submitFeedback(messageId: string, feedback: Feedback);
export async function getConversationHistory(userId: string);
export async function deleteConversation(conversationId: string);
```

## 🤝 Contributing

When adding new features:

1. **Add new nodes** to the LangGraph workflow
2. **Create utilities** in `src/lib/ai/utils/`
3. **Update schema** if new data models needed
4. **Add tests** for new functionality
5. **Document** in this README

## 📖 Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [LangChain JS Docs](https://js.langchain.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Prisma Documentation](https://www.prisma.io/docs)

## 🐛 Troubleshooting

### Common Issues

**Prisma migration fails**
```bash
PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma migrate dev
```

**OpenAI API rate limits**
- Upgrade your OpenAI plan
- Implement request queuing
- Use caching for common queries

**Vector search slow**
- Add database indexes
- Reduce TOP_K value
- Optimize chunk sizes

**Low answer quality**
- Upload more relevant documents
- Adjust MIN_EVALUATION_SCORE
- Review feedback patterns

## 📜 License

Same as main project license.

---

Built with ❤️ using LangGraphJS and Next.js 14
