/**
 * Poster Generator
 * Generates educational posters and infographics
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { retrieveDocuments } from "../utils/vector-store";

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.8,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export interface PosterSection {
  type: "title" | "text" | "list" | "diagram" | "fact" | "quote" | "image";
  content: string | string[];
  position?: { x: number; y: number; width: number; height: number };
  style?: any;
}

export interface Poster {
  title: string;
  subtitle?: string;
  topic: string;
  sections: PosterSection[];
  layout: "portrait" | "landscape";
  colorScheme?: string[];
  theme?: string;
  metadata?: any;
}

export interface PosterOptions {
  subject?: string;
  gradeLevel?: number;
  layout?: "portrait" | "landscape";
  style?: "modern" | "classic" | "colorful" | "minimal" | "infographic";
  colorScheme?: string[];
  includeDiagrams?: boolean;
  includeFacts?: boolean;
}

/**
 * Generate educational poster
 */
export async function generatePoster(
  topic: string,
  options: PosterOptions = {}
): Promise<Poster> {
  const {
    subject,
    gradeLevel,
    layout = "portrait",
    style = "colorful",
    includeDiagrams = true,
    includeFacts = true,
  } = options;

  try {
    // Retrieve relevant documents
    const documents = await retrieveDocuments(topic, {
      subject,
      gradeLevel,
      userRole: "teacher",
      topK: 5,
    });

    // Prepare context
    const context = documents
      .map((doc) => `[${doc.metadata.documentTitle}]\n${doc.content}`)
      .join("\n\n---\n\n");

    // Create prompt
    const posterPrompt = PromptTemplate.fromTemplate(`
You are an expert graphic designer creating an educational poster.

TOPIC: {topic}
SUBJECT: {subject}
GRADE LEVEL: {gradeLevel}
LAYOUT: {layout}
STYLE: {style}

CONTEXT FROM EDUCATIONAL MATERIALS:
{context}

Create a visually appealing and educational poster that captures the key concepts.

Poster Requirements:
1. Clear, eye-catching title
2. Concise, informative content
3. Visual hierarchy
4. 3-5 main sections/blocks
5. Include interesting facts
6. Suggest diagrams/illustrations
7. Use age-appropriate language

Format as JSON:
{{
  "title": "Poster Title",
  "subtitle": "Subtitle if needed",
  "topic": "{topic}",
  "layout": "{layout}",
  "colorScheme": ["#color1", "#color2", "#color3"],
  "sections": [
    {{
      "type": "title",
      "content": "Main Title"
    }},
    {{
      "type": "text",
      "content": "Introductory paragraph"
    }},
    {{
      "type": "list",
      "content": ["Key point 1", "Key point 2", "Key point 3"]
    }},
    {{
      "type": "diagram",
      "content": "Description of diagram to create"
    }},
    {{
      "type": "fact",
      "content": "Interesting fact or statistic"
    }},
    {{
      "type": "quote",
      "content": "Relevant quote if applicable"
    }}
  ]
}}

Generate the poster design now:`);

    const chain = posterPrompt.pipe(llm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      topic,
      subject: subject || "General",
      gradeLevel: gradeLevel || "Not specified",
      layout,
      style,
      context: context || "No specific context available - use general knowledge",
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse poster JSON from response");
    }

    const poster: Poster = JSON.parse(jsonMatch[0]);

    // Add default color schemes if not provided
    if (!poster.colorScheme) {
      poster.colorScheme = getColorScheme(style);
    }

    // Add metadata
    poster.theme = style;
    poster.metadata = {
      topic,
      subject,
      gradeLevel,
      generatedAt: new Date().toISOString(),
    };

    return poster;
  } catch (error: any) {
    console.error("Error generating poster:", error);
    throw new Error(`Poster generation failed: ${error.message}`);
  }
}

/**
 * Generate infographic (data-focused poster)
 */
export async function generateInfographic(
  topic: string,
  data: any[],
  options: PosterOptions
): Promise<Poster> {
  const poster = await generatePoster(topic, {
    ...options,
    style: "infographic",
  });

  // Add data visualization sections
  poster.sections.push(
    {
      type: "diagram",
      content: "Chart showing: " + JSON.stringify(data).slice(0, 100),
    },
    {
      type: "fact",
      content: `Based on ${data.length} data points`,
    }
  );

  return poster;
}

/**
 * Get color scheme based on style
 */
function getColorScheme(style: string): string[] {
  const schemes: Record<string, string[]> = {
    modern: ["#2c3e50", "#3498db", "#ecf0f1", "#e74c3c"],
    classic: ["#34495e", "#7f8c8d", "#bdc3c7", "#95a5a6"],
    colorful: ["#e74c3c", "#f39c12", "#2ecc71", "#3498db", "#9b59b6"],
    minimal: ["#000000", "#ffffff", "#95a5a6"],
    infographic: ["#1abc9c", "#3498db", "#e74c3c", "#f39c12"],
  };

  return schemes[style] || schemes.colorful;
}

/**
 * Validate poster structure
 */
