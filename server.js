import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config({ path: "./api.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Serving from:", __dirname);

const app = express();
app.use(cors());

// Server file tĩnh
app.use(express.static(__dirname));

// Trang chủ
app.get("/", (req, res) => {
  console.log("GET /");
  res.sendFile(path.resolve(__dirname, "index.html"));
});

// Tăng giới hạn dung lượng để nhận tệp ảnh kích thước lớn
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// THÊM ĐOẠN NÀY NGAY SAU const ai

const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

const SYSTEM_INSTRUCTION = `
  Bạn là chuyên gia an ninh mạng và phòng chống lừa đảo.
  
  NHIỆM VỤ:
  BƯỚC 1: TRÍCH XUẤT VÀ PHÂN TÍCH NỘI DUNG (QUAN TRỌNG)
  - Nếu có hình ảnh/tệp: Bạn PHẢI đọc kỹ và trích xuất toàn bộ văn bản (OCR) xuất hiện trong đó (kể cả chữ nhỏ, mờ, watermark). Viết phần văn bản đọc được này lên đầu.
  - Nếu là văn bản/URL: Đọc trực tiếp.
  
  BƯỚC 2: PHÂN TÍCH VÀ ĐÁNH GIÁ RỦI RO
  - Kiểm tra các dấu hiệu lừa đảo, giả mạo thương hiệu, yêu cầu chuyển tiền/OTP.
  - Đưa ra kết luận mức độ: LOW (Thấp), MEDIUM (Trung bình), hoặc HIGH (Cao) kèm khuyến nghị cụ thể.
  `;

async function generateWithFallback(contents) {
  let lastError;

  for (const model of MODELS) {
    try {
      const t0 = Date.now();
      console.log(`[${new Date().toISOString()}] Trying model: ${model}`);

      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          maxOutputTokens: 2048,
          // Tắt/giảm "thinking" để giảm độ trễ. Nếu model báo lỗi vì field
          // này không được hỗ trợ ở phiên bản SDK/model đang dùng, báo lại
          // thông báo lỗi để đổi tên tham số cho đúng.
          thinkingConfig: {
            thinkingLevel: "low",
          },
        },
      });

      const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`Success with ${model} (${elapsedSec}s)`);
      if (response.usageMetadata) {
        const { promptTokenCount, thoughtsTokenCount, candidatesTokenCount } =
          response.usageMetadata;
        console.log(
          `  tokens -> prompt: ${promptTokenCount}, thoughts: ${
            thoughtsTokenCount ?? 0
          }, output: ${candidatesTokenCount}`
        );
      }
      return response;
    } catch (error) {
      console.error(`${model} failed:`, error.status, error.message);
      lastError = error;

      if (error.status !== 503) {
        throw error;
      }
    }
  }

  throw lastError;
}

app.post("/api/analyze", async (req, res) => {
  const reqStart = Date.now();
  console.log(`[${new Date().toISOString()}] POST /api/analyze received`);
  try {
    const { promptText, fileData, mimeType } = req.body;

    let contents = [];

    // Nếu có tệp dữ liệu đính kèm (hình ảnh, âm thanh, video)
    if (fileData) {
      contents.push({
        inlineData: {
          data: fileData,
          mimeType: mimeType || "image/jpeg",
        },
      });
    }

    contents.push(
      promptText
        ? `Yêu cầu thêm từ người dùng: ${promptText}`
        : "Hãy phân tích nội dung được đính kèm."
    );

    const response = await generateWithFallback(contents);
    console.log(
      `Total request time: ${((Date.now() - reqStart) / 1000).toFixed(1)}s`
    );
    res.json({ success: true, result: response.text });
  } catch (error) {
    console.error("Lỗi khi gọi Gemini AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
