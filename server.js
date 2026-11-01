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

console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post("/api/analyze", async (req, res) => {
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

    // Prompt hướng dẫn chi tiết bắt buộc AI đọc OCR ảnh
    const systemInstruction = `
Bạn là chuyên gia an ninh mạng và phòng chống lừa đảo.

NHIỆM VỤ:
BƯỚC 1: TRÍCH XUẤT VÀ PHÂN TÍCH NỘI DUNG (QUAN TRỌNG)
- Nếu có hình ảnh/tệp: Bạn PHẢI đọc kỹ và trích xuất toàn bộ văn bản (OCR) xuất hiện trong đó (kể cả chữ nhỏ, mờ, watermark). Viết phần văn bản đọc được này lên đầu.
- Nếu là văn bản/URL: Đọc trực tiếp.

BƯỚC 2: PHÂN TÍCH VÀ ĐÁNH GIÁ RỦI RO
- Kiểm tra các dấu hiệu lừa đảo, giả mạo thương hiệu, yêu cầu chuyển tiền/OTP.
- Đưa ra kết luận mức độ: LOW (Thấp), MEDIUM (Trung bình), hoặc HIGH (Cao) kèm khuyến nghị cụ thể.
`;

    contents.push(
      promptText
        ? `${systemInstruction}\n\nYêu cầu thêm từ người dùng: ${promptText}`
        : systemInstruction,
    );

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash", // Cập nhật tên model mới theo thông báo lỗi
      contents: contents,
    });
    res.json({ success: true, result: response.text });
  } catch (error) {
    console.error("Lỗi khi gọi Gemini AI:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// const PORT = 3000;
// app.listen(PORT, () => {
//   console.log(`Server Backend đang chạy tại: http://localhost:${PORT}`);
// });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