export function validatePoster(poster: Poster): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!poster.title) errors.push("Poster must have a title");
  if (!poster.topic) errors.push("Poster must have a topic");
  if (!poster.sections || poster.sections.length === 0) {
    errors.push("Poster must have at least one section");
  }

  poster.sections.forEach((section, idx) => {
    if (!section.type) errors.push(`Section ${idx + 1}: Missing type`);
    if (!section.content) errors.push(`Section ${idx + 1}: Missing content`);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export poster to different formats
 */
export function exportPosterToJSON(poster: Poster): string {
  return JSON.stringify(poster, null, 2);
}

export function exportPosterToHTML(poster: Poster): string {
  const colors = poster.colorScheme || ["#3498db", "#e74c3c", "#2ecc71"];

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${poster.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Arial', sans-serif;
      background: linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%);
      color: #333;
    }
    .poster {
      width: ${poster.layout === "portrait" ? "800px" : "1200px"};
      min-height: ${poster.layout === "portrait" ? "1200px" : "800px"};
      margin: 40px auto;
      background: white;
      padding: 60px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .poster-title {
      text-align: center;
      font-size: 3em;
      color: ${colors[0]};
      margin-bottom: 20px;
      font-weight: bold;
      text-transform: uppercase;
      border-bottom: 5px solid ${colors[1]};
      padding-bottom: 20px;
    }
    .poster-subtitle {
      text-align: center;
      font-size: 1.5em;
      color: ${colors[2] || "#666"};
      margin-bottom: 40px;
    }
    .section {
      margin: 30px 0;
    }
    .section-title {
      font-size: 1.8em;
      color: ${colors[0]};
      margin-bottom: 15px;
      border-left: 5px solid ${colors[1]};
      padding-left: 15px;
    }
    .section-text {
      font-size: 1.2em;
      line-height: 1.8;
      color: #555;
      margin: 15px 0;
    }
    .section-list {
      font-size: 1.2em;
      margin-left: 30px;
      line-height: 2;
    }
    .section-list li {
      margin: 10px 0;
      color: #444;
    }
    .section-fact {
      background: linear-gradient(135deg, ${colors[0]}, ${colors[1]});
      color: white;
      padding: 25px;
      border-radius: 10px;
      font-size: 1.3em;
      font-weight: bold;
      text-align: center;
      margin: 30px 0;
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    }
    .section-quote {
      border-left: 5px solid ${colors[1]};
      padding: 20px;
      font-style: italic;
      font-size: 1.3em;
      background: #f8f9fa;
      margin: 30px 0;
      border-radius: 5px;
    }
    .section-diagram {
      background: #f0f0f0;
      padding: 40px;
      border-radius: 10px;
      text-align: center;
      font-size: 1.2em;
      color: #666;
      margin: 30px 0;
      border: 3px dashed ${colors[0]};
    }
  </style>
</head>
<body>
  <div class="poster">
    <h1 class="poster-title">${poster.title}</h1>
    ${poster.subtitle ? `<p class="poster-subtitle">${poster.subtitle}</p>` : ""}
`;

  poster.sections.forEach((section) => {
    html += `    <div class="section">\n`;

    switch (section.type) {
      case "text":
        html += `      <p class="section-text">${section.content}</p>\n`;
        break;

      case "list":
        if (Array.isArray(section.content)) {
          html += `      <ul class="section-list">\n`;
          section.content.forEach((item) => {
            html += `        <li>${item}</li>\n`;
          });
          html += `      </ul>\n`;
        }
        break;

      case "fact":
        html += `      <div class="section-fact">💡 ${section.content}</div>\n`;
        break;

      case "quote":
        html += `      <blockquote class="section-quote">"${section.content}"</blockquote>\n`;
        break;

      case "diagram":
        html += `      <div class="section-diagram">📊 ${section.content}</div>\n`;
        break;
    }

    html += `    </div>\n`;
  });

  html += `
  </div>
</body>
</html>`;

  return html;
}

export function exportPosterToSVG(poster: Poster): string {
  const width = poster.layout === "portrait" ? 800 : 1200;
  const height = poster.layout === "portrait" ? 1200 : 800;
  const colors = poster.colorScheme || ["#3498db", "#e74c3c", "#2ecc71"];

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="white"/>

  <!-- Title -->
  <text x="${width / 2}" y="80" font-size="48" font-weight="bold" text-anchor="middle" fill="${colors[0]}">
    ${poster.title}
  </text>
`;

  if (poster.subtitle) {
    svg += `  <text x="${width / 2}" y="130" font-size="24" text-anchor="middle" fill="${colors[1]}">
    ${poster.subtitle}
  </text>\n`;
  }

  // Add sections (simplified positioning)
  let yPosition = 200;

  poster.sections.forEach((section, idx) => {
    if (section.type === "text") {
      svg += `  <text x="50" y="${yPosition}" font-size="18" fill="#333">
    ${String(section.content).slice(0, 80)}...
  </text>\n`;
      yPosition += 40;
    } else if (section.type === "fact") {
      svg += `  <rect x="50" y="${yPosition - 20}" width="${width - 100}" height="60" fill="${colors[0]}" rx="10"/>
  <text x="${width / 2}" y="${yPosition + 10}" font-size="20" font-weight="bold" text-anchor="middle" fill="white">
    ${section.content}
  </text>\n`;
      yPosition += 80;
    }
  });

  svg += `</svg>`;

  return svg;
}

/**
 * Create poster template
 */
export function createPosterTemplate(
  layout: "portrait" | "landscape",
  style: string
): Poster {
  return {
    title: "[Your Title Here]",
    subtitle: "[Your Subtitle]",
    topic: "[Topic]",
    layout,
    theme: style,
    colorScheme: getColorScheme(style),
    sections: [
      {
        type: "title",
        content: "[Main Title]",
      },
      {
        type: "text",
        content: "[Introduction text]",
      },
      {
        type: "list",
        content: ["[Point 1]", "[Point 2]", "[Point 3]"],
      },
      {
        type: "fact",
        content: "[Interesting fact]",
      },
    ],
  };
}

/**
 * Generate poster from template
 */
export async function generateFromTemplate(
  template: Poster,
  topic: string,
  options: PosterOptions
): Promise<Poster> {
  const generated = await generatePoster(topic, options);

  // Merge template layout with generated content
  return {
    ...template,
    title: generated.title,
    subtitle: generated.subtitle,
    topic: generated.topic,
    sections: generated.sections,
  };
}
