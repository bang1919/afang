import { GoogleGenerativeAI } from "@google/generative-ai";

// Use a fallback to avoid "process is not defined" errors in some environments
const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) 
  ? process.env.GEMINI_API_KEY 
  : (import.meta as any).env?.VITE_GEMINI_API_KEY || "";

const genAI = new GoogleGenerativeAI(apiKey);

export async function summarizeSession(studentName: string, sessionNum: number, content: string) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = `당신은 커뮤니케이션·스피치 코칭 기록 전문 어시스턴트입니다.
코치가 ${sessionNum}회기 세션 후 기록한 내용을 간결하게 구조화해주세요.
수강생: ${studentName}
기록 내용: "${content}"

아래 형식으로 정리하세요 (항목별 1~2줄, 내용이 없으면 생략):
• 핵심 작업:
• 관찰된 변화:
• 다음 포인트:

군더더기 없이 실용적으로 작성해주세요.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("AI 요약 중 오류가 발생했습니다.");
  }
}
